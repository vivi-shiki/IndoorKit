import {
  createAlarmEngine,
  DAY_START_MS,
  DEPARTMENT_RULES,
  type HospitalVenue,
  sosActive,
  statusAt,
  subjectsOf,
} from '@indoorkit/hospital';
import { pickLabel } from '@indoorkit/imdf';
import type { TagPosition } from '@indoorkit/rtls';
import type { IndoorItem, IndoorMode } from '../app/twin/indoor';
import { TWIN_MESSAGES } from '../app/twin/messages';
import { type Locale, messages } from '../i18n';
import { ROLE_COLORS, STATUS_COLORS } from '../presentation/colors';
import { createRoster, createSimulation, PEOPLE_SEED } from './sim';
import { placesOf } from './venue';

/** Same roster, seeds, schedules and position simulator as the dedicated hospital pages. */
export function hospitalIndoor(venue: HospitalVenue): IndoorMode[] {
  const roster = createRoster(venue, { people: 500, assets: 400 });
  const { hospital, index } = placesOf(venue);
  let cachedTime = -1;
  let positions: TagPosition[] = [];
  const sample = (time: number) => {
    if (time !== cachedTime) {
      const people = createSimulation(venue, { tags: 500, seed: PEOPLE_SEED });
      const assets = createSimulation(venue, { tags: 0, assets: 400, seed: 'assets' });
      const elapsed = Math.max(0, time - DAY_START_MS);
      positions = [...people.step(elapsed), ...assets.step(elapsed)].map((p) => {
        const asset = roster.assets.find((a) => a.id === p.id);
        const person = roster.people.find((a) => a.id === p.id);
        return {
          ...p,
          status: asset ? statusAt(asset, time) : person && sosActive(person, time) ? 'sos' : undefined,
        };
      });
      cachedTime = time;
    }
    return new Map(positions.map((p) => [p.id, p]));
  };
  const rows = (time: number, locale: Locale) => {
    const p = sample(time);
    const t = messages[locale];
    const shared = TWIN_MESSAGES[locale];
    const place = (position: TagPosition) => {
      const location = hospital.locate(position.levelId, position.coord);
      if (!location) return shared.unlocated;
      const unit = index.unit(location.unitId);
      return pickLabel(unit.name, [locale, 'en']) ?? location.unitId;
    };
    const department = (id: string) =>
      pickLabel(hospital.departments.find((d) => d.id === id)!.name, [locale, 'en']) ?? id;
    const assets: IndoorItem[] = roster.assets.map((a) => {
      const position = p.get(a.id)!;
      const status = statusAt(a, time);
      return {
        id: a.id,
        levelId: position.levelId,
        coord: position.coord,
        name: a.code,
        kind: t[`asset.${a.type}`],
        status: t[`status.${status}`],
        color: STATUS_COLORS[status],
        details: [
          { label: t['detail.department'], value: department(a.departmentId) },
          { label: t['detail.location'], value: place(position) },
          { label: t['detail.battery'], value: `${a.battery}%` },
        ],
      };
    });
    const people: IndoorItem[] = roster.people.map((person) => {
      const position = p.get(person.id)!;
      const sos = position.status === 'sos';
      return {
        id: person.id,
        levelId: position.levelId,
        coord: position.coord,
        name: pickLabel(person.name, [locale, 'en']) ?? person.id,
        kind: t[`role.${person.role}`],
        status: sos ? shared.sos : shared.located,
        color: sos ? '#dc2626' : ROLE_COLORS[person.role],
        details: [
          { label: t['detail.department'], value: department(person.departmentId) },
          { label: t['detail.location'], value: place(position) },
        ],
      };
    });
    return { assets, people };
  };
  return [
    {
      id: 'assets',
      label: 'layerAssets',
      href: '#/hospital/assets',
      items: (time, locale) => rows(time, locale).assets,
    },
    {
      id: 'people',
      label: 'layerPeople',
      href: '#/hospital/tracking',
      items: (time, locale) => rows(time, locale).people,
    },
    {
      id: 'alarms',
      label: 'layerAlarms',
      href: '#/hospital/alerts',
      items(time, locale) {
        sample(time);
        const data = rows(time, locale);
        const items = new Map([...data.assets, ...data.people].map((i) => [i.id, i]));
        const engine = createAlarmEngine({
          hospital,
          subjects: subjectsOf(roster),
          departmentRules: DEPARTMENT_RULES,
        });
        const t = messages[locale];
        return engine.check({ time, positions }).map((alarm) => {
          const item = items.get(alarm.subjectId)!;
          return {
            ...item,
            id: alarm.id,
            name: `${item.name} · ${t[`alarm.${alarm.kind}`]}`,
            status: t[`level.${alarm.level}`],
            color: alarm.level === 'high' ? '#dc2626' : '#d97706',
          };
        });
      },
    },
  ];
}
