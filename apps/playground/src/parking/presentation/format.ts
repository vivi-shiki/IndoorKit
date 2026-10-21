import { maskPlate } from '@indoorkit/parking';
import { pt } from '../i18n';

const H = 3600_000;
const DAY = 24 * H;

/** 一天中的时刻 14:05；前一天的时刻带「昨天」 */
export function clockText(t: number): string {
  const tod = ((t % DAY) + DAY) % DAY;
  const h = Math.floor(tod / H);
  const m = Math.floor((tod % H) / 60_000);
  const text = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return t < 0 ? pt('time.yesterday', { time: text }) : text;
}

/** 时长：1 小时 20 分；不到 1 小时只写分钟 */
export function durationText(ms: number): string {
  const total = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? pt('duration.hm', { h, m }) : pt('duration.m', { m });
}

export const yen = (amount: number) => `¥${amount.toLocaleString('en-US')}`;

export const percent = (value: number) => `${Math.round(value * 100)}%`;

/** 车牌：默认最后两位打码 */
export const plateText = (plate: string, shown: boolean) => (shown ? plate : maskPlate(plate));
