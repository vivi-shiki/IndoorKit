import type { AnyPlugin, IndoorMap } from '@indoorkit/core';
import { inspect } from '@indoorkit/core/testing';
import type { ParkingPage } from '../routes';

/** 端到端测试和 agent 通过 window.__parking 读取停车场页面的状态 */
export interface ParkingTestHooks {
  page: ParkingPage;
  ready: boolean;
  /** 模拟时刻和倍速 */
  time(): number;
  speed(): number;
  floor(): string;
  /** 地图内标注当前优先使用的语言 */
  labelLanguage(): string;
  /** 放大到某个车位（当前楼层），动画结束后 idle() 为 true */
  showBay(code: string): void;
  /** 地图空闲（没有动画和待加载的瓦片） */
  idle(): boolean;
  /** 车位中心在视口里的位置 */
  bayScreenPoint(code: string): { x: number; y: number };
  /** 加粗描边的车位编号 */
  highlighted(): string[];
  /** 地图上的标记数（显示屏、设备） */
  markerCount(): number;
  /** 各状态的车位数；运营分析页是各利用率档位的车位数 */
  stateCounts(): Record<string, number>;
  /** 某层（简称）的空闲车位数 */
  freeOn(floor: string): number;
  /** 余位显示屏上的数字 */
  displays(): { code: string; free: number; full: boolean }[];
  // 车辆进出
  /** 一辆今天入场、正停在车位上的计时车辆的车牌 */
  parkedPlate(): string;
  // 异常告警
  alarms(): { id: string; rule: string; tier: string; level: string; state: string }[];
  alarmState(id: string): string;
  // 预约与导航
  routeLevels(): string[];
  routeMeters(): number;
}

declare global {
  interface Window {
    __parking?: ParkingTestHooks;
  }
}

const unavailable = () => {
  throw new Error('not available on this page');
};

export function setParkingHooks(page: ParkingPage): ParkingTestHooks {
  const hooks: ParkingTestHooks = {
    page,
    ready: false,
    time: unavailable,
    speed: unavailable,
    floor: unavailable,
    labelLanguage: unavailable,
    showBay: unavailable,
    idle: unavailable,
    bayScreenPoint: unavailable,
    highlighted: unavailable,
    markerCount: unavailable,
    stateCounts: unavailable,
    freeOn: unavailable,
    displays: unavailable,
    parkedPlate: unavailable,
    alarms: unavailable,
    alarmState: unavailable,
    routeLevels: unavailable,
    routeMeters: unavailable,
  };
  window.__parking = hooks;
  return hooks;
}

/** 要读底层地图的钩子：只在测试层通过 core 的 inspect 读取，页面不碰底层地图 */
export function installParkingMapHooks(
  indoor: IndoorMap<readonly AnyPlugin[]>,
  hooks: ParkingTestHooks,
  bayCenter: (code: string) => [number, number],
) {
  const view = inspect(indoor);
  hooks.labelLanguage = () => {
    const field = view.layout('indoor-labels', 'text-field') as [string, [string, string]];
    return field[1][1].replace('label_', '');
  };
  let idle = true;
  hooks.showBay = (code) => {
    idle = false;
    view.setZoom(20);
    indoor.camera.focus(bayCenter(code), { durationMs: 0 });
    void indoor.idle().then(() => {
      idle = true;
    });
  };
  hooks.idle = () => idle;
  hooks.bayScreenPoint = (code) => {
    const point = indoor.project(bayCenter(code));
    const box = view.container().getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  };
}
