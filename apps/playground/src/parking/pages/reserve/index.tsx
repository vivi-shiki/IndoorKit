import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import {
  type EventBooking,
  type FleetAllocation,
  type FleetBooking,
  type Occupancy,
  type Reservation,
  type Route,
  SLOT_MS,
  type VehicleClass,
} from '@indoorkit/parking';
import { routePlugin } from '@indoorkit/plugins';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../../app-i18n';
import { parseClockParam } from '../../adapters/clock';
import { type LiveSnapshot, liveAt } from '../../adapters/venue';
import { bayOutlines, bayPlugins, syncSigns } from '../../bays';
import { useParkingT } from '../../i18n';
import { levelName, ParkingMapLayout, useParkingMap, useTick } from '../../map';
import type { ParkingPageProps } from '../../routes';
import { DurationSelect, Field, ResultRow, StartSelect, slotsFrom } from './view';

const VEHICLES: readonly VehicleClass[] = ['standard', 'large', 'ev'];
const TABS = ['driver', 'fleet', 'event'] as const;
type TabId = (typeof TABS)[number];
/** 默认包场的区：屋顶层的普通区 */
const EVENT_ZONE = '4F-C';

/** 预约与导航：司机预约车位并查看路线；法人批量手配；活动包场 */
export function ReservePage({ query }: ParkingPageProps) {
  const t = useParkingT();
  const locale = useLocale();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useParkingMap(stageRef, {
    page: 'reserve',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: (ctx) => [...bayPlugins(ctx), routePlugin()] as const,
  });
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [tab, setTab] = useState<TabId>('driver');
  const signs = useRef(new Set<string>());

  // 打开页面时的下一个 15 分钟时刻
  const [start, setStart] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(60);
  const [vehicle, setVehicle] = useState<VehicleClass>('standard');
  const [accessible, setAccessible] = useState(false);
  const [nearExit, setNearExit] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [route, setRoute] = useState<Route | null>(null);

  const [company, setCompany] = useState<string | null>(null);
  const [count, setCount] = useState(6);
  const [fleetHours, setFleetHours] = useState(480);
  const [allocation, setAllocation] = useState<FleetAllocation | null>(null);
  const [fleet, setFleet] = useState<FleetBooking | null>(null);

  const [eventZone, setEventZone] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<string | null>(null);
  const [eventHours, setEventHours] = useState(180);
  const [eventResult, setEventResult] = useState<
    { ok: true; booking: EventBooking } | { ok: false; conflicts: Reservation[] } | null
  >(null);

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    indoor.plugins['unit-state'].setOutlines(bayOutlines(ctx));
    hooks.highlighted = () =>
      indoor.plugins['unit-state'].highlighted().map((id) => ctx.parking.bay(id).code);
    hooks.markerCount = () => indoor.plugins.marker.count();
    hooks.routeLevels = () => indoor.plugins.route.levels().map((id) => levelName(page.floor, id));
    hooks.routeMeters = () => indoor.plugins.route.length();
    setStart(Math.ceil((ctx.clock.time() + SLOT_MS) / SLOT_MS) * SLOT_MS);
    setEventZone(ctx.parking.zoneByCode(EVENT_ZONE).id);
  }, [page]);

  useTick(page, 1000, (time) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = liveAt(ctx, time);
    indoor.plugins['unit-state'].setStates(next.states);
    syncSigns(ctx, indoor.plugins.marker, next, signs.current);
    if (!live) void indoor.rendered().then(() => (hooks.ready = true));
    setLive(next);
  });

  if (!page || !live || start === null) {
    return (
      <ParkingMapLayout
        title="page.reserve.title"
        desc="page.reserve.desc"
        stageRef={stageRef}
        page={page}
        load={load}
        controls={null}
      >
        <aside className="panel reserve-panel" />
      </ParkingMapLayout>
    );
  }

  const { ctx, indoor, floor } = page;
  const { parking, bookings } = ctx;
  const occupancy: Occupancy = { now: live.time, occupied: new Set(live.parked.map((p) => p.bayId)) };
  const slots = slotsFrom(live.time + SLOT_MS);
  const from = Math.max(start, slots[0] ?? start);
  const span = (m: number) => ({ from, to: Math.min(from + m * 60_000, 24 * 3600_000) });
  const request = { ...span(minutes), vehicle, accessible, nearExit };
  // 当天已经没有可选的时刻（深夜）时不能预约
  const open = slots.length > 0;
  const offered = open ? bookings.available(request, occupancy) : [];
  const zoneLabel = (zoneId: string) => {
    const z = parking.zone(zoneId);
    return `${levelName(floor, z.levelId)} · ${pickLabel(z.name, languageFallbacks(locale)) ?? z.code}`;
  };

  const showBays = (ids: readonly string[] | null) => indoor.plugins['unit-state'].highlight(ids);

  const reserve = () => {
    const r = bookings.reserve(request, occupancy);
    const path = ctx.router.toBay(r.bayId);
    indoor.plugins.route.set(path.points.map((p) => ({ floor: p.levelId, coord: p.coord })));
    floor.set(path.levels[0]!);
    showBays([r.bayId]);
    setReservation(r);
    setRoute(path);
  };
  const cancel = () => {
    if (!reservation) return;
    bookings.cancel(reservation.id);
    indoor.plugins.route.clear();
    showBays(null);
    setReservation(null);
    setRoute(null);
  };

  const allocate = () => {
    const a = bookings.allocateFleet(
      { company: company ?? t('fleet.defaultCompany'), count, ...span(fleetHours) },
      occupancy,
    );
    setAllocation(a);
    setFleet(null);
    showBays(a.bayIds);
    const first = a.bayIds[0];
    if (first) floor.set(parking.bay(first).levelId);
  };
  const confirmFleet = () => {
    if (!allocation) return;
    setFleet(bookings.confirmFleet(allocation));
  };

  const bookEvent = () => {
    if (!eventZone) return;
    const result = bookings.bookEvent({
      zoneId: eventZone,
      organizer: organizer ?? t('eventBooking.defaultOrganizer'),
      ...span(eventHours),
    });
    setEventResult(result);
    showBays(parking.zone(eventZone).bayIds);
    floor.set(parking.zone(eventZone).levelId);
  };

  return (
    <ParkingMapLayout
      title="page.reserve.title"
      desc="page.reserve.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={null}
    >
      <aside className="panel reserve-panel">
        <Tabs
          value={tab}
          onChange={(_, next: TabId) => {
            setTab(next);
            showBays(null);
          }}
          variant="fullWidth"
          aria-label={t('page.reserve.title')}
        >
          {TABS.map((id) => (
            <Tab key={id} value={id} label={t(`tab.${id}`)} />
          ))}
        </Tabs>

        {tab === 'driver' && (
          <div className="form" role="tabpanel">
            <StartSelect testId="reserve-start" slots={slots} value={from} onChange={setStart} />
            <DurationSelect testId="reserve-duration" value={minutes} onChange={setMinutes} />
            <Field label={t('form.vehicle')}>
              <select
                data-testid="reserve-vehicle"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value as VehicleClass)}
              >
                {VEHICLES.map((v) => (
                  <option key={v} value={v}>
                    {t(`vehicle.${v}`)}
                  </option>
                ))}
              </select>
            </Field>
            <label className="check">
              <input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} />
              {t('form.accessible')}
            </label>
            <label className="check">
              <input type="checkbox" checked={nearExit} onChange={(e) => setNearExit(e.target.checked)} />
              {t('form.nearExit')}
            </label>
            <p className="muted" data-testid="available-count">
              {offered.length > 0 ? t('form.available', { count: offered.length }) : t('form.none')}
            </p>
            <button
              type="button"
              className="primary"
              data-testid="reserve-submit"
              disabled={offered.length === 0}
              onClick={reserve}
            >
              {t('form.reserve')}
            </button>
            {reservation && route && (
              <dl className="result" data-testid="reservation">
                <ResultRow label={t('result.reservation')}>
                  <b data-testid="reservation-id">{reservation.id}</b>
                </ResultRow>
                <ResultRow label={t('result.bay')}>{parking.bay(reservation.bayId).code}</ResultRow>
                <ResultRow label={t('result.drive')}>{Math.round(route.meters)} m</ResultRow>
                <ResultRow label={t('result.floors')}>
                  {route.levels.map((id) => levelName(floor, id)).join(' → ')}
                </ResultRow>
                <ResultRow label={t('result.walk')}>
                  <span data-testid="walk-meters">
                    {Math.round(bookings.walkMeters(reservation.bayId))} m
                  </span>
                </ResultRow>
              </dl>
            )}
            {reservation && (
              <button type="button" className="chip" onClick={cancel}>
                {t('result.cancel')}
              </button>
            )}
          </div>
        )}

        {tab === 'fleet' && (
          <div className="form" role="tabpanel">
            <Field label={t('fleet.company')}>
              <input
                value={company ?? t('fleet.defaultCompany')}
                onChange={(e) => setCompany(e.target.value)}
                data-testid="fleet-company"
              />
            </Field>
            <Field label={t('fleet.count')}>
              <input
                type="number"
                min={1}
                max={60}
                value={count}
                data-testid="fleet-count"
                onChange={(e) => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
            </Field>
            <StartSelect testId="fleet-start" slots={slots} value={from} onChange={setStart} />
            <DurationSelect testId="fleet-duration" value={fleetHours} onChange={setFleetHours} />
            <button
              type="button"
              className="primary"
              data-testid="fleet-allocate"
              disabled={!open}
              onClick={allocate}
            >
              {t('fleet.allocate')}
            </button>
            {allocation && (
              <p data-testid="fleet-result">
                {allocation.fits
                  ? t('fleet.result', {
                      count: allocation.bayIds.length,
                      zones: allocation.zoneIds.map(zoneLabel).join('、'),
                    })
                  : t('fleet.short', { count: allocation.bayIds.length })}
              </p>
            )}
            {allocation && allocation.bayIds.length > 0 && !fleet && (
              <button type="button" className="primary" data-testid="fleet-confirm" onClick={confirmFleet}>
                {t('fleet.confirm')}
              </button>
            )}
            {fleet && (
              <dl className="result">
                <ResultRow label={t('fleet.id')}>
                  <b data-testid="fleet-id">{fleet.id}</b>
                </ResultRow>
              </dl>
            )}
          </div>
        )}

        {tab === 'event' && eventZone && (
          <div className="form" role="tabpanel">
            <Field label={t('eventBooking.zone')}>
              <select
                data-testid="event-zone"
                value={eventZone}
                onChange={(e) => setEventZone(e.target.value)}
              >
                {parking.zones
                  .filter((z) => z.kind !== 'monthly')
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {zoneLabel(z.id)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label={t('eventBooking.organizer')}>
              <input
                value={organizer ?? t('eventBooking.defaultOrganizer')}
                onChange={(e) => setOrganizer(e.target.value)}
              />
            </Field>
            <StartSelect testId="event-start" slots={slots} value={from} onChange={setStart} />
            <DurationSelect testId="event-duration" value={eventHours} onChange={setEventHours} />
            <button
              type="button"
              className="primary"
              data-testid="event-submit"
              disabled={!open}
              onClick={bookEvent}
            >
              {t('eventBooking.submit')}
            </button>
            {eventResult?.ok === true && (
              <dl className="result">
                <ResultRow label={t('eventBooking.id')}>
                  <b data-testid="event-id">{eventResult.booking.id}</b>
                </ResultRow>
              </dl>
            )}
            {eventResult?.ok === false && (
              <p className="warn">{t('eventBooking.conflicts', { count: eventResult.conflicts.length })}</p>
            )}
          </div>
        )}
      </aside>
    </ParkingMapLayout>
  );
}
