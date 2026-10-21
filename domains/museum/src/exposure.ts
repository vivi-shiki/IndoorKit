import type { MuseumObject } from './model';
import { CONSERVATION_LIMITS, type ConservationStandard } from './standards';

const H = 3600_000;
const DAY = 24 * H;

/** 照度的一串读数（按时间排序）积分成累计光照量（lx·h），相邻两点之间按梯形算 */
export function exposureLxh(samples: readonly { time: number; lux: number }[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (b.time < a.time) throw new Error('samples must be in time order');
    total += ((a.lux + b.lux) / 2) * ((b.time - a.time) / H);
  }
  return total;
}

/** 累计光照量占年度预算的比例；没有预算（低敏感度）时为 null */
export function budgetShare(lxh: number, standard: ConservationStandard): number | null {
  return standard.annualLxh === null ? null : lxh / standard.annualLxh;
}

/**
 * 按近几天的平均每日光照量，预算还能撑几天；已经用完为 0，没有预算或没有照光为 null。
 */
export function daysUntilBudget(
  lxh: number,
  dailyAverage: number,
  standard: ConservationStandard,
): number | null {
  if (standard.annualLxh === null || dailyAverage <= 0) return null;
  return Math.max(0, Math.floor((standard.annualLxh - lxh) / dailyAverage));
}

/** 指定文化财今年还能公开几天；不是指定文化财为 null */
export function displayDaysLeft(object: MuseumObject, displayedDays: number): number | null {
  return object.designated ? Math.max(0, CONSERVATION_LIMITS.displayDays - displayedDays) : null;
}

/**
 * 一个传感器最近一段时间（默认 24 小时）的读数，用来判断湿度的日波动。
 * 只保存窗口里的读数，旧的自动丢掉；最大值和最小值用单调队列维护，每次加读数是均摊 O(1)。
 */
export function createReadingWindow(windowMs = DAY) {
  const times: number[] = [];
  let head = 0;
  // 下标单调递增、值单调递减（max）或递增（min）的队列，存的是读数的序号
  const values: number[] = [];
  const maxQ: number[] = [];
  const minQ: number[] = [];
  let maxHead = 0;
  let minHead = 0;
  return {
    push(time: number, value: number) {
      if (times.length > head && time < times.at(-1)!) throw new Error('readings must be in time order');
      const i = times.length;
      times.push(time);
      values.push(value);
      while (maxQ.length > maxHead && values[maxQ.at(-1)!]! <= value) maxQ.pop();
      maxQ.push(i);
      while (minQ.length > minHead && values[minQ.at(-1)!]! >= value) minQ.pop();
      minQ.push(i);
      while (times[head]! < time - windowMs) head++;
      while (maxQ[maxHead]! < head) maxHead++;
      while (minQ[minHead]! < head) minHead++;
    },
    size: () => times.length - head,
    /** 窗口里最大值减最小值；没有读数为 0 */
    swing: () => (times.length === head ? 0 : values[maxQ[maxHead]!]! - values[minQ[minHead]!]!),
    /** 读数覆盖的时长 */
    span: () => (times.length === head ? 0 : times.at(-1)! - times[head]!),
  };
}
export type ReadingWindow = ReturnType<typeof createReadingWindow>;
