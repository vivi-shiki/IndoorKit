import type { BayType, DeviceKind } from '@indoorkit/parking';
import type { BayState } from '../adapters/live';

/** 车位状态的填充色：空闲绿、有车灰、已预约蓝、需要处理红、检测不到琥珀 */
export const STATE_COLORS: Record<BayState, string> = {
  alert: '#dc2626',
  unknown: '#d97706',
  reserved: '#2563eb',
  occupied: '#94a3b8',
  free: '#16a34a',
};

/** 特殊用途车位的描边色；普通车位不描边 */
export const TYPE_OUTLINES: Record<Exclude<BayType, 'standard'>, string> = {
  monthly: '#7c3aed',
  ev: '#0d9488',
  accessible: '#0284c7',
  large: '#ea580c',
};

/** 设备标记的颜色 */
export const DEVICE_COLORS: Record<DeviceKind, string> = {
  'bay-sensor': '#64748b',
  'ai-camera': '#7c3aed',
  'lpr-camera': '#7c3aed',
  gate: '#334155',
  flap: '#334155',
  display: '#15803d',
  charger: '#0d9488',
  'co-sensor': '#b45309',
  intercom: '#be185d',
  'pay-station': '#334155',
};

/** 余位显示屏：有空位绿、已满红 */
export const SIGN_COLORS = { free: '#15803d', full: '#dc2626' };

/** 利用率色阶：0～20%、20～40% … 80～100% */
export const UTILIZATION_COLORS = {
  u0: '#dbeafe',
  u1: '#93c5fd',
  u2: '#3b82f6',
  u3: '#1d4ed8',
  u4: '#172554',
} as const;
export type UtilizationBucket = keyof typeof UTILIZATION_COLORS;

export const bucketOf = (u: number): UtilizationBucket =>
  `u${Math.min(4, Math.floor(u * 5))}` as UtilizationBucket;
