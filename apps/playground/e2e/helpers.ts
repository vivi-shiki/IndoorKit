import { expect, type Page } from '@playwright/test';
import '../src/test-hooks';

/** 画廊里的四个业务页面 */
export const DEMOS = ['tracking', 'assets', 'alerts', 'occupancy'] as const;
export type Demo = (typeof DEMOS)[number];

/** 各页面在三种语言下的标题（业务名称，不带编号） */
export const TITLES: Record<Demo, { en: string; zh: string; ja: string }> = {
  tracking: { en: 'Real-time Tracking', zh: '人员实时定位', ja: 'リアルタイム位置監視' },
  assets: { en: 'Asset Distribution', zh: '设备资产分布', ja: '医療機器の分布' },
  alerts: { en: 'Restricted Zone Alerts', zh: '禁入区域告警', ja: '立入制限エリア警報' },
  occupancy: { en: 'Occupancy Heatmap', zh: '人流密度分析', ja: '混雑状況ヒートマップ' },
};

/** 产品名：浏览器标签页标题和首页大标题使用 */
export const PRODUCT = {
  en: 'Hospital RTLS Console',
  zh: '院内定位管理平台',
  ja: '院内位置情報管理システム',
};

/** 打开一个页面并等它进入就绪状态 */
export async function openDemo(page: Page, demo: Demo) {
  await page.goto(`./#/${demo}`);
  await page.waitForFunction((d) => window.__vivi?.demo === d && window.__vivi.ready === true, demo, {
    timeout: 30_000,
  });
}

/** 轮询读取页面里的值，直到断言成立 */
export function pollHook<T>(page: Page, fn: () => T) {
  return expect.poll(() => page.evaluate(fn), { timeout: 20_000 });
}
