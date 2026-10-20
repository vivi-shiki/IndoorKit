import { ASSET_STATUSES, type AssetStatus, ROLES, type Role } from '@indoorkit/hospital';

/** 地图上的角色颜色；界面上的角色色点用同一组颜色 */
export const ROLE_COLORS: Record<Role, string> = {
  nurse: '#2563eb',
  doctor: '#16a34a',
  patient: '#9333ea',
  visitor: '#64748b',
  caregiver: '#0d9488',
  security: '#1f2937',
};

export const STATUS_COLORS: Record<AssetStatus, string> = {
  running: '#16a34a',
  idle: '#6b7280',
  offline: '#dc2626',
  maintenance: '#ea580c',
};
/** 从严重到轻微，决定区块聚合点的颜色 */
export const STATUS_ORDER: readonly AssetStatus[] = ['offline', 'maintenance', 'running', 'idle'];
export { ASSET_STATUSES, ROLES };

/** 按 role 属性着色的 MapLibre 表达式 */
export const roleColor = [
  'match',
  ['get', 'role'],
  ...Object.entries(ROLE_COLORS).flat(),
  '#2563eb',
] as unknown as string;
