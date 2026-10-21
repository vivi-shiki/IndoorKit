import { BAY_TYPES, type DeviceKind } from '@indoorkit/parking';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useMapEvent } from '../../../app/map';
import { parseClockParam } from '../../adapters/clock';
import { BAY_STATES } from '../../adapters/live';
import { type LiveSnapshot, liveAt } from '../../adapters/venue';
import {
  bayOutlines,
  bayPlugins,
  cameraCoverage,
  DEVICE_LAYERS,
  setDeviceLayer,
  signReadings,
  syncSigns,
} from '../../bays';
import { useParkingT } from '../../i18n';
import { levelName, ParkingMapLayout, useParkingMap, useTick } from '../../map';
import { DEVICE_COLORS, STATE_COLORS, TYPE_OUTLINES } from '../../presentation/colors';
import { ChipGroup, Legend, Metric } from '../../presentation/ui';
import type { ParkingPageProps } from '../../routes';
import { usePlatesShown } from '../../settings';
import { BayDrawer, ZoneList } from './view';

const NONE: ReadonlySet<string> = new Set();

/** 满空地图：每个车位的状态、各区空闲数、余位显示屏和设备图层 */
export function AvailabilityPage({ query }: ParkingPageProps) {
  const t = useParkingT();
  const platesShown = usePlatesShown();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useParkingMap(stageRef, {
    page: 'availability',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: bayPlugins,
  });
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [types, setTypes] = useState(NONE);
  const [devices, setDevices] = useState(NONE);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [bayId, setBayId] = useState<string | null>(null);
  const [, floorChanged] = useReducer((v: number) => v + 1, 0);
  useMapEvent(page, 'floor:change', floorChanged);
  const signs = useRef(new Set<string>());

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const unitState = indoor.plugins['unit-state'];
    unitState.setOutlines(bayOutlines(ctx));
    hooks.highlighted = () => unitState.highlighted().map((id) => ctx.parking.bay(id).code);
    hooks.markerCount = () => indoor.plugins.marker.count();
  }, [page]);

  useTick(page, 1000, (time) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = liveAt(ctx, time);
    indoor.plugins['unit-state'].setStates(next.states);
    syncSigns(ctx, indoor.plugins.marker, next, signs.current);
    hooks.stateCounts = () =>
      Object.fromEntries(BAY_STATES.map((s) => [s, [...next.states.values()].filter((v) => v === s).length]));
    hooks.displays = () => signReadings(ctx, next);
    hooks.freeOn = (short) => {
      const levelId = page.floor.resolve(short).id;
      return ctx.parking.bays.filter(
        (b) => b.levelId === levelId && b.type !== 'monthly' && next.states.get(b.id) === 'free',
      ).length;
    };
    if (!live) void indoor.rendered().then(() => (hooks.ready = true));
    setLive(next);
  });

  // 选中的类型或区加粗描边
  useEffect(() => {
    if (!page) return;
    const { parking } = page.ctx;
    const ids =
      zoneId !== null
        ? parking.zone(zoneId).bayIds
        : types.size > 0
          ? parking.bays.filter((b) => types.has(b.type)).map((b) => b.id)
          : null;
    page.indoor.plugins['unit-state'].highlight(ids);
  }, [page, types, zoneId]);

  // 设备图层按 chip 增减；AI 摄像头连同覆盖范围一起画
  const shownDevices = useRef(new Set<string>());
  useEffect(() => {
    if (!page) return;
    const { ctx, indoor } = page;
    for (const kind of DEVICE_LAYERS) {
      const on = devices.has(kind);
      if (on === shownDevices.current.has(kind)) continue;
      setDeviceLayer(ctx, indoor.plugins.marker, kind, on);
      if (kind === 'ai-camera') {
        for (const area of cameraCoverage(ctx)) {
          if (on) indoor.plugins.polygon.add(area);
          else indoor.plugins.polygon.remove(area.id);
        }
      }
      if (on) shownDevices.current.add(kind);
      else shownDevices.current.delete(kind);
    }
  }, [page, devices]);

  useMapEvent(page, 'map:click', ({ coord }) => {
    const id = page!.indoor.plugins['unit-state'].unitAt(coord);
    if (id) setBayId(id);
  });

  const selectZone = (id: string | null) => {
    setZoneId(id);
    if (id && page) page.floor.set(page.ctx.parking.zone(id).levelId);
  };

  const floorLevel = page?.floor.current().id;
  const free = live ? [...live.states.values()].filter((s) => s === 'free').length : 0;
  const reservation =
    page && bayId && live
      ? ([...page.ctx.day.reservations, ...page.ctx.bookings.reservations()].find(
          (r) => r.bayId === bayId && r.from - 30 * 60_000 <= live.time && live.time < r.to,
        ) ?? null)
      : null;

  return (
    <ParkingMapLayout
      title="page.availability.title"
      desc="page.availability.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <Metric
            label={t('metric.free')}
            testId="free-count"
            value={free}
            total={{ value: page?.ctx.parking.bays.length ?? 0, testId: 'total-count' }}
          />
          <Metric
            label={t('metric.floorFree')}
            testId="floor-free"
            value={(floorLevel && live?.freeByLevel.get(floorLevel)) ?? 0}
          />
          <Metric label={t('metric.parked')} testId="parked-count" value={live?.parked.length ?? 0} />
          <ChipGroup
            testId="type-chip"
            label={t('control.types')}
            items={BAY_TYPES.map((type) => ({
              value: type,
              text: t(`bayType.${type}`),
              ...(type === 'standard' ? {} : { color: TYPE_OUTLINES[type] }),
            }))}
            selected={types}
            onChange={(next) => {
              setZoneId(null);
              setTypes(next);
            }}
          />
        </>
      }
    >
      <aside className="panel">
        <Legend items={BAY_STATES.map((s) => ({ color: STATE_COLORS[s], text: t(`bayState.${s}`) }))} />
        <h2>{t('control.devices')}</h2>
        <ChipGroup
          testId="device-chip"
          label={t('control.devices')}
          items={DEVICE_LAYERS.map((kind: DeviceKind) => ({
            value: kind,
            text: t(`device.${kind}`),
            color: DEVICE_COLORS[kind],
          }))}
          selected={devices}
          onChange={setDevices}
        />
        <h2>{t('panel.zones')}</h2>
        {page && live && (
          <ZoneList
            parking={page.ctx.parking}
            live={live}
            levelShort={(id) => levelName(page.floor, id)}
            selected={zoneId}
            onSelect={selectZone}
          />
        )}
      </aside>
      {page && live && bayId && (
        <BayDrawer
          parking={page.ctx.parking}
          bayId={bayId}
          live={live}
          levelShort={levelName(page.floor, page.ctx.parking.bay(bayId).levelId)}
          platesShown={platesShown}
          reservation={reservation}
          onClose={() => setBayId(null)}
        />
      )}
    </ParkingMapLayout>
  );
}
