import { pickLabel } from '@indoorkit/imdf';
import { maskPlate } from '@indoorkit/parking';
import type { IndoorItem, IndoorMode } from '../../app/twin/indoor';
import { TWIN_MESSAGES } from '../../app/twin/messages';
import type { Locale } from '../../app-i18n';
import { PARKING_MESSAGES } from '../messages';
import { DEVICE_COLORS, STATE_COLORS } from '../presentation/colors';
import { liveAt, type ParkingContext } from './venue';

type Context = Pick<ParkingContext, 'venue' | 'parking' | 'day' | 'alarms' | 'bookings'>;

/** Reuses the same bay state, bookings, incidents and visit plan as the dedicated pages. */
export function parkingIndoor(ctx: Context): IndoorMode[] {
  const { parking, day } = ctx;
  const bays = (time: number, locale: Locale): IndoorItem[] => {
    const t = PARKING_MESSAGES[locale];
    const live = liveAt(ctx, time);
    return parking.bays.map((bay) => {
      const state = live.states.get(bay.id)!;
      const parked = live.parkedByBay.get(bay.id);
      return {
        id: bay.id,
        levelId: bay.levelId,
        coord: bay.center,
        name: bay.code,
        kind: t[`bayType.${bay.type}`],
        status: t[`bayState.${state}`],
        color: STATE_COLORS[state],
        details: [
          {
            label: t['bay.zone'],
            value: pickLabel(parking.zone(bay.zoneId).name, [locale, 'en']) ?? bay.zoneId,
          },
          { label: t['bay.plate'], value: parked ? maskPlate(parked.vehicle.plate) : t['bay.empty'] },
        ],
      };
    });
  };
  return [
    { id: 'bays', label: 'layerBays', href: '#/parking/availability', items: bays },
    {
      id: 'devices',
      label: 'layerDevices',
      href: '#/parking/availability',
      items(time, locale) {
        const t = PARKING_MESSAGES[locale];
        const shared = TWIN_MESSAGES[locale];
        const readings = new Map(day.deviceReadings(time).map((r) => [r.deviceId, r]));
        return parking.devices.map((d) => {
          const reading = readings.get(d.id);
          const state = reading?.status ?? 'online';
          return {
            id: d.id,
            levelId: d.levelId,
            coord: d.coord,
            name: d.code,
            kind: t[`device.${d.kind}`],
            status:
              shared[
                `status${state === 'online' ? 'Online' : state === 'offline' ? 'Offline' : state === 'fault' ? 'Fault' : 'Calling'}`
              ],
            color: state === 'offline' || state === 'fault' ? '#dc2626' : DEVICE_COLORS[d.kind],
            details: [
              {
                label: shared.location,
                value: d.unitIds.map((id) => parking.bay(id).code).join(', ') || d.code,
              },
              ...(reading?.value !== undefined
                ? [
                    {
                      label: shared.reading,
                      value: `${reading.value}${d.kind === 'co-sensor' ? ' ppm' : ''}`,
                    },
                  ]
                : []),
            ],
          };
        });
      },
    },
    {
      id: 'vehicles',
      label: 'layerVehicles',
      href: '#/parking/vehicles',
      items(time, locale) {
        const t = PARKING_MESSAGES[locale];
        const shared = TWIN_MESSAGES[locale];
        const parked: IndoorItem[] = day.parkedAt(time).map((p) => {
          const bay = parking.bay(p.bayId);
          return {
            id: `vehicle:${p.vehicle.plate}`,
            levelId: bay.levelId,
            coord: bay.center,
            name: maskPlate(p.vehicle.plate),
            kind: t[`vehicle.${p.vehicle.vehicleClass}`],
            status: shared.parked,
            color: '#64748b',
            details: [
              { label: shared.location, value: bay.code },
              { label: t['bay.contract'], value: t[`contract.${p.vehicle.contract.kind}`] },
            ],
          };
        });
        return [
          ...parked,
          ...day.movingAt(time).map(
            (p): IndoorItem => ({
              id: `vehicle:${p.plate}`,
              levelId: p.levelId,
              coord: p.coord,
              name: maskPlate(p.plate),
              kind: shared.layerVehicles,
              status: shared.moving,
              color: '#2563eb',
              details: [],
            }),
          ),
        ];
      },
    },
    {
      id: 'alarms',
      label: 'layerAlarms',
      href: '#/parking/alerts',
      items(time, locale) {
        ctx.alarms.update(time);
        const t = PARKING_MESSAGES[locale];
        return ctx.alarms.all().map((a) => {
          const bay = a.bayId ? parking.bay(a.bayId) : undefined;
          const device = a.deviceId ? parking.device(a.deviceId) : undefined;
          return {
            id: a.id,
            levelId: a.levelId,
            coord: bay?.center ?? device?.coord ?? ctx.venue.center,
            name: t[`rule.${a.rule}`],
            kind: t[`level.${a.level}`],
            status: t[`state.${ctx.alarms.state(a.id)}`],
            color: a.level === 'high' ? '#dc2626' : '#d97706',
            details: [
              {
                label: t['alarm.place'],
                value: bay?.code ?? device?.code ?? TWIN_MESSAGES[locale].unlocated,
              },
              {
                label: t['alarm.time'],
                value: `${String(Math.floor(a.time / 3600_000) % 24).padStart(2, '0')}:${String(Math.floor(a.time / 60_000) % 60).padStart(2, '0')}`,
              },
            ],
          };
        });
      },
    },
  ];
}
