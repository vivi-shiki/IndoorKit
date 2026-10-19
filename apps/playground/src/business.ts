import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import type { AlarmSubject, DepartmentRule, Location, VenueIndex } from '@indoorkit/plugins';
import {
  ASSET_STATUSES,
  type Asset,
  type AssetStatus,
  type Person,
  ROLES,
  type Role,
  type Roster,
} from '@indoorkit/rtls-simulator';
import { i18n } from './app-i18n';
import type { MessageKey } from './i18n';

/** 地图上的角色颜色；界面上的角色色点用同一组颜色 */
export const ROLE_COLORS: Record<Role, string> = {
  nurse: '#2563eb',
  doctor: '#16a34a',
  patient: '#9333ea',
  visitor: '#64748b',
  caregiver: '#0d9488',
  security: '#1f2937',
};

export const STATUS_COLORS: Record<AssetStatus, string> = {
  running: '#16a34a',
  idle: '#6b7280',
  offline: '#dc2626',
  maintenance: '#ea580c',
};
/** 从严重到轻微，决定区块聚合点的颜色 */
export const STATUS_ORDER: readonly AssetStatus[] = ['offline', 'maintenance', 'running', 'idle'];
export { ASSET_STATUSES, ROLES };

export const roleColor = [
  'match',
  ['get', 'role'],
  ...Object.entries(ROLE_COLORS).flat(),
  '#2563eb',
] as unknown as string;

/**
 * 第一层科室规则：设备和患者离开本科室、访客进入探视科室以外的科室会报警；
 * 医护跨科室会诊、支援是常态，不在这一层限制。
 */
export const DEPARTMENT_RULES: DepartmentRule[] = [
  { id: 'asset-outside', selector: { kinds: ['asset'] }, when: 'outside-own', graceMs: 60_000, level: 'low' },
  { id: 'asset-enter-other', selector: { kinds: ['asset'] }, when: 'enter-other', level: 'medium' },
  {
    id: 'patient-outside',
    selector: { roles: ['patient'] },
    when: 'outside-own',
    graceMs: 30_000,
    level: 'high',
  },
  { id: 'visitor-enter-other', selector: { roles: ['visitor'] }, when: 'enter-other', level: 'medium' },
];

export const subjectsOf = (roster: Roster): AlarmSubject[] => [
  ...roster.people.map((p) => ({
    id: p.id,
    kind: 'person' as const,
    role: p.role,
    departmentId: p.departmentId,
  })),
  ...roster.assets.map((a) => ({
    id: a.id,
    kind: 'asset' as const,
    type: a.type,
    departmentId: a.departmentId,
  })),
];

export const t = (key: string, params?: Record<string, string | number>) => i18n.t(key as MessageKey, params);
const languages = () => [i18n.locale, 'en', 'ja'];
export const label = (labels: Record<string, string> | null | undefined) =>
  pickLabel(labels, languages()) ?? '';

export const personName = (p: Person) => label(p.name);
export const assetName = (a: Asset) => `${a.code} · ${t(`asset.${a.type}`)}`;

export function departmentName(venue: VenueModel, id: string | null) {
  if (id === null) return t('place.public');
  return label(venue.departments.find((d) => d.id === id)?.name);
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
export function placeText(index: VenueIndex, venue: VenueModel, where: Location | null) {
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
