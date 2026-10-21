import { createParkingFeed, type ParkingFeed, type Visit } from '@indoorkit/parking-simulator';
import { positionStreamPlugin } from '@indoorkit/plugins';
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseClockParam } from '../../adapters/clock';
import { type LiveSnapshot, liveAt } from '../../adapters/venue';
import { bayOutlines, bayPlugins, syncSigns } from '../../bays';
import { useParkingT } from '../../i18n';
import { ParkingMapLayout, useParkingMap, useTick } from '../../map';
import { plateText } from '../../presentation/format';
import { Metric } from '../../presentation/ui';
import type { ParkingPageProps } from '../../routes';
import { plateSetting, usePlatesShown } from '../../settings';
import { EventItem, VehicleCard } from './view';

/** 识别记录最多显示的条数 */
const MAX_EVENTS = 50;
const MAX_RESULTS = 8;
/** 场内行驶的车辆：琥珀色圆点 */
const MOVING_COLOR = '#f59e0b';
const normalize = (s: string) => s.replace(/[\s-]/g, '');

/** 入出库与车辆：识别记录、场内行驶的车、按车牌查询费用 */
export function VehiclesPage({ query }: ParkingPageProps) {
  const t = useParkingT();
  const platesShown = usePlatesShown();
  const stageRef = useRef<HTMLDivElement>(null);
  const feed = useRef<ParkingFeed | null>(null);
  const [page, load] = useParkingMap(stageRef, {
    page: 'vehicles',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: (ctx) => {
      feed.current = createParkingFeed(ctx.day, {
        startAt: ctx.clock.time(),
        intervalMs: 1000,
        speed: ctx.clock.speed(),
      });
      return [
        ...bayPlugins(ctx),
        positionStreamPlugin({ provider: feed.current, intervalMs: 1000, circleColor: MOVING_COLOR }),
      ] as const;
    },
  });
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [search, setSearch] = useState('');
  const [visit, setVisit] = useState<Visit | null>(null);
  const signs = useRef(new Set<string>());

  // 倍速变了，行驶中的车跟着变
  useEffect(() => {
    if (!page) return;
    const { clock } = page.ctx;
    return clock.subscribe(() => feed.current?.setSpeed(clock.speed()));
  }, [page]);

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    indoor.plugins['unit-state'].setOutlines(bayOutlines(ctx));
    hooks.highlighted = () =>
      indoor.plugins['unit-state'].highlighted().map((id) => ctx.parking.bay(id).code);
    hooks.markerCount = () => indoor.plugins.marker.count();
  }, [page]);

  useTick(page, 1000, (time) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = liveAt(ctx, time);
    indoor.plugins['unit-state'].setStates(next.states);
    syncSigns(ctx, indoor.plugins.marker, next, signs.current);
    hooks.parkedPlate = () =>
      next.parked.find((p) => p.parkedAt >= 0 && p.vehicle.contract.kind === 'hourly')!.vehicle.plate;
    if (!live) void indoor.rendered().then(() => (hooks.ready = true));
    setLive(next);
  });

  const now = live?.time ?? 0;
  const day = page?.ctx.day;
  const events = useMemo(() => (day ? day.events(-Infinity, now) : []), [day, now]);
  const today = useMemo(() => events.filter((e) => e.time >= 0), [events]);
  const inLot = useMemo(
    () => (day ? day.visits.filter((v) => v.enteredAt <= now && now < v.exitedAt) : []),
    [day, now],
  );
  const results = useMemo(() => {
    const q = normalize(search);
    if (!day || q.length < 2) return [];
    return day.visits
      .filter((v) => v.enteredAt <= now && normalize(v.vehicle.plate).includes(q))
      .sort((a, b) => b.enteredAt - a.enteredAt)
      .slice(0, MAX_RESULTS);
  }, [day, now, search]);

  const select = (v: Visit) => {
    setVisit(v);
    if (!page) return;
    const bay = page.ctx.parking.bay(v.bayId);
    page.floor.set(bay.levelId);
    page.indoor.plugins['unit-state'].highlight([bay.id]);
    page.indoor.camera.focus(bay.center);
  };
  const selectById = (visitId: string) => day && select(day.visit(visitId));

  return (
    <ParkingMapLayout
      title="page.vehicles.title"
      desc="page.vehicles.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <Metric
            label={t('metric.entries')}
            testId="entries-today"
            value={today.filter((e) => e.kind === 'entry').length}
          />
          <Metric
            label={t('metric.exits')}
            testId="exits-today"
            value={today.filter((e) => e.kind === 'exit').length}
          />
          <Metric label={t('metric.inLot')} testId="in-lot" value={inLot.length} />
          <Metric
            label={t('metric.unpaid')}
            testId="unpaid-in-lot"
            value={inLot.filter((v) => v.payment !== 'contract').length}
          />
          <button
            type="button"
            className="chip"
            data-testid="mask-toggle"
            aria-pressed={platesShown}
            onClick={() => plateSetting.set(platesShown ? 'masked' : 'shown')}
          >
            {t('control.showPlates')}
          </button>
        </>
      }
    >
      <aside className="panel event-panel">
        <input
          className="search"
          type="search"
          data-testid="plate-search"
          placeholder={t('search.plate')}
          aria-label={t('search.plate')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.length >= 2 && (
          <ul className="results">
            {results.length === 0 && <li className="muted">{t('search.none')}</li>}
            {results.map((v) => (
              <li key={v.id}>
                <button type="button" className="row" data-testid="plate-result" onClick={() => select(v)}>
                  <span>{plateText(v.vehicle.plate, platesShown)}</span>
                  <span className="muted">{page?.ctx.parking.bay(v.bayId).code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <h2>{t('panel.events')}</h2>
        <ul className="event-feed" data-testid="event-list">
          {page &&
            events
              .slice(-MAX_EVENTS)
              .reverse()
              .map((e) => (
                <EventItem
                  key={`${e.visitId}:${e.kind}`}
                  event={e}
                  parking={page.ctx.parking}
                  platesShown={platesShown}
                  onSelect={() => selectById(e.visitId)}
                />
              ))}
        </ul>
      </aside>
      {page && visit && (
        <VehicleCard
          visit={visit}
          parking={page.ctx.parking}
          now={now}
          platesShown={platesShown}
          onClose={() => {
            setVisit(null);
            page.indoor.plugins['unit-state'].highlight(null);
          }}
        />
      )}
    </ParkingMapLayout>
  );
}
