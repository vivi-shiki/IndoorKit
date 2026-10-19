import type { LabelMap, VenueModel } from '@indoorkit/imdf';

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
const MINUTE = 60_000;
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

/** 由字符串生成的可复现随机数（mulberry32） */
export function seededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const weighted = <T extends string>(rand: () => number, weights: Record<T, number>): T => {
  const total = Object.values<number>(weights).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [key, w] of Object.entries<number>(weights)) {
    r -= w;
    if (r < 0) return key as T;
  }
  return Object.keys(weights)[0] as T;
};

const ROLE_WEIGHTS: Record<Role, number> = {
  nurse: 30,
  doctor: 15,
  patient: 30,
  visitor: 15,
  caregiver: 5,
  security: 5,
};
/** 各角色可能所属的科室（按科室代码） */
const ROLE_DEPARTMENTS: Record<Role, string[]> = {
  doctor: ['internal', 'surgery', 'icu', 'rehab', 'emergency', 'clinics', 'medtech'],
  nurse: ['internal', 'surgery', 'icu', 'rehab', 'emergency', 'nursing'],
  patient: ['internal', 'surgery', 'icu', 'rehab', 'emergency', 'clinics'],
  visitor: ['internal', 'surgery', 'icu', 'rehab'],
  caregiver: ['nursing'],
  security: ['admin'],
};

const ASSET_WEIGHTS: Record<AssetType, number> = {
  'infusion-pump': 30,
  monitor: 25,
  wheelchair: 15,
  ventilator: 10,
  defibrillator: 10,
  'mobile-dr': 10,
};
const ASSET_DEPARTMENTS: Record<AssetType, string[]> = {
  'infusion-pump': ['internal', 'surgery', 'icu', 'rehab', 'emergency'],
  monitor: ['internal', 'surgery', 'icu', 'emergency'],
  wheelchair: ['outpatient', 'internal', 'surgery', 'rehab', 'emergency'],
  ventilator: ['icu', 'surgery'],
  defibrillator: ['emergency', 'icu', 'internal', 'surgery'],
  'mobile-dr': ['medtech', 'emergency'],
};
const ASSET_PREFIX: Record<AssetType, string> = {
  'infusion-pump': 'INF',
  monitor: 'MON',
  wheelchair: 'WC',
  ventilator: 'VEN',
  defibrillator: 'DEF',
  'mobile-dr': 'DR',
};

/** 虚构姓名：常见的姓与名随机组合 */
const SURNAMES: [string, string][] = [
  ['佐藤', 'Sato'],
  ['鈴木', 'Suzuki'],
  ['高橋', 'Takahashi'],
  ['田中', 'Tanaka'],
  ['伊藤', 'Ito'],
  ['渡辺', 'Watanabe'],
  ['山本', 'Yamamoto'],
  ['中村', 'Nakamura'],
  ['小林', 'Kobayashi'],
  ['加藤', 'Kato'],
  ['吉田', 'Yoshida'],
  ['山田', 'Yamada'],
  ['松本', 'Matsumoto'],
  ['井上', 'Inoue'],
  ['木村', 'Kimura'],
  ['林', 'Hayashi'],
];
const GIVEN: [string, string][] = [
  ['健', 'Ken'],
  ['翔', 'Sho'],
  ['蓮', 'Ren'],
  ['陽菜', 'Hina'],
  ['結衣', 'Yui'],
  ['葵', 'Aoi'],
  ['大輝', 'Daiki'],
  ['美咲', 'Misaki'],
  ['拓海', 'Takumi'],
  ['さくら', 'Sakura'],
  ['悠真', 'Yuma'],
  ['真央', 'Mao'],
];

const STATUS_MINUTES: Record<AssetStatus, [number, number]> = {
  running: [20, 120],
  idle: [10, 60],
  offline: [5, 30],
  maintenance: [30, 90],
};
const NEXT_STATUS: Record<AssetStatus, Partial<Record<AssetStatus, number>>> = {
  running: { idle: 70, offline: 18, maintenance: 12 },
  idle: { running: 75, offline: 15, maintenance: 10 },
  offline: { running: 50, idle: 50 },
  maintenance: { idle: 60, running: 40 },
};

function schedule(rand: () => number): StatusSegment[] {
  const out: StatusSegment[] = [];
  let status = weighted<AssetStatus>(rand, { running: 50, idle: 30, offline: 10, maintenance: 10 });
  let t = 0;
  while (t < DAY_MS) {
    const [lo, hi] = STATUS_MINUTES[status];
    const to = Math.min(DAY_MS, t + Math.round((lo + rand() * (hi - lo)) * MINUTE));
    out.push({ status, from: t, to });
    t = to;
    status = weighted(rand, NEXT_STATUS[status] as Record<AssetStatus, number>);
  }
  return out;
}

/**
 * 人员和设备名册。每一项只由自己的序号决定，与总数无关，
 * 所以不同页面（人数不同）里同一个 id 是同一个人、同一台设备。
 */
export function createRoster(venue: VenueModel, options: { people: number; assets: number }): Roster {
  if (venue.departments.length === 0) throw new Error('the roster needs a venue with departments');
  const byCode = new Map(venue.departments.map((d) => [d.code, d.id]));
  const pickDepartment = (rand: () => number, codes: string[]) => {
    const ids = codes.flatMap((c) => byCode.get(c) ?? []);
    const pool = ids.length > 0 ? ids : venue.departments.map((d) => d.id);
    return pool[Math.floor(rand() * pool.length)]!;
  };

  const people = Array.from({ length: options.people }, (_, i): Person => {
    const rand = seededRandom(`roster/person/${i}`);
    const role = weighted(rand, ROLE_WEIGHTS);
    const [surJa, surEn] = SURNAMES[Math.floor(rand() * SURNAMES.length)]!;
    const [givenJa, givenEn] = GIVEN[Math.floor(rand() * GIVEN.length)]!;
    const person: Person = {
      id: `P${String(i + 1).padStart(4, '0')}`,
      kind: 'person',
      role,
      departmentId: pickDepartment(rand, ROLE_DEPARTMENTS[role]),
      name: { ja: `${surJa} ${givenJa}`, zh: `${surJa} ${givenJa}`, en: `${givenEn} ${surEn}` },
    };
    // 每 40 人有一人在演示开始后的头 10 分钟内按下求助，持续 1 分钟
    if (i % 40 === 7) {
      const from = DAY_START_MS + ((((i - 7) / 40) % 5) * 2 + 1) * MINUTE;
      person.sos = { from, to: from + MINUTE };
    }
    return person;
  });

  const assets = Array.from({ length: options.assets }, (_, i): Asset => {
    const rand = seededRandom(`roster/asset/${i}`);
    const type = weighted(rand, ASSET_WEIGHTS);
    return {
      id: `A${String(i + 1).padStart(4, '0')}`,
      kind: 'asset',
      type,
      departmentId: pickDepartment(rand, ASSET_DEPARTMENTS[type]),
      code: `${ASSET_PREFIX[type]}-${String(i + 1).padStart(4, '0')}`,
      battery: 15 + Math.floor(rand() * 86),
      schedule: schedule(rand),
    };
  });
  return { people, assets };
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
