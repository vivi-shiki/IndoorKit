import {
  assess,
  budgetShare,
  type CheckpointResult,
  checkPatrol,
  daysUntilBudget,
  displayDaysLeft,
  type Metric,
  type Museum,
  type MuseumObject,
  type SensorReading,
  STANDARDS,
} from '@indoorkit/museum';
import type { MuseumDay, ObjectState, PatrolRound } from '@indoorkit/museum-simulator';

/** 房间和展示柜在保存环境地图上的状态，按严重程度排列 */
export const ENV_STATES = ['above', 'below', 'offline', 'ok'] as const;
export type EnvState = (typeof ENV_STATES)[number];

/** 每种指标由哪类传感器测 */
const SENSOR_OF: Record<Metric, 'climate' | 'light' | 'co2'> = {
  temperature: 'climate',
  humidity: 'climate',
  illuminance: 'light',
  co2: 'co2',
};

/**
 * 每个装了对应传感器的房间和展示柜的当前值和状态：
 * 按里面最敏感的藏品的标准判断偏高、偏低还是正常；传感器离线时没有值。
 */
export function envReadings(
  museum: Museum,
  readings: readonly SensorReading[],
  metric: Metric,
): Map<string, { value: number | null; state: EnvState }> {
  const out = new Map<string, { value: number | null; state: EnvState }>();
  for (const r of readings) {
    const device = museum.device(r.deviceId);
    if (device.kind !== SENSOR_OF[metric]) continue;
    if (!r.online) {
      out.set(device.unitId, { value: null, state: 'offline' });
      continue;
    }
    const value = r.values[metric]!;
    const { standard } = museum.standardOf(device.unitId);
    const a = assess(standard, metric, value);
    out.set(device.unitId, { value, state: a === 'ok' ? 'ok' : a });
  }
  return out;
}

/** 一段曲线的最大值减最小值（湿度的日波动）；没有数据为 null */
export function humiditySwing(series: readonly { time: number; value: number }[]): number | null {
  if (series.length === 0) return null;
  const values = series.map((p) => p.value);
  return Math.max(...values) - Math.min(...values);
}

/** 展示室的混雑程度：定员的 80 % 起「较多」，超过定员「已满」 */
export const CROWD_STATES = ['full', 'busy', 'calm'] as const;
export type CrowdState = (typeof CROWD_STATES)[number];

export function crowdState(count: number, capacity: number): CrowdState {
  if (count > capacity) return 'full';
  return count >= capacity * 0.8 ? 'busy' : 'calm';
}

/** 有定员的房间（展示室、大厅）在 t 时刻的混雑程度 */
export function crowdStates(museum: Museum, day: MuseumDay, t: number): Map<string, CrowdState> {
  const out = new Map<string, CrowdState>();
  for (const r of museum.rooms) {
    if (r.capacity === null) continue;
    out.set(r.unitId, crowdState(day.occupancy(r.unitId, t), r.capacity));
  }
  return out;
}

/** 累计光照量占年度预算的比例：80 % 起注意，到 100 % 超出 */
export const BUDGET_STATES = ['over', 'warn', 'ok'] as const;
export type BudgetState = (typeof BUDGET_STATES)[number];

export function budgetState(share: number | null): BudgetState | null {
  if (share === null) return null;
  if (share >= 1) return 'over';
  return share >= 0.8 ? 'warn' : 'ok';
}

/** 藏品列表的一行 */
export interface ObjectRow {
  object: MuseumObject;
  state: ObjectState;
  /** 今年的累计光照量（lx·h） */
  lxh: number;
  /** 年度预算；不限时为 null */
  budget: number | null;
  share: number | null;
  /** 按今天的光照量，预算还能撑几天 */
  daysLeft: number | null;
  displayDays: number;
  /** 指定文化财今年还能公开几天 */
  displayLeft: number | null;
}

/** 全部藏品在 t 时刻的光照量和公开天数，按预算用掉的比例从高到低 */
export function objectRows(day: MuseumDay, t: number): ObjectRow[] {
  const { museum } = day;
  const rows = museum.objects.map((object): ObjectRow => {
    const standard = STANDARDS[museum.sensitivityOf(object)];
    const lxh = day.exposureAt(object, t);
    const displayDays = day.displayDaysAt(object, t);
    return {
      object,
      state: day.objectState(object, t),
      lxh,
      budget: standard.annualLxh,
      share: budgetShare(lxh, standard),
      daysLeft: daysUntilBudget(lxh, day.dailyAverage(object), standard),
      displayDays,
      displayLeft: displayDaysLeft(object, displayDays),
    };
  });
  return rows.sort((a, b) => (b.share ?? -1) - (a.share ?? -1));
}

/** 每个展示柜里光照预算用得最多的那件藏品的状态 */
export function caseBudgetStates(museum: Museum, rows: readonly ObjectRow[]): Map<string, BudgetState> {
  const order = (s: BudgetState) => BUDGET_STATES.indexOf(s);
  const out = new Map<string, BudgetState>();
  for (const r of rows) {
    const where = r.state.location;
    const state = budgetState(r.share);
    if (!where || !state || !museum.isCase(where) || r.state.status !== 'display') continue;
    const prev = out.get(where);
    if (!prev || order(state) < order(prev)) out.set(where, state);
  }
  return out;
}

/** 警卫最近开始的一圈巡逻和各检查点的核对结果；值守的警卫或还没开始时为 null */
export function patrolStatus(
  day: MuseumDay,
  guardId: string,
  t: number,
): { round: PatrolRound; results: CheckpointResult[] } | null {
  const round = day.rounds.filter((r) => r.guardId === guardId && r.start <= t).at(-1);
  if (!round) return null;
  const passes = day.passes.filter((p) => p.guardId === guardId && p.round === round.start);
  return { round, results: checkPatrol(day.museum.route(round.routeCode), round.start, passes, t) };
}

/** 导览的一步：站在某个展示室的某个展示柜前 */
export interface GuideStep {
  roomId: string;
  caseId: string;
}

/** 按导览路线经过的展示室，逐个走到放着藏品的展示柜前 */
export function guideSteps(museum: Museum, routeCode: string): GuideStep[] {
  return museum.route(routeCode).stops.flatMap((stop) =>
    museum
      .casesIn(stop.unitId)
      .filter((c) => museum.objectsAt(c.unitId).length > 0)
      .map((c) => ({ roomId: stop.unitId, caseId: c.unitId })),
  );
}
