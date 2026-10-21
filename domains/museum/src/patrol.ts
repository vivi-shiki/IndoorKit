import type { Route } from './model';

const M = 60_000;

/** 检查点的状态：按时经过、迟到（过了时间才经过，或这一圈还没走完、已经过了时间）、漏掉（这一圈走完也没经过）、还没到时间 */
export type CheckpointStatus = 'passed' | 'late' | 'missed' | 'upcoming';

export interface CheckpointResult {
  code: string;
  unitId: string;
  /** 计划经过的时刻 */
  due: number;
  /** 实际经过的时刻；没经过为 null */
  passedAt: number | null;
  status: CheckpointStatus;
}

/** 晚于计划这么久算迟到；一圈结束后过了这么久还没经过算漏掉 */
export const PATROL_TOLERANCE_MS = 5 * M;

/**
 * 路线上每一点的计划时刻：从出发时刻起，按路线长度的比例分配一圈的时间。
 * 长度在平面上算，换层不计距离。
 */
export function scheduleOf(route: Route, start: number): number[] {
  const legs = route.path.map((p, i) => {
    const prev = route.path[i - 1];
    if (!prev || prev.levelId !== p.levelId) return 0;
    return Math.hypot(p.coord[0] - prev.coord[0], p.coord[1] - prev.coord[1]);
  });
  const total = legs.reduce((a, b) => a + b, 0);
  let sum = 0;
  return legs.map((leg) => {
    sum += leg;
    return start + (total === 0 ? 0 : (sum / total) * route.minutes * M);
  });
}

/**
 * 一轮巡逻的核对：每个检查点的计划时刻、实际经过时刻和状态。
 * passes 是这名警卫经过检查点的记录（检查点编号和时刻）。
 */
export function checkPatrol(
  route: Route,
  start: number,
  passes: readonly { code: string; time: number }[],
  now: number,
): CheckpointResult[] {
  if (route.kind !== 'patrol') throw new Error(`route ${route.code} is not a patrol route`);
  const schedule = scheduleOf(route, start);
  const end = schedule.at(-1)!;
  return route.stops.map((stop) => {
    const due = schedule[stop.index]!;
    const pass = passes.find((p) => p.code === stop.code && p.time >= start && p.time <= now);
    let status: CheckpointStatus;
    if (pass) status = pass.time > due + PATROL_TOLERANCE_MS ? 'late' : 'passed';
    else if (now > end + PATROL_TOLERANCE_MS) status = 'missed';
    else status = now > due + PATROL_TOLERANCE_MS ? 'late' : 'upcoming';
    return { code: stop.code, unitId: stop.unitId, due, passedAt: pass?.time ?? null, status };
  });
}
