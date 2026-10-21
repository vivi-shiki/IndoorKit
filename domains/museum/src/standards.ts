import type { Material, Sensitivity } from './extensions';

const H = 3600_000;

/**
 * 演示用的保存标准，按敏感度分三档。数值是保存领域常见的参考值，不是某个规范的原文；
 * 真实系统由馆方按自己的方针设定。
 */
export interface ConservationStandard {
  /** 照度上限（lx） */
  maxLux: number;
  /** 一年的累计光照量预算（lx·h）；不限时为 null */
  annualLxh: number | null;
  /** 相对湿度范围（%） */
  rh: readonly [number, number];
  /** 温度范围（℃） */
  temperature: readonly [number, number];
}

export const STANDARDS: Record<Sensitivity, ConservationStandard> = {
  high: { maxLux: 50, annualLxh: 120_000, rh: [50, 60], temperature: [20, 24] },
  medium: { maxLux: 150, annualLxh: 500_000, rh: [50, 60], temperature: [20, 24] },
  low: { maxLux: 300, annualLxh: null, rh: [45, 65], temperature: [19, 25] },
};

/** 纸本、染织对光最敏感；油画、漆器、木雕次之；陶瓷、金属、石材最不敏感 */
export const MATERIAL_SENSITIVITY: Record<Material, Sensitivity> = {
  paper: 'high',
  textile: 'high',
  painting: 'medium',
  lacquer: 'medium',
  wood: 'medium',
  ceramic: 'low',
  metal: 'low',
  stone: 'low',
};

export const CONSERVATION_LIMITS = {
  /** 24 小时内相对湿度的最大值减最小值超过这个值就告警，即使都在范围内 */
  rhDailySwing: 10,
  /** 累计光照量到预算的这个比例时预警 */
  exposureWarn: 0.8,
  /** 指定文化财一年里公开的天数上限，以及提前多少天预警 */
  displayDays: 60,
  displayDaysWarn: 10,
};

/** 开馆时间 9:30～17:00；展示室照明 9:00 开、17:30 关 */
export const OPENING_HOURS = {
  open: 9.5 * H,
  close: 17 * H,
  lightsOn: 9 * H,
  lightsOff: 17.5 * H,
};

const DAY = 24 * H;
const timeOfDay = (t: number) => ((t % DAY) + DAY) % DAY;

/** 开馆中（来馆者可以在展示室里） */
export const isOpen = (t: number) => {
  const tod = timeOfDay(t);
  return tod >= OPENING_HOURS.open && tod < OPENING_HOURS.close;
};

/** 展示室照明开着 */
export const lightsOn = (t: number) => {
  const tod = timeOfDay(t);
  return tod >= OPENING_HOURS.lightsOn && tod < OPENING_HOURS.lightsOff;
};

/** 同一个房间或展示柜里有几档藏品时取最严格的 */
export function strictest(sensitivities: Iterable<Sensitivity>): Sensitivity {
  let worst: Sensitivity = 'low';
  for (const s of sensitivities) {
    if (s === 'high') return 'high';
    if (s === 'medium') worst = 'medium';
  }
  return worst;
}

export type Assessment = 'below' | 'ok' | 'above';

/** 环境指标 */
export const METRICS = ['temperature', 'humidity', 'illuminance', 'co2'] as const;
export type Metric = (typeof METRICS)[number];

/** CO2 浓度上限（ppm），人多时换气不足的指标 */
export const CO2_LIMIT = 1000;

/**
 * 告警解除时的回差：已经超出范围的读数要回到范围内这么多才算恢复，
 * 读数在边界附近抖动时不会反复告警。
 */
export const HYSTERESIS: Record<Metric, number> = { temperature: 0.5, humidity: 2, illuminance: 5, co2: 50 };

/**
 * 读数相对保存标准偏低、正常还是偏高；照度只有上限，CO2 只看上限。
 * margin 把范围往里收（判断异常是否解除时用 HYSTERESIS）。
 */
export function assess(
  standard: ConservationStandard,
  metric: Metric,
  value: number,
  margin = 0,
): Assessment {
  if (metric === 'illuminance') return value > standard.maxLux - margin ? 'above' : 'ok';
  if (metric === 'co2') return value > CO2_LIMIT - margin ? 'above' : 'ok';
  const [min, max] = metric === 'temperature' ? standard.temperature : standard.rh;
  return value < min + margin ? 'below' : value > max - margin ? 'above' : 'ok';
}
