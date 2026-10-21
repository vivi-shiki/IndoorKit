import type { Metric } from '@indoorkit/museum';
import { mt } from '../i18n';

const H = 3600_000;
const DAY = 24 * H;

/** 一天中的时刻 14:05；前一天的时刻带「昨天」 */
export function clockText(t: number): string {
  const tod = ((t % DAY) + DAY) % DAY;
  const h = Math.floor(tod / H);
  const m = Math.floor((tod % H) / 60_000);
  const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return t < 0 ? mt('time.yesterday', { time: text }) : text;
}

/** 时长：1 小时 20 分；不到 1 小时只写分钟 */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? mt('duration.hm', { h, m }) : mt('duration.m', { m });
}

/** 指标的单位；国际通用，三种语言相同 */
export const UNITS: Record<Metric, string> = {
  temperature: '℃',
  humidity: '%',
  illuminance: 'lx',
  co2: 'ppm',
};

/** 读数：温度和湿度保留一位小数，照度和 CO2 取整 */
export function valueText(metric: Metric, value: number | null): string {
  if (value === null) return '—';
  const digits = metric === 'temperature' || metric === 'humidity' ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[metric]}`;
}

/** 累计光照量：千位分隔，单位 lx·h */
export const lxhText = (lxh: number) => `${Math.round(lxh).toLocaleString('en-US')} lx·h`;

export const percent = (value: number) => `${Math.round(value * 100)}%`;
