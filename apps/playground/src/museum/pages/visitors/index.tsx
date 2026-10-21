import { createMuseumFeed } from '@indoorkit/museum-simulator';
import {
  floorPlugin,
  heatmapPlugin,
  markerPlugin,
  positionStreamPlugin,
  trailPlugin,
  unitStatePlugin,
} from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { parseClockParam } from '../../adapters/clock';
import { CROWD_STATES, type CrowdState, crowdStates } from '../../adapters/live';
import { useMuseumT } from '../../i18n';
import { codeOf, MuseumMapLayout, useMuseumMap, useTick } from '../../map';
import { CROWD_COLORS } from '../../presentation/colors';
import { ChoiceChips, Legend, Metric } from '../../presentation/ui';
import type { MuseumPageProps } from '../../routes';
import { CrowdList, DwellList, HEAT_WINDOWS, VisitorList } from './view';

const M = 60_000;
const VIEWS = ['live', 'heat', 'dwell'] as const;
type View = (typeof VIEWS)[number];
/** 位置上报间隔（真实时间） */
const INTERVAL_MS = 1000;

/** 来馆者与混雑：各展示室的人数和定员、带标签来馆者的实时位置、热力图和展品前的停留时长 */
export function VisitorsPage({ query }: MuseumPageProps) {
  const t = useMuseumT();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMuseumMap(stageRef, {
    page: 'visitors',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: (ctx) =>
      [
        floorPlugin,
        unitStatePlugin({ colors: CROWD_COLORS, order: CROWD_STATES }),
        heatmapPlugin({ cellMeters: 2, windowsMinutes: HEAT_WINDOWS, window: 30 }),
        positionStreamPlugin({
          provider: createMuseumFeed(ctx.day, { time: ctx.clock.time, intervalMs: INTERVAL_MS }),
          intervalMs: INTERVAL_MS,
          // 上报带的是模拟时刻；600× 时一秒就是十分钟
          clock: ctx.clock.time,
          staleAfterMs: 20 * M,
          circleColor: '#7c3aed',
        }),
        trailPlugin({ stopRadiusMeters: 1.5, stopMinMs: M }),
        markerPlugin,
      ] as const,
  });
  const [view, setView] = useState<View>('live');
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [time, setTime] = useState(0);
  const [states, setStates] = useState<Map<string, CrowdState> | null>(null);
  const [tagged, setTagged] = useState(0);
  const [replaying, setReplaying] = useState<string | null>(null);
  const labels = useRef(new Set<string>());

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const heat = indoor.plugins.heatmap;
    // 打开页面时补上最近一小时的位置，热力图不用等
    const now = ctx.clock.time();
    for (let at = now - 60 * M; at < now; at += M) {
      heat.add({
        time: at,
        positions: ctx.day.taggedAt(at).map((p) => ({ id: p.id, levelId: p.levelId, coord: p.coord })),
      });
    }
    hooks.highlighted = () => indoor.plugins['unit-state'].highlighted().map((id) => codeOf(ctx, id));
    hooks.markerCount = () => indoor.plugins.marker.count();
    hooks.tagCount = () => indoor.plugins['position-stream'].visible().length;
    hooks.heatPointCount = () => heat.pointCount();
  }, [page]);

  useEffect(() => {
    if (!page) return;
    const { indoor } = page;
    indoor.plugins['position-stream'].setVisible(view === 'live');
    indoor.plugins.heatmap.setGroups(view === 'heat' ? null : []);
    if (view !== 'dwell') {
      indoor.plugins.trail.clear();
      setReplaying(null);
    }
  }, [page, view]);

  useEffect(() => {
    page?.indoor.plugins.heatmap.setWindow(windowMinutes);
  }, [page, windowMinutes]);

  useTick(page, 1000, (at) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = crowdStates(ctx.museum, ctx.day, at);
    indoor.plugins['unit-state'].setStates(next);
    hooks.stateCounts = () =>
      Object.fromEntries(CROWD_STATES.map((s) => [s, [...next.values()].filter((v) => v === s).length]));
    hooks.stateOf = (code) => {
      const id = [...next.keys()].find((u) => codeOf(ctx, u) === code);
      return id ? next.get(id)! : null;
    };
    // 每个有定员的房间中央显示「人数 / 定员」
    for (const room of ctx.museum.rooms) {
      if (room.capacity === null || room.kind === 'lobby') continue;
      const id = `count:${room.code}`;
      const label = `${ctx.day.occupancy(room.unitId, at)} / ${room.capacity}`;
      const color = CROWD_COLORS[next.get(room.unitId)!];
      if (labels.current.has(id)) indoor.plugins.marker.update(id, { label, color });
      else {
        indoor.plugins.marker.add({ id, coord: room.center, floor: room.levelId, label, color });
        labels.current.add(id);
      }
    }
    setTagged(ctx.day.taggedAt(at).length);
    if (!states) void indoor.rendered().then(() => (hooks.ready = true));
    setStates(next);
    setTime(at);
  });

  const replay = (id: string | null) => {
    setReplaying(id);
    if (!page) return;
    const { ctx, hooks, indoor, floor } = page;
    const trail = indoor.plugins.trail;
    if (!id) {
      trail.clear();
      hooks.trail = () => null;
      return;
    }
    const samples = ctx.day.samples(id, ctx.clock.time());
    trail.set(samples);
    trail.seek(trail.range()[1]);
    const last = samples.at(-1);
    if (last) floor.set(last.levelId);
    hooks.trail = () => ({ id, stops: trail.stops().length });
  };

  const focusCase = (caseId: string) => {
    if (!page) return;
    const c = page.ctx.museum.case(caseId);
    page.floor.set(c.levelId);
    page.indoor.plugins['unit-state'].highlight([caseId]);
    page.indoor.camera.focus(c.center);
  };

  return (
    <MuseumMapLayout
      title="page.visitors.title"
      desc="page.visitors.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      publicOnly
      controls={
        <>
          <Metric
            label={t('visitors.inside')}
            testId="inside-count"
            value={page ? page.ctx.day.insideAt(time) : 0}
          />
          <Metric
            label={t('visitors.entries')}
            testId="entry-count"
            value={page ? page.ctx.day.entriesUntil(time) : 0}
          />
          <Metric label={t('visitors.tagged')} testId="tagged-count" value={tagged} />
          <ChoiceChips
            testId="view-chip"
            label={t('control.view')}
            items={VIEWS.map((v) => ({ value: v, text: t(`view.${v}`) }))}
            selected={view}
            onChange={setView}
          />
          {view === 'heat' && (
            <ChoiceChips
              testId="window-chip"
              label={t('control.window')}
              items={HEAT_WINDOWS.map((m) => ({ value: m, text: t('control.minutes', { minutes: m }) }))}
              selected={windowMinutes}
              onChange={setWindowMinutes}
            />
          )}
        </>
      }
    >
      <aside className="panel">
        <p className="note" data-testid="visitors-source">
          {t('visitors.source')}
        </p>
        <Legend items={CROWD_STATES.map((s) => ({ color: CROWD_COLORS[s], text: t(`crowd.${s}`) }))} />
        {page && states && view !== 'dwell' && <CrowdList ctx={page.ctx} states={states} time={time} />}
        {page && view === 'dwell' && (
          <>
            <DwellList ctx={page.ctx} time={time} onSelect={focusCase} />
            <VisitorList ctx={page.ctx} time={time} selected={replaying} onSelect={replay} />
          </>
        )}
      </aside>
    </MuseumMapLayout>
  );
}
