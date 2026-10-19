import { expect, type Page } from '@playwright/test';
import '../src/test-hooks';

/** 画廊里的业务页面，按业务线分组 */
export const GROUPS = {
  efficiency: ['assets'],
  people: ['tracking', 'trail', 'alerts', 'occupancy'],
} as const;
export const DEMOS = [...GROUPS.efficiency, ...GROUPS.people] as const;
export type Demo = (typeof DEMOS)[number];

/** 两条业务线在三种语言下的名称 */
export const GROUP_TITLES: Record<keyof typeof GROUPS, { en: string; zh: string; ja: string }> = {
  efficiency: { en: 'Equipment View', zh: '设备视图', ja: '機器ビュー' },
  people: { en: 'People View', zh: '人员视图', ja: '人ビュー' },
};

/** 各页面在三种语言下的标题（业务名称，不带编号） */
export const TITLES: Record<Demo, { en: string; zh: string; ja: string }> = {
  assets: { en: 'Equipment Map', zh: '设备地图', ja: '機器マップ' },
  tracking: { en: 'Live Map', zh: '实时位置', ja: '現在地マップ' },
  trail: { en: 'Route History', zh: '路线回看', ja: '経路の振り返り' },
  alerts: { en: 'Boundary Notices', zh: '越界提醒', ja: '境界通知' },
  occupancy: { en: 'Crowding Heatmap', zh: '拥挤热度', ja: '混み具合ヒートマップ' },
};

/** 产品名：浏览器标签页标题和首页大标题使用 */
export const PRODUCT = {
  en: 'Indoor Hospital Map',
  zh: '医院室内地图看板',
  ja: '病院屋内マップ',
};

/** 打开一个页面（可带 ?key=value 参数）并等它进入就绪状态 */
export async function openDemo(page: Page, demo: Demo, query = '') {
  await page.goto(`./#/${demo}${query ? `?${query}` : ''}`);
  await page.waitForFunction((d) => window.__vivi?.demo === d && window.__vivi.ready === true, demo, {
    timeout: 30_000,
  });
}

/** 轮询读取页面里的值，直到断言成立 */
export function pollHook<T>(page: Page, fn: () => T) {
  return expect.poll(() => page.evaluate(fn), { timeout: 20_000 });
}
