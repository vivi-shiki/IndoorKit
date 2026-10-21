/** mulberry32，种子固定时结果固定 */
export function random(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 0～1 之间、与 key 绑定的固定值 */
export const unit = (key: string) => hash(key) / 4294967296;

/**
 * 平滑的噪声：几条不同周期的正弦叠加，相位由 key 决定。
 * 同一个 key、同一时刻永远得到同一个值，所以任何时刻的读数都可以直接算出来，不用逐秒模拟。
 */
export function wave(key: string, t: number, amplitude: number): number {
  const minutes = t / 60_000;
  let sum = 0;
  for (const [period, weight] of [
    [47, 0.5],
    [131, 0.3],
    [313, 0.2],
  ] as const) {
    sum += weight * Math.sin((2 * Math.PI * minutes) / period + unit(`${key}/${period}`) * 2 * Math.PI);
  }
  return sum * amplitude;
}
