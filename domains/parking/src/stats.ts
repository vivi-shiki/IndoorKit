import type { Contract, Parking } from './model';

const HOUR = 3600_000;

/** 一次停车：入场 → 停到车位 → 离开车位 → 出场 */
export interface ParkingSession {
  plate: string;
  bayId: string;
  contract: Contract['kind'];
  enteredAt: number;
  parkedAt: number;
  /** 还在车位上时为 null */
  leftAt: number | null;
  exitedAt: number | null;
  /** 应收金额（月租等为 0） */
  fee: number;
  paid: boolean;
}

export interface MonthlyContract {
  id: string;
  bayId: string;
}

export interface ParkingRecords {
  sessions: readonly ParkingSession[];
  monthlyContracts: readonly MonthlyContract[];
}

export interface Window {
  from: number;
  to: number;
}

export interface ParkingSummary {
  /** 计时车位（不含月租车位）的平均利用率 0～1 */
  utilization: number;
  bayUtilization: Map<string, number>;
  zoneUtilization: Map<string, number>;
  /** 每个计时车位在窗口内停了几辆车 */
  turnover: number;
  /** 窗口内离开车位的车辆的平均停留时间 */
  averageStayMs: number;
  /** 窗口内出场且已付款的金额 */
  revenue: number;
  /** 窗口内未付款出场的金额 */
  unpaid: number;
  revenueByZone: Map<string, number>;
  /** 没有签约的月租车位数 */
  monthlyVacant: number;
  /** 每个整点在车位上的车辆数（含月租） */
  hourly: { time: number; count: number }[];
}

/** 车位在窗口里被占用的毫秒数 */
function occupiedMs(sessions: readonly ParkingSession[], w: Window) {
  const out = new Map<string, number>();
  for (const s of sessions) {
    const from = Math.max(s.parkedAt, w.from);
    const to = Math.min(s.leftAt ?? Infinity, w.to);
    if (to > from) out.set(s.bayId, (out.get(s.bayId) ?? 0) + to - from);
  }
  return out;
}

/** 运营指标：利用率、周转率、平均停留、收入、未付款、月租空置和每小时在场车辆数 */
export function summarize(parking: Parking, records: ParkingRecords, w: Window): ParkingSummary {
  const span = w.to - w.from;
  const hourlyBays = parking.bays.filter((b) => b.type !== 'monthly');
  const occupied = occupiedMs(records.sessions, w);
  const bayUtilization = new Map(parking.bays.map((b) => [b.id, (occupied.get(b.id) ?? 0) / span]));
  const zoneUtilization = new Map(
    parking.zones.map((z) => [
      z.id,
      z.bayIds.reduce((sum, id) => sum + bayUtilization.get(id)!, 0) / z.bayIds.length,
    ]),
  );
  const hourlyIds = new Set(hourlyBays.map((b) => b.id));
  const inWindow = (t: number | null) => t !== null && t >= w.from && t <= w.to;

  const left = records.sessions.filter((s) => hourlyIds.has(s.bayId) && inWindow(s.leftAt));
  const exited = records.sessions.filter((s) => inWindow(s.exitedAt));
  const revenueByZone = new Map<string, number>();
  for (const s of exited) {
    if (!s.paid || s.fee === 0) continue;
    const zoneId = parking.bay(s.bayId).zoneId;
    revenueByZone.set(zoneId, (revenueByZone.get(zoneId) ?? 0) + s.fee);
  }
  const contracted = new Set(records.monthlyContracts.map((c) => c.bayId));
  const hourly: ParkingSummary['hourly'] = [];
  for (let t = Math.ceil(w.from / HOUR) * HOUR; t < w.to; t += HOUR) {
    hourly.push({
      time: t,
      count: records.sessions.filter((s) => s.parkedAt <= t && t < (s.leftAt ?? Infinity)).length,
    });
  }

  return {
    utilization: hourlyBays.reduce((sum, b) => sum + bayUtilization.get(b.id)!, 0) / hourlyBays.length,
    bayUtilization,
    zoneUtilization,
    turnover:
      records.sessions.filter((s) => hourlyIds.has(s.bayId) && s.parkedAt >= w.from && s.parkedAt < w.to)
        .length / hourlyBays.length,
    averageStayMs: left.length ? left.reduce((sum, s) => sum + (s.leftAt! - s.parkedAt), 0) / left.length : 0,
    revenue: exited.filter((s) => s.paid).reduce((sum, s) => sum + s.fee, 0),
    unpaid: exited.filter((s) => !s.paid).reduce((sum, s) => sum + s.fee, 0),
    revenueByZone,
    monthlyVacant: parking.bays.filter((b) => b.type === 'monthly' && !contracted.has(b.id)).length,
    hourly,
  };
}

export type SuggestionCode = 'peak-pricing' | 'ev-capacity' | 'monthly-recruit';

export interface Suggestion {
  code: SuggestionCode;
  zoneId: string;
  /** 依据的利用率 0～1 */
  value: number;
}

/** 建议规则的阈值和时段（小时） */
export const SUGGESTION_RULES = {
  peak: { from: 12, to: 14, atLeast: 0.95 },
  ev: { from: 19, to: 22, atLeast: 0.9 },
  monthly: { from: 8, to: 22, below: 0.25 },
};

/**
 * 根据一天（dayStart 起 24 小时）的记录给出运营建议：
 * 午间满的区试行高峰加价；EV 车位傍晚满时增设充电桩或缩短充满后的宽限时间；
 * 白天利用率低的普通区（不含 EV、无障碍车位）招募月租。
 */
export function suggest(parking: Parking, records: ParkingRecords, dayStart: number): Suggestion[] {
  const at = (from: number, to: number) =>
    summarize(parking, records, { from: dayStart + from * HOUR, to: dayStart + to * HOUR });
  const { peak, ev, monthly } = SUGGESTION_RULES;
  const out: Suggestion[] = [];
  const general = parking.zones.filter((z) => z.kind === 'general');

  const noon = at(peak.from, peak.to);
  for (const z of general) {
    const value = noon.zoneUtilization.get(z.id)!;
    if (value >= peak.atLeast) out.push({ code: 'peak-pricing', zoneId: z.id, value });
  }

  const evening = at(ev.from, ev.to);
  const evBays = parking.bays.filter((b) => b.type === 'ev');
  if (evBays.length > 0) {
    const value = evBays.reduce((sum, b) => sum + evening.bayUtilization.get(b.id)!, 0) / evBays.length;
    if (value >= ev.atLeast) out.push({ code: 'ev-capacity', zoneId: evBays[0]!.zoneId, value });
  }

  const daytime = at(monthly.from, monthly.to);
  for (const z of general) {
    const plain = z.bayIds.every((id) => parking.bay(id).type === 'standard');
    const value = daytime.zoneUtilization.get(z.id)!;
    if (plain && value < monthly.below) out.push({ code: 'monthly-recruit', zoneId: z.id, value });
  }
  return out;
}
