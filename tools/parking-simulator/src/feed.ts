import type { DataProvider, PositionBatch } from '@indoorkit/rtls';
import type { ParkingDay } from './simulation';

export interface ParkingFeedOptions {
  /** 模拟从这个时刻开始（毫秒，0 为今天 0 点） */
  startAt: number;
  /** 上报间隔（真实时间，毫秒） */
  intervalMs: number;
  /** 时间倍速，默认 1 */
  speed?: number;
  /** 真实时钟，默认 performance.now */
  now?: () => number;
}

/** 模拟时钟加实时位置数据源：每个间隔上报一次正在行驶的车辆，batch.time 是模拟时刻 */
export interface ParkingFeed extends DataProvider {
  /** 当前模拟时刻 */
  time(): number;
  speed(): number;
  /** 换倍速时从当前模拟时刻继续，不跳回 */
  setSpeed(speed: number): void;
}

export function createParkingFeed(day: ParkingDay, options: ParkingFeedOptions): ParkingFeed {
  const now = options.now ?? (() => performance.now());
  let speed = options.speed ?? 1;
  let baseSim = options.startAt;
  let baseReal = now();
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(batch: PositionBatch) => void>();
  const time = () => baseSim + (now() - baseReal) * speed;
  const emit = () => {
    const t = time();
    const batch: PositionBatch = {
      time: t,
      positions: day.movingAt(t).map((m) => ({ id: m.id, levelId: m.levelId, coord: m.coord })),
    };
    for (const l of [...listeners]) l(batch);
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  return {
    time,
    speed: () => speed,
    setSpeed(next) {
      baseSim = time();
      baseReal = now();
      speed = next;
    },
    start() {
      if (timer !== undefined) return;
      timer = setInterval(emit, options.intervalMs);
    },
    stop,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
