import { METRICS, type Metric } from '@indoorkit/museum';
import { floorPlugin, unitStatePlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { useMapEvent } from '../../../app/map';
import { parseClockParam } from '../../adapters/clock';
import { ENV_STATES, type EnvState, envReadings } from '../../adapters/live';
import { useMuseumT } from '../../i18n';
import { codeOf, MuseumMapLayout, useMuseumMap, useTick } from '../../map';
import { ENV_COLORS } from '../../presentation/colors';
import { ChoiceChips, Legend, Metric as MetricText } from '../../presentation/ui';
import type { MuseumPageProps } from '../../routes';
import { EnvDrawer, RoomList } from './view';

type Readings = Map<string, { value: number | null; state: EnvState }>;

/** 保存环境：展示室、展示柜和收藏库按当前指标着色，点开看 24 小时曲线 */
export function EnvironmentPage({ query }: MuseumPageProps) {
  const t = useMuseumT();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMuseumMap(stageRef, {
    page: 'environment',
    floor: '2F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: () => [floorPlugin, unitStatePlugin({ colors: ENV_COLORS, order: ENV_STATES })] as const,
  });
  const [metric, setMetric] = useState<Metric>('humidity');
  const [time, setTime] = useState(0);
  const [readings, setReadings] = useState<Readings | null>(null);
  const [online, setOnline] = useState<{ up: number; total: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const paint = (at: number, m: Metric) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const all = ctx.day.readings(at);
    const next = envReadings(ctx.museum, all, m);
    indoor.plugins['unit-state'].setStates([...next].map(([id, r]) => [id, r.state] as const));
    hooks.stateCounts = () =>
      Object.fromEntries(ENV_STATES.map((s) => [s, [...next.values()].filter((r) => r.state === s).length]));
    hooks.stateOf = (code) => {
      const unit = [...next.keys()].find((id) => codeOf(ctx, id) === code);
      return unit ? next.get(unit)!.state : null;
    };
    setOnline({ up: all.filter((r) => r.online).length, total: all.length });
    setReadings(next);
    setTime(at);
  };

  useTick(page, 1000, (at) => {
    if (!page) return;
    paint(at, metric);
    if (!readings) void page.indoor.rendered().then(() => (page.hooks.ready = true));
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换指标时立即重画，不等下一拍
  useEffect(() => {
    if (page) paint(page.ctx.clock.time(), metric);
  }, [page, metric]);

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    hooks.highlighted = () => indoor.plugins['unit-state'].highlighted().map((id) => codeOf(ctx, id));
    hooks.markerCount = () => 0;
  }, [page]);

  const select = (unitId: string | null) => {
    setSelected(unitId);
    if (!page) return;
    page.indoor.plugins['unit-state'].highlight(unitId ? [unitId] : null);
    if (unitId) {
      const { museum } = page.ctx;
      const where = museum.isCase(unitId) ? museum.case(unitId) : museum.room(unitId);
      page.floor.set(where.levelId);
    }
  };

  useMapEvent(page, 'map:click', ({ coord }) => {
    const id = page!.indoor.plugins['unit-state'].unitAt(coord);
    if (id && readings?.has(id)) select(id);
  });

  const values = readings ? [...readings.values()] : [];
  const inRange = values.filter((r) => r.state === 'ok').length;
  const outOfRange = values.filter((r) => r.state === 'above' || r.state === 'below').length;

  return (
    <MuseumMapLayout
      title="page.environment.title"
      desc="page.environment.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <MetricText label={t('env.inRange')} testId="in-range" value={inRange} />
          <MetricText label={t('env.outOfRange')} testId="out-of-range" value={outOfRange} />
          <MetricText
            label={t('env.online')}
            testId="sensor-online"
            value={online ? `${online.up} / ${online.total}` : ''}
          />
          <ChoiceChips
            testId="metric-chip"
            label={t('control.metric')}
            items={METRICS.map((m) => ({ value: m, text: t(`metric.${m}`) }))}
            selected={metric}
            onChange={setMetric}
          />
        </>
      }
    >
      <aside className="panel">
        <Legend items={ENV_STATES.map((s) => ({ color: ENV_COLORS[s], text: t(`env.${s}`) }))} />
        {page && readings && (
          <RoomList ctx={page.ctx} readings={readings} selected={selected} onSelect={select} />
        )}
      </aside>
      {page && readings && selected && (
        <EnvDrawer
          ctx={page.ctx}
          unitId={selected}
          metric={metric}
          time={time}
          floor={page.floor}
          onClose={() => select(null)}
        />
      )}
    </MuseumMapLayout>
  );
}
