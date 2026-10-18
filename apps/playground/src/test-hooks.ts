/** 端到端测试通过 window.__vivi 读取页面状态 */
export interface ViviTestHooks {
  ready: boolean;
  demo: 'gallery' | 'basic' | 'memory';
  // Demo 1
  floor(): string;
  levelIdOf(shortName: string): string;
  renderedLevelIds(layerId: string): string[];
  renderedCount(layerId: string): number;
  /** 地图内标注当前优先使用的语言 */
  labelLanguage(): string;
  // Demo 2
  cycles: number;
  unreleased: number;
  runCycles(n: number): Promise<void>;
}

declare global {
  interface Window {
    __vivi?: ViviTestHooks;
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
    cycles: 0,
    unreleased: 0,
    runCycles: unavailable,
    ...partial,
  };
  window.__vivi = hooks;
  return hooks;
}
