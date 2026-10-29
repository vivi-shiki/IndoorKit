import { pickLabel } from '@indoorkit/imdf';
import { assess, type Metric } from '@indoorkit/museum';
import type { IndoorItem, IndoorMode } from '../../app/twin/indoor';
import { TWIN_MESSAGES } from '../../app/twin/messages';
import type { Locale } from '../../app-i18n';
import { MUSEUM_MESSAGES } from '../messages';
import { DEVICE_COLORS, ENV_COLORS, GUARD_COLOR } from '../presentation/colors';
import type { EnvState } from './live';
import type { MuseumContext } from './venue';

type Context = Pick<MuseumContext, 'venue' | 'museum' | 'day' | 'alarms'>;
const METRICS: Metric[] = ['temperature', 'humidity', 'illuminance', 'co2'];
const UNITS: Record<string, string> = {
  temperature: ' °C',
  humidity: '%',
  illuminance: ' lx',
  co2: ' ppm',
  uv: ' µW/lm',
  acceleration: ' m/s²',
};

/** All locations, sensor values and object moves come from the existing seeded museum day. */
export function museumIndoor(ctx: Context): IndoorMode[] {
  const { museum, day } = ctx;
  const place = (id: string) => (museum.isCase(id) ? museum.case(id) : museum.room(id));
  const devices = (time: number, locale: Locale): IndoorItem[] => {
    const t = MUSEUM_MESSAGES[locale];
    const shared = TWIN_MESSAGES[locale];
    return day.readings(time).map((reading) => {
      const d = museum.device(reading.deviceId);
      const standard = museum.standardOf(d.unitId).standard;
      const assessments = METRICS.flatMap((metric) =>
        reading.values[metric] !== undefined ? [assess(standard, metric, reading.values[metric]!)] : [],
      );
      const state: EnvState = !reading.online
        ? 'offline'
        : assessments.includes('above')
          ? 'above'
          : assessments.includes('below')
            ? 'below'
            : 'ok';
      return {
        id: d.id,
        levelId: d.levelId,
        coord: d.coord,
        name: d.code,
        kind: t[`device.${d.kind}`],
        status: t[`env.${state}`],
        color: state === 'ok' ? DEVICE_COLORS[d.kind] : ENV_COLORS[state],
        details: [
          { label: t['detail.place'], value: place(d.unitId).code },
          { label: shared.battery, value: `${reading.battery}%` },
          ...Object.entries(reading.values).map(([metric, value]) => ({
            label: METRICS.includes(metric as Metric)
              ? t[`metric.${metric as Metric}`]
              : metric === 'uv'
                ? 'UV'
                : shared.reading,
            value: reading.online ? `${value.toFixed(1)}${UNITS[metric] ?? ''}` : '—',
          })),
        ],
      };
    });
  };
  return [
    { id: 'environment', label: 'layerEnvironment', href: '#/museum/environment', items: devices },
    {
      id: 'visitors',
      label: 'layerVisitors',
      href: '#/museum/visitors',
      items(time, locale) {
        const t = TWIN_MESSAGES[locale];
        return day.taggedAt(time).map((p) => ({
          id: p.id,
          levelId: p.levelId,
          coord: p.coord,
          name: p.id,
          kind: t.taggedVisitor,
          status: t.located,
          color: '#2563eb',
          details: [{ label: t.location, value: p.roomId ? museum.room(p.roomId).code : t.walkway }],
        }));
      },
    },
    {
      id: 'security',
      label: 'layerSecurity',
      href: '#/museum/security',
      items(time, locale) {
        const t = TWIN_MESSAGES[locale];
        const guards: IndoorItem[] = day.guards.map((g) => {
          const p = day.guardAt(g.id, time);
          return {
            id: `guard:${g.id}`,
            levelId: p.levelId,
            coord: p.coord,
            name: g.id,
            kind: MUSEUM_MESSAGES[locale]['guard.label'],
            status: t.located,
            color: GUARD_COLOR,
            details: [{ label: t.patrol, value: g.routeCode ?? t.desk }],
          };
        });
        const securityDevices = new Set(
          museum.devices
            .filter((d) => ['motion', 'door', 'vibration', 'proximity', 'rfid'].includes(d.kind))
            .map((d) => d.id),
        );
        return [...guards, ...devices(time, locale).filter((d) => securityDevices.has(d.id))];
      },
    },
    {
      id: 'collection',
      label: 'layerCollection',
      href: '#/museum/collection',
      items(time, locale) {
        const t = MUSEUM_MESSAGES[locale];
        return museum.objects.flatMap((o): IndoorItem[] => {
          const state = day.objectState(o, time);
          if (!state.location) return [];
          const location = place(state.location);
          return [
            {
              id: o.id,
              levelId: location.levelId,
              coord: location.center,
              name: pickLabel(o.title, [locale, 'en']) ?? o.code,
              kind: t[`material.${o.material}`],
              status: t[`status.${state.status}`],
              color: '#7c3aed',
              details: [
                { label: TWIN_MESSAGES[locale].code, value: o.code },
                { label: t['detail.place'], value: location.code },
                {
                  label: TWIN_MESSAGES[locale].exposure,
                  value: `${day.exposureAt(o, time).toFixed(0)} lx·h`,
                },
              ],
            },
          ];
        });
      },
    },
    {
      id: 'alarms',
      label: 'layerAlarms',
      href: '#/museum/security',
      items(time, locale) {
        ctx.alarms.update(time);
        const t = MUSEUM_MESSAGES[locale];
        return ctx.alarms.all().map((a) => {
          const location = place(a.unitId);
          return {
            id: a.id,
            levelId: a.levelId,
            coord: location.center,
            name: t[`rule.${a.rule}`],
            kind: t[`level.${a.level}`],
            status: t[`state.${ctx.alarms.state(a.id)}`],
            color: a.level === 'high' ? '#dc2626' : '#d97706',
            details: [
              { label: t['detail.place'], value: location.code },
              ...(a.value === null
                ? []
                : [{ label: TWIN_MESSAGES[locale].reading, value: a.value.toFixed(1) }]),
            ],
          };
        });
      },
    },
  ];
}
