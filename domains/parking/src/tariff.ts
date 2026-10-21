const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** 计时收费的价格表：白天按 30 分钟、夜间按 60 分钟计，夜间最高和入场后 24 小时最高 */
export interface Tariff {
  day: { fromHour: number; toHour: number; unitMs: number; price: number };
  night: { unitMs: number; price: number; max: number };
  max24h: number;
}

export const DEFAULT_TARIFF: Tariff = {
  day: { fromHour: 8, toHour: 22, unitMs: 30 * 60_000, price: 300 },
  night: { unitMs: 60 * 60_000, price: 100, max: 500 },
  max24h: 2500,
};

export interface FeeLine {
  kind: 'day' | 'night';
  from: number;
  to: number;
  units: number;
  /** 已按夜间最高封顶 */
  amount: number;
}

export interface Fee {
  total: number;
  /** 按时段拆分的明细 */
  lines: FeeLine[];
  /** 24 小时最高收费减掉的金额 */
  capped: number;
}

/** 一天中的时刻（毫秒），负数时间（前一天）也按 0～24 时计 */
const timeOfDay = (t: number) => ((t % DAY) + DAY) % DAY;

/**
 * 计算 entry 到 exit 的停车费。时间是毫秒，0 为模拟当天 0 点。
 * 每个计费单位按它开始的时段计价；夜间（22～8 时）每晚最高 night.max；
 * 从入场起每 24 小时最高 max24h。
 */
export function feeFor(entry: number, exit: number, tariff: Tariff = DEFAULT_TARIFF): Fee {
  if (exit < entry) throw new Error('exit is before entry');
  const { day, night } = tariff;
  const isDay = (t: number) => {
    const h = timeOfDay(t) / HOUR;
    return h >= day.fromHour && h < day.toHour;
  };
  /** 夜间单位属于哪一晚：以那一晚开始（22 时）所在的日子编号 */
  const nightOf = (t: number) => Math.floor((t - day.toHour * HOUR) / DAY);

  const blocks: { start: number; end: number; kind: FeeLine['kind']; night: number; amount: number }[] = [];
  const nightTotals = new Map<number, number>();
  for (let t = entry; t < exit; ) {
    const kind = isDay(t) ? 'day' : 'night';
    const rate = kind === 'day' ? day : night;
    let amount = rate.price;
    const n = nightOf(t);
    if (kind === 'night') {
      const used = nightTotals.get(n) ?? 0;
      amount = Math.max(0, Math.min(amount, night.max - used));
      nightTotals.set(n, used + amount);
    }
    blocks.push({ start: t, end: Math.min(t + rate.unitMs, exit), kind, night: n, amount });
    t += rate.unitMs;
  }

  const lines: FeeLine[] = [];
  for (const b of blocks) {
    const last = lines.at(-1);
    const sameRun = last && last.kind === b.kind && (b.kind === 'day' || nightOf(last.from) === b.night);
    if (last && sameRun && last.to === b.start) {
      last.to = b.end;
      last.units++;
      last.amount += b.amount;
    } else {
      lines.push({ kind: b.kind, from: b.start, to: b.end, units: 1, amount: b.amount });
    }
  }

  const windows = new Map<number, number>();
  for (const b of blocks) {
    const w = Math.floor((b.start - entry) / DAY);
    windows.set(w, (windows.get(w) ?? 0) + b.amount);
  }
  let capped = 0;
  for (const sum of windows.values()) capped += Math.max(0, sum - tariff.max24h);
  const gross = lines.reduce((s, l) => s + l.amount, 0);
  return { total: gross - capped, lines, capped };
}
