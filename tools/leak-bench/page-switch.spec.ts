import { type CDPSession, expect, type Page, test } from '@playwright/test';
import { DEMOS, openDemo } from '../../apps/playground/e2e/helpers';
import { MUSEUM_PAGES, openMuseum } from '../../apps/playground/e2e/museum-helpers';
import { openParking, PARKING_PAGES } from '../../apps/playground/e2e/parking-helpers';

const WARMUP_ROUNDS = 2;
const ROUNDS = 8;
/** 反复切换全部页面后允许的 JS 堆增长上限 */
const MAX_GROWTH_BYTES = 8 * 1024 * 1024;

async function usedHeap(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
}

/** 依次打开医院、停车场和博物馆的每个页面，最后回到首页，确认上一个页面已完全卸载 */
async function round(page: Page) {
  for (const demo of DEMOS) await openDemo(page, demo);
  for (const name of PARKING_PAGES) await openParking(page, name);
  for (const name of MUSEUM_PAGES) await openMuseum(page, name);
  await page.goto('./#/');
  await page.waitForFunction(() => window.__vivi?.demo === 'home');
  const stats = await page.evaluate(() => window.__viviStats!);
  expect(stats.activeWorkers).toBe(0);
  expect(stats.liveMaps).toBe(0);
  expect(stats.lastUnreleased).toBe(0);
}

test('switching through every page repeatedly does not leak', async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto('./');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  for (let i = 0; i < WARMUP_ROUNDS; i++) await round(page);
  const before = await usedHeap(cdp);
  for (let i = 0; i < ROUNDS; i++) await round(page);
  const after = await usedHeap(cdp);

  const growth = after - before;
  test.info().annotations.push({ type: 'heap-growth', description: `${(growth / 1024).toFixed(0)} KiB` });
  expect(growth).toBeLessThan(MAX_GROWTH_BYTES);
});
