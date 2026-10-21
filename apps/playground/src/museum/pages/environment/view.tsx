import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import { CO2_LIMIT, METRICS, type Metric } from '@indoorkit/museum';
import type { FloorApi } from '@indoorkit/plugins';
import { Fragment } from 'react';
import { useLocale } from '../../../app-i18n';
import { type EnvState, humiditySwing } from '../../adapters/live';
import type { MuseumContext } from '../../adapters/venue';
import { useMuseumT } from '../../i18n';
import { levelName, useRoomName } from '../../map';
import { type ChartLine, LineChart } from '../../presentation/chart';
import { UNITS, valueText } from '../../presentation/format';

const H = 3600_000;

type Readings = ReadonlyMap<string, { value: number | null; state: EnvState }>;
const bad = (s: EnvState | undefined) => s === 'above' || s === 'below';

/** 左侧列表：按展览分组的展示室，以及收藏库等其他区域；显示超出范围的房间和展示柜数 */
export function RoomList(props: {
  ctx: MuseumContext;
  readings: Readings;
  selected: string | null;
  onSelect: (unitId: string | null) => void;
}) {
  const t = useMuseumT();
  const locale = useLocale();
  const roomName = useRoomName(props.ctx);
  const { museum } = props.ctx;
  const rooms = museum.rooms.filter((r) => props.readings.has(r.unitId));
  const groups = [
    ...museum.exhibitions.map((e) => ({
      id: e.code,
      title: pickLabel(e.name, languageFallbacks(locale)) ?? e.code,
      rooms: rooms.filter((r) => r.exhibition === e.code),
    })),
    { id: 'other', title: t('env.otherAreas'), rooms: rooms.filter((r) => r.exhibition === null) },
  ].filter((g) => g.rooms.length > 0);
  return (
    <div data-testid="room-list">
      {groups.map((g) => (
        <section key={g.id}>
          <h2>{g.title}</h2>
          <ul className="rows">
            {g.rooms.map((r) => {
              const units = [r.unitId, ...museum.casesIn(r.unitId).map((c) => c.unitId)];
              const count = units.filter((id) => bad(props.readings.get(id)?.state)).length;
              return (
                <li key={r.unitId}>
                  <button
                    type="button"
                    className="row"
                    data-testid="room-row"
                    data-code={r.code}
                    aria-pressed={props.selected === r.unitId}
                    onClick={() => props.onSelect(props.selected === r.unitId ? null : r.unitId)}
                  >
                    <span className="name">{roomName(r.unitId)}</span>
                    <span className="count">
                      {count > 0 ? <em>{t('env.outCount', { count })}</em> : t('env.allOk')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** 标准范围的文字：温湿度是上下限，照度和 CO2 只有上限 */
function rangeText(ctx: MuseumContext, unitId: string, metric: Metric) {
  const { standard } = ctx.museum.standardOf(unitId);
  const u = UNITS[metric];
  if (metric === 'temperature') return `${standard.temperature[0]}–${standard.temperature[1]} ${u}`;
  if (metric === 'humidity') return `${standard.rh[0]}–${standard.rh[1]} ${u}`;
  if (metric === 'illuminance') return `≤ ${standard.maxLux} ${u}`;
  return `≤ ${CO2_LIMIT} ${u}`;
}

function bandOf(ctx: MuseumContext, unitId: string, metric: Metric) {
  const { standard } = ctx.museum.standardOf(unitId);
  if (metric === 'temperature') return { min: standard.temperature[0], max: standard.temperature[1] };
  if (metric === 'humidity') return { min: standard.rh[0], max: standard.rh[1] };
  if (metric === 'illuminance') return { min: null, max: standard.maxLux };
  return { min: null, max: CO2_LIMIT };
}

/**
 * 点房间或展示柜后的抽屉：各项当前值、适用的标准、所选指标的 24 小时曲线和湿度日波动。
 * 展示柜和所在展示室的曲线叠在一起，能看出气密展示柜对湿度的缓冲。
 */
export function EnvDrawer(props: {
  ctx: MuseumContext;
  unitId: string;
  metric: Metric;
  time: number;
  floor: FloorApi;
  onClose: () => void;
}) {
  const t = useMuseumT();
  const roomName = useRoomName(props.ctx);
  const { ctx, unitId, metric, time } = props;
  const { museum, day } = ctx;
  const isCase = museum.isCase(unitId);
  const kase = isCase ? museum.case(unitId) : null;
  const room = museum.roomOf(unitId);
  const { sensitivity } = museum.standardOf(unitId);
  const from = time - 24 * H;
  const series = (id: string, m: Metric) => day.series(id, m, from, time);
  const lines: ChartLine[] = [
    { label: kase ? kase.code : roomName(unitId), kind: 'line-a', points: series(unitId, metric) },
  ];
  if (kase) lines.push({ label: roomName(room.unitId), kind: 'line-b', points: series(room.unitId, metric) });
  const swing = humiditySwing(series(unitId, 'humidity'));
  const current = (m: Metric) => {
    const points = day.series(unitId, m, time, time);
    return points.length ? points[0]!.value : null;
  };
  const shown = METRICS.filter((m) => day.series(unitId, m, time - H, time, H).length > 0 || m === metric);
  return (
    <aside className="drawer" data-testid="env-drawer">
      <header>
        <h2>{kase ? `${kase.code} · ${roomName(room.unitId)}` : roomName(unitId)}</h2>
        <button type="button" className="close" aria-label={t('action.close')} onClick={props.onClose}>
          ×
        </button>
      </header>
      <dl>
        <dt>{t('detail.place')}</dt>
        <dd>
          {levelName(props.floor, room.levelId)} ·{' '}
          {kase
            ? `${t(`case.${kase.kind}`)}（${t(kase.sealed ? 'case.sealed' : 'case.unsealed')}）`
            : t(`room.${room.kind}`)}
        </dd>
        <dt>{t('sensitivity.label')}</dt>
        <dd data-testid="sensitivity">{t(`sensitivity.${sensitivity}`)}</dd>
        {shown.map((m) => (
          <Fragment key={m}>
            <dt>{t(`metric.${m}`)}</dt>
            <dd data-testid={`value-${m}`}>
              {valueText(m, current(m))}
              <span className="muted"> · {t('detail.standard', { range: rangeText(ctx, unitId, m) })}</span>
            </dd>
          </Fragment>
        ))}
        {swing !== null && (
          <>
            <dt>{t('detail.swing')}</dt>
            <dd data-testid="humidity-swing">{valueText('humidity', swing)}</dd>
          </>
        )}
      </dl>
      <h3>{t('detail.chart', { metric: t(`metric.${metric}`) })}</h3>
      <LineChart
        label={t('detail.chart', { metric: t(`metric.${metric}`) })}
        from={from}
        to={time}
        lines={lines}
        band={bandOf(ctx, unitId, metric)}
      />
      {kase?.sealed && metric === 'humidity' && <p className="muted">{t('detail.sealedNote')}</p>}
    </aside>
  );
}
