import type { AnyPlugin, IndoorMap } from '@indoorkit/core';
import { inspect } from '@indoorkit/core/testing';
import type { MuseumPage } from '../routes';

/** 端到端测试和 agent 通过 window.__museum 读取博物馆页面的状态 */
export interface MuseumTestHooks {
  page: MuseumPage;
  ready: boolean;
  /** 模拟时刻和倍速 */
  time(): number;
  speed(): number;
  floor(): string;
  /** 地图内标注当前优先使用的语言 */
  labelLanguage(): string;
  /** 放大到某个展示室或展示柜（编号），动画结束后 idle() 为 true */
  showUnit(code: string): void;
  /** 地图空闲（没有动画和待加载的瓦片） */
  idle(): boolean;
  /** 展示室或展示柜中心在视口里的位置 */
  unitScreenPoint(code: string): { x: number; y: number };
  /** 加粗描边的展示室或展示柜编号 */
  highlighted(): string[];
  /** 地图上的标记数 */
  markerCount(): number;
  /** 着色的状态和各状态的区块数 */
  stateCounts(): Record<string, number>;
  // 保存环境
  /** 某个房间或展示柜的状态 */
  stateOf(code: string): string | null;
  // 藏品与光照
  routeLevels(): string[];
  routeMeters(): number;
  // 来馆者与混雑
  /** 地图上显示的带标签来馆者数 */
  tagCount(): number;
  heatPointCount(): number;
  /** 正在回放的来馆者和停留点数 */
  trail(): { id: string; stops: number } | null;
  // 安全与巡逻
  alarms(): { id: string; rule: string; tier: string; level: string; state: string }[];
  alarmState(id: string): string;
  // 导览
  guide(): { index: number; total: number; caseCode: string; objects: string[] };
}

declare global {
  interface Window {
    __museum?: MuseumTestHooks;
  }
}

const unavailable = () => {
  throw new Error('not available on this page');
};

export function setMuseumHooks(page: MuseumPage): MuseumTestHooks {
  const hooks: MuseumTestHooks = {
    page,
    ready: false,
    time: unavailable,
    speed: unavailable,
    floor: unavailable,
    labelLanguage: unavailable,
    showUnit: unavailable,
    idle: unavailable,
    unitScreenPoint: unavailable,
    highlighted: unavailable,
    markerCount: unavailable,
    stateCounts: unavailable,
    stateOf: unavailable,
    routeLevels: unavailable,
    routeMeters: unavailable,
    tagCount: unavailable,
    heatPointCount: unavailable,
    trail: unavailable,
    alarms: unavailable,
    alarmState: unavailable,
    guide: unavailable,
  };
  window.__museum = hooks;
  return hooks;
}

/** 要读底层地图的钩子：只在测试层通过 core 的 inspect 读取，页面不碰底层地图 */
export function installMuseumMapHooks(
  indoor: IndoorMap<readonly AnyPlugin[]>,
  hooks: MuseumTestHooks,
  unitCenter: (code: string) => { levelId: string; center: [number, number] },
  setFloor: (levelId: string) => void,
) {
  const view = inspect(indoor);
  hooks.labelLanguage = () => {
    const field = view.layout('indoor-labels', 'text-field') as [string, [string, string]];
    return field[1][1].replace('label_', '');
  };
  let idle = true;
  hooks.showUnit = (code) => {
    idle = false;
    const { levelId, center } = unitCenter(code);
    setFloor(levelId);
    view.setZoom(20);
    indoor.camera.focus(center, { durationMs: 0 });
    void indoor.idle().then(() => {
      idle = true;
    });
  };
  hooks.idle = () => idle;
  hooks.unitScreenPoint = (code) => {
    const point = indoor.project(unitCenter(code).center);
    const box = view.container().getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  };
}
