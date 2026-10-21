import type { DeviceKind } from '@indoorkit/museum';
import type { BudgetState, CrowdState, EnvState } from '../adapters/live';

/** 保存环境：偏高红、偏低蓝、离线琥珀、正常绿 */
export const ENV_COLORS: Record<EnvState, string> = {
  above: '#dc2626',
  below: '#2563eb',
  offline: '#d97706',
  ok: '#16a34a',
};

/** 混雑：已满红、较多橙、宽松绿 */
export const CROWD_COLORS: Record<CrowdState, string> = {
  full: '#dc2626',
  busy: '#ea580c',
  calm: '#16a34a',
};

/** 光照预算：超出红、注意琥珀、充足绿 */
export const BUDGET_COLORS: Record<BudgetState, string> = {
  over: '#dc2626',
  warn: '#d97706',
  ok: '#16a34a',
};

/** 安防页：有未解决的告警的房间或展示柜 */
export const ALERT_COLORS = { alert: '#dc2626' };

/** 导览页：路线经过的展示室 */
export const GUIDE_COLORS = { route: '#7c3aed', here: '#db2777' };

/** 警卫的标记色 */
export const GUARD_COLOR = '#1d4ed8';

/** 设备标记的颜色 */
export const DEVICE_COLORS: Record<DeviceKind, string> = {
  climate: '#0d9488',
  light: '#ca8a04',
  co2: '#64748b',
  counter: '#7c3aed',
  beacon: '#2563eb',
  motion: '#be185d',
  door: '#334155',
  vibration: '#b45309',
  proximity: '#9333ea',
  rfid: '#15803d',
};

/** 藏品的示意色块：按材质，不用真实作品图像 */
export const MATERIAL_SWATCHES = {
  paper: ['#f5ecd7', '#8b5e34'],
  textile: ['#7f1d1d', '#fbbf24'],
  painting: ['#1e3a8a', '#f59e0b'],
  lacquer: ['#111827', '#b91c1c'],
  wood: ['#92400e', '#fde68a'],
  ceramic: ['#e0f2fe', '#0369a1'],
  metal: ['#475569', '#cbd5e1'],
  stone: ['#78716c', '#e7e5e4'],
} as const;
