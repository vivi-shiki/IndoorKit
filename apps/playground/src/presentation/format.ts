import { type Asset, departmentsOf, type HospitalLocation, type Person } from '@indoorkit/hospital';
import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import type { VenueIndex } from '@indoorkit/plugins';
import { i18n } from '../app-i18n';
import type { MessageKey } from '../i18n';

/** 把业务数据写成界面上的文字：翻译、名称、地点、时长和时刻 */
export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key as MessageKey, params);
const languages = () => [i18n.locale, 'en', 'ja'];
export const label = (labels: Record<string, string> | null | undefined) =>
  pickLabel(labels, languages()) ?? '';

export const personName = (p: Person) => label(p.name);
export const assetName = (a: Asset) => `${a.code} · ${t(`asset.${a.type}`)}`;

export function departmentName(venue: VenueModel, id: string | null) {
  if (id === null) return t('place.public');
  return label(departmentsOf(venue).find((d) => d.id === id)?.name);
}

/** 同一层同名的区块按从西到东对应的楼栋编号，供显示时区分 */
const buildingOfUnit = new WeakMap<VenueModel, Map<string, number>>();
function buildingIndex(index: VenueIndex, venue: VenueModel) {
  let map = buildingOfUnit.get(venue);
  if (map) return map;
  map = new Map();
  const groups = new Map<string, string[]>();
  for (const f of venue.features.units.features) {
    const { id, level_id, label_en } = f.properties;
    if (!label_en) continue;
    const key = `${level_id}/${label_en}`;
    groups.set(key, [...(groups.get(key) ?? []), id]);
  }
  for (const ids of groups.values()) {
    if (ids.length !== venue.buildings.length) continue;
    ids.sort((a, b) => index.unit(a).center[0] - index.unit(b).center[0]);
    for (const [i, id] of ids.entries()) map.set(id, i);
  }
  buildingOfUnit.set(venue, map);
  return map;
}

/** 区块名；几栋楼里都有的同名区块前面加上楼栋名 */
export function unitLabel(index: VenueIndex, venue: VenueModel, unitId: string) {
  const name = label(index.unit(unitId).name);
  const building = buildingIndex(index, venue).get(unitId);
  return building === undefined ? name : `${label(venue.buildings[building]!.name)} ${name}`;
}

/** 区块名 + 所在科室范围；不在任何区块里时只写公共区域 */
export function placeText(index: VenueIndex, venue: VenueModel, where: HospitalLocation | null) {
  if (!where) return t('place.public');
  const unit = index.unit(where.unitId);
  const unitName = unit.category === 'walkway' ? t('place.public') : unitLabel(index, venue, where.unitId);
  return where.departmentId ? `${unitName} · ${departmentName(venue, where.departmentId)}` : unitName;
}

export function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 60) return t('duration.hm', { h: Math.floor(minutes / 60), m: minutes % 60 });
  if (minutes >= 1) return t('duration.m', { m: minutes });
  return t('duration.s', { s: Math.max(0, Math.floor(ms / 1000)) });
}

/** 当天毫秒数 → HH:MM:SS */
export function formatClock(dayMs: number, seconds = false) {
  const total = Math.floor(dayMs / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hm = `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}`;
  return seconds ? `${hm}:${pad(total % 60)}` : hm;
}
