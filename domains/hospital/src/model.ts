import type { LabelMap } from '@indoorkit/imdf';

/** 医院里的人员、设备和设备状态；只是数据和纯函数，不依赖地图 */
export const ROLES = ['doctor', 'nurse', 'patient', 'visitor', 'caregiver', 'security'] as const;
export type Role = (typeof ROLES)[number];

export const ASSET_TYPES = [
  'infusion-pump',
  'monitor',
  'wheelchair',
  'ventilator',
  'defibrillator',
  'mobile-dr',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
/** 会被推着走的设备；其余设备固定在科室房间里 */
export const MOBILE_ASSET_TYPES: readonly AssetType[] = ['wheelchair', 'mobile-dr'];

export const ASSET_STATUSES = ['running', 'idle', 'offline', 'maintenance'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** 模拟时间 0 对应当天 09:00；状态表和 SOS 时间都按「当天毫秒数」记录 */
export const DAY_START_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;
export const dayTime = (simTime: number) => DAY_START_MS + simTime;

export interface StatusSegment {
  status: AssetStatus;
  from: number;
  to: number;
}

export interface Person {
  id: string;
  kind: 'person';
  role: Role;
  departmentId: string;
  name: LabelMap;
  /** 一键求助的时间段（当天毫秒数） */
  sos?: { from: number; to: number };
}

export interface Asset {
  id: string;
  kind: 'asset';
  type: AssetType;
  departmentId: string;
  code: string;
  battery: number;
  /** 设备上报的运行状态，覆盖整天 */
  schedule: StatusSegment[];
}

export interface Roster {
  people: Person[];
  assets: Asset[];
}

const segmentAt = (asset: Asset, dayMs: number) => {
  const t = ((dayMs % DAY_MS) + DAY_MS) % DAY_MS;
  const segment = asset.schedule.find((s) => s.from <= t && t < s.to);
  if (!segment) throw new Error(`asset ${asset.id} has no status at ${t}`);
  return { segment, t };
};

export const statusAt = (asset: Asset, dayMs: number): AssetStatus => segmentAt(asset, dayMs).segment.status;

/** 当前状态、从何时开始、当天到此刻为止的运行时长 */
export function statusSummary(asset: Asset, dayMs: number) {
  const { segment, t } = segmentAt(asset, dayMs);
  let runMs = 0;
  for (const s of asset.schedule) {
    if (s.status === 'running' && s.from < t) runMs += Math.min(s.to, t) - s.from;
  }
  return { status: segment.status, since: segment.from, runMs };
}

export const sosActive = (person: Person, dayMs: number) =>
  person.sos !== undefined && person.sos.from <= dayMs && dayMs < person.sos.to;
