const H = 3600_000;
/** 没有指定时从下午 2 点开始：上午的换展、空调故障和各类告警都已经发生过 */
export const DEFAULT_START = 14 * H;
/** 600× 时一分钟看完十小时，能看到地图随一天的温湿度变色 */
export const SPEEDS = [1, 60, 600] as const;

/** ?t=09:30 → 9.5 小时；格式不对或超出一天时用默认时刻 */
export function parseClockParam(value: string | null): number {
  const m = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return DEFAULT_START;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return DEFAULT_START;
  return h * H + min * 60_000;
}

export interface SimClock {
  /** 模拟时刻（毫秒，0 为今天 0 点） */
  time(): number;
  speed(): number;
  /** 换倍速时从当前时刻继续 */
  setSpeed(speed: number): void;
  /** 跳到某个时刻 */
  set(time: number): void;
  subscribe(listener: () => void): () => void;
}

/** 模拟时钟：按真实时间乘以倍速前进 */
export function createSimClock(options: { start: number; now?: () => number }): SimClock {
  const now = options.now ?? (() => performance.now());
  let baseSim = options.start;
  let baseReal = now();
  let speed = 1;
  const listeners = new Set<() => void>();
  const time = () => baseSim + (now() - baseReal) * speed;
  const rebase = (sim: number) => {
    baseSim = sim;
    baseReal = now();
  };
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  return {
    time,
    speed: () => speed,
    setSpeed(next) {
      rebase(time());
      speed = next;
      notify();
    },
    set(next) {
      rebase(next);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
