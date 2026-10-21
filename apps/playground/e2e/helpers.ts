import { expect, type Page } from '@playwright/test';
import '../src/testing/hooks';

/** 医院演示的业务页面，按侧栏菜单里的两个业务视图分组 */
export const GROUPS = {
  efficiency: ['assets'],
  people: ['tracking', 'trail', 'alerts', 'occupancy'],
} as const;
export const DEMOS = [...GROUPS.efficiency, ...GROUPS.people] as const;
export type Demo = (typeof DEMOS)[number];

/** 两条业务线在三种语言下的名称 */
export const GROUP_TITLES: Record<keyof typeof GROUPS, { en: string; zh: string; ja: string }> = {
  efficiency: { en: 'Equipment', zh: '设备', ja: '機器' },
  people: { en: 'People', zh: '人员', ja: '院内の人' },
};

/** 各页面在三种语言下的标题（业务名称，不带编号） */
export const TITLES: Record<Demo, { en: string; zh: string; ja: string }> = {
  assets: { en: 'Equipment Map', zh: '设备地图', ja: '機器マップ' },
  tracking: { en: 'Live People Tracking', zh: '人员实时定位', ja: '院内の人の現在地' },
  trail: { en: 'Movement Replay', zh: '轨迹回放', ja: '移動履歴の再生' },
  alerts: { en: 'Alerts', zh: '告警中心', ja: 'アラート一覧' },
  occupancy: { en: 'Location Report Heatmap', zh: '定位上报热力图', ja: '位置報告ヒートマップ' },
};

/** 医院演示的名称：侧栏标题和浏览器标签页标题使用 */
export const PRODUCT = {
  en: 'Hospital Indoor Positioning Demo',
  zh: '医院室内定位演示',
  ja: '病院内位置情報デモ',
};

/** 各页面标题下的一句说明（英文） */
export const PAGE_DESCS: Record<Demo, string> = {
  assets: 'Browse devices by department and room, with their operating status and operating time today.',
  tracking:
    'Filter people by type or department, select a person to view details, and enable following to keep their location in view.',
  trail: 'Replay a person’s movements over the selected period, including stops and related alerts.',
  alerts:
    'Review and manage alerts from department rules, geofences, and equipment or personal status reports.',
  occupancy:
    'View the distribution of location reports by time range and person type. Colors represent report counts, not the number of people currently present.',
};

/** 首页：SDK 名称和一句话介绍 */
export const TAGLINES = {
  en: 'An indoor mapping SDK for IoT applications. Display tag locations, sensor data, and equipment status on a single map.',
  zh: '面向物联网的室内地图 SDK，在同一张地图上展示定位标签的位置、传感器数据和设备状态。',
  ja: 'IoT 向けの屋内地図 SDK。タグの位置、センサーデータ、機器の状態を 1 枚の地図に表示します。',
};

/** 打开首页并等它就绪 */
export async function openHome(page: Page, path = './') {
  await page.goto(path);
  await page.waitForFunction(() => window.__vivi?.demo === 'home' && window.__vivi.ready === true);
}

/** 打开医院演示的一个页面（可带 ?key=value 参数）并等它进入就绪状态 */
export async function openDemo(page: Page, demo: Demo, query = '') {
  await page.goto(`./#/hospital/${demo}${query ? `?${query}` : ''}`);
  await page.waitForFunction((d) => window.__vivi?.demo === d && window.__vivi.ready === true, demo, {
    timeout: 30_000,
  });
}

/** 轮询读取页面里的值，直到断言成立 */
export function pollHook<T>(page: Page, fn: () => T) {
  return expect.poll(() => page.evaluate(fn), { timeout: 20_000 });
}
