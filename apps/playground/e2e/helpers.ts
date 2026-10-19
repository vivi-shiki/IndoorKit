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
  efficiency: { en: 'Asset Efficiency', zh: '效能定位系统', ja: '設備稼働管理' },
  people: { en: 'People Tracking', zh: '人员定位系统', ja: '人員位置管理' },
};

/** 各页面在三种语言下的标题（业务名称，不带编号） */
export const TITLES: Record<Demo, { en: string; zh: string; ja: string }> = {
  assets: { en: 'Asset Overview', zh: '设备分布总览', ja: '医療機器の配置状況' },
  tracking: { en: 'Real-time Tracking', zh: '人员实时定位', ja: 'リアルタイム位置監視' },
  trail: { en: 'Trail Replay', zh: '轨迹回放', ja: '軌跡再生' },
  alerts: { en: 'Zone Alerts', zh: '区域告警', ja: 'エリア警報' },
  occupancy: { en: 'Occupancy Heatmap', zh: '人流密度分析', ja: '混雑状況ヒートマップ' },
};

/** 产品名：浏览器标签页标题和首页大标题使用 */
export const PRODUCT = {
  en: 'Hospital RTLS Console',
  zh: '院内定位管理平台',
  ja: '院内位置情報管理システム',
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
