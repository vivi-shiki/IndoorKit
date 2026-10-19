import { expect, type Page } from '@playwright/test';
import '../src/test-hooks';

export const DEMOS = ['basic', 'memory', 'realtime', 'cluster', 'geofence', 'heatmap'] as const;
export type Demo = (typeof DEMOS)[number];

/** 打开一个示例页并等它进入就绪状态 */
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
