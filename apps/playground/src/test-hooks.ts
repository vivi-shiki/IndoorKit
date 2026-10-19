/** 端到端测试和 agent 通过 window.__vivi 读取当前页面状态 */
export interface ViviTestHooks {
  ready: boolean;
  demo: 'gallery' | 'basic' | 'memory' | 'realtime' | 'cluster' | 'geofence' | 'heatmap';
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
  // Demo 2 内存实验室
  cycles: number;
  unreleased: number;
  runCycles(n: number): Promise<void>;
  // Demo 3 实时定位
  perf(): { fps: number; frameMs: number; tags: number };
  /** 当前楼层一个已上报多次的标签在屏幕上的位置 */
  tagScreenPoint(): { id: string; x: number; y: number; samples: number } | null;
  replaying(): string | null;
  // Demo 4 聚合对比
  clusterRun(): {
    points: number;
    naiveMs: number;
    indexedMs: number;
    match: boolean;
    clusters: number;
  } | null;
  // Demo 7 电子围栏
  fenceIds(): string[];
  alertCount(): number;
  // Demo 10 热力图
  heatWindow(): number;
  heatPointCount(): number;
  heatLevelIds(): string[];
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
    cycles: 0,
    unreleased: 0,
    runCycles: unavailable,
    perf: unavailable,
    tagScreenPoint: unavailable,
    replaying: unavailable,
    clusterRun: unavailable,
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
