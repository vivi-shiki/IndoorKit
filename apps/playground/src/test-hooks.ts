/** 端到端测试和 agent 通过 window.__vivi 读取当前页面状态 */
export interface ViviTestHooks {
  ready: boolean;
  demo: 'gallery' | 'tracking' | 'assets' | 'trail' | 'alerts' | 'occupancy';
  // 所有地图页
  floor(): string;
  levelIdOf(shortName: string): string;
  renderedLevelIds(layerId: string): string[];
  renderedCount(layerId: string): number;
  /** 地图内标注当前优先使用的语言 */
  labelLanguage(): string;
  /** Labels of the resources the map has registered with its ResourceTracker */
  resourceLabels(): string[];
  /** Ids of every layer in the live MapLibre style, in drawing order */
  styleLayerIds(): string[];
  /** 地图背景色，用于检查主题 */
  mapBackground(): string;
  /** 场馆中心在视口里的位置，用来检查它没有被面板盖住 */
  venueScreenCenter(): { x: number; y: number };
  // 带科室范围的页面
  departmentIdOf(code: string): string;
  highlightedDepartment(): string | null;
  departmentLayerVisible(): boolean;
  // 人员实时定位
  perf(): { fps: number; frameMs: number; tags: number };
  /** 当前楼层一个已上报多次的标签在屏幕上的位置 */
  tagScreenPoint(): { id: string; x: number; y: number; samples: number } | null;
  replaying(): string | null;
  /** 当前画出的人员角色，去重排序 */
  renderedRoles(): string[];
  /** 选中（跟随）的人员 */
  selected(): string | null;
  /** 一个不在当前楼层的人，名字为当前语言 */
  personOnAnotherFloor(): { id: string; name: string; floor: string };
  // 设备分布总览
  /** 当前楼层的区块聚合点数量 */
  clusterCount(): number;
  /** 当前楼层聚合点里设备所属科室，去重排序 */
  groupDepartments(): string[];
  /** 当前楼层聚合点里设备的状态，去重排序 */
  groupStatuses(): string[];
  /** 当前楼层一个聚合点在屏幕上的位置 */
  clusterScreenPoint(): { unitId: string; x: number; y: number; count: number } | null;
  drawerUnit(): string | null;
  detailAsset(): string | null;
  /** 一台不在当前楼层的设备 */
  assetOnAnotherFloor(): { id: string; code: string; floor: string };
  // 轨迹回放
  trailPerson(): string;
  trailRange(): [number, number];
  trailTime(): number;
  trailStops(): { start: number; floor: string }[];
  trailHeadFloor(): string;
  // 禁入区域告警
  fenceIds(): string[];
  alertCount(): number;
  alarmLayers(): string[];
  alarmState(id: string): 'open' | 'acknowledged' | 'resolved';
  unhandledCount(): number;
  // 人流密度分析
  heatWindow(): number;
  heatPointCount(): number;
  heatLevelIds(): string[];
  heatGroups(): string[] | null;
}

/** 跨页面的全局统计，用来检查页面切换后是否有残留 */
export interface ViviStats {
  /** 尚未终止的模拟 Worker 数 */
  activeWorkers: number;
  /** 已创建但尚未销毁的地图数 */
  liveMaps: number;
  /** 最近一次销毁地图后 resources.size，从未销毁过时为 null */
  lastUnreleased: number | null;
}

declare global {
  interface Window {
    __vivi?: ViviTestHooks;
    __viviStats?: ViviStats;
  }
}

const unavailable = () => {
  throw new Error('not available in this demo');
};

export function setHooks(partial: Partial<ViviTestHooks> & Pick<ViviTestHooks, 'demo'>): ViviTestHooks {
  const hooks: ViviTestHooks = {
    ready: false,
    floor: unavailable,
    levelIdOf: unavailable,
    renderedLevelIds: unavailable,
    renderedCount: unavailable,
    labelLanguage: unavailable,
    resourceLabels: unavailable,
    styleLayerIds: unavailable,
    mapBackground: unavailable,
    venueScreenCenter: unavailable,
    departmentIdOf: unavailable,
    highlightedDepartment: unavailable,
    departmentLayerVisible: unavailable,
    renderedRoles: unavailable,
    selected: unavailable,
    personOnAnotherFloor: unavailable,
    groupDepartments: unavailable,
    groupStatuses: unavailable,
    clusterScreenPoint: unavailable,
    drawerUnit: unavailable,
    detailAsset: unavailable,
    assetOnAnotherFloor: unavailable,
    trailPerson: unavailable,
    trailRange: unavailable,
    trailTime: unavailable,
    trailStops: unavailable,
    trailHeadFloor: unavailable,
    alarmLayers: unavailable,
    alarmState: unavailable,
    unhandledCount: unavailable,
    heatGroups: unavailable,
    perf: unavailable,
    tagScreenPoint: unavailable,
    replaying: unavailable,
    clusterCount: unavailable,
    fenceIds: unavailable,
    alertCount: unavailable,
    heatWindow: unavailable,
    heatPointCount: unavailable,
    heatLevelIds: unavailable,
    ...partial,
  };
  window.__vivi = hooks;
  return hooks;
}

export function stats(): ViviStats {
  window.__viviStats ??= { activeWorkers: 0, liveMaps: 0, lastUnreleased: null };
  return window.__viviStats;
}
