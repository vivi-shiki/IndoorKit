import { type CDPSession, expect, type Page, test } from '@playwright/test';
import '../../apps/playground/src/test-hooks';

const WARMUP = 5;
const CYCLES = 50;
/** 50 轮创建/销毁后允许的 JS 堆增长上限 */
const MAX_GROWTH_BYTES = 8 * 1024 * 1024;

async function usedHeap(cdp: CDPSession) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
}

async function run(page: Page, n: number) {
  await page.evaluate((count) => window.__vivi!.runCycles(count), n);
}

test('creating and destroying the map 50 times does not leak', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('./#/memory');
  await page.waitForFunction(() => window.__vivi?.ready === true, undefined, { timeout: 30_000 });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');

  await run(page, WARMUP);
  const before = await usedHeap(cdp);

  await run(page, CYCLES);
  const after = await usedHeap(cdp);

  const hooks = await page.evaluate(() => ({
    cycles: window.__vivi!.cycles,
    unreleased: window.__vivi!.unreleased,
  }));
  expect(hooks.cycles).toBe(WARMUP + CYCLES);
  expect(hooks.unreleased).toBe(0);
  await expect(page.getByTestId('unreleased')).toHaveText('0');

  const growth = after - before;
  test.info().annotations.push({ type: 'heap-growth', description: `${(growth / 1024).toFixed(0)} KiB` });
  expect(growth).toBeLessThan(MAX_GROWTH_BYTES);
});
