import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

/**
 * 实时数据页每个周期都会更新 GeoJSON。如果上一次更新的瓦片还没切完就再次更新，
 * 同一瓦片的两次解析会交错，queryRenderedFeatures 读到不配套的数据，
 * 抛出 "feature index out of bounds"。换楼层改图层过滤条件，也会让瓦片重新解析。
 * 这里在数据流动、楼层来回切换时每帧查询一次，持续一段时间。
 */
const PAGES = [
  { demo: 'assets', layers: ['indoor-unit-clusters', 'indoor-unit-points'] },
  { demo: 'tracking', layers: ['indoor-positions'] },
] as const;

for (const { demo, layers } of PAGES) {
  test(`${demo}: querying rendered features while data streams never throws`, async ({ page }) => {
    test.setTimeout(60_000);
    await openDemo(page, demo);
    const floors = ['1F', '2F', '3F', '4F', '5F'];
    let switching = true;
    const switcher = (async () => {
      for (let i = 0; switching; i++) {
        await page.getByRole('button', { name: floors[i % floors.length], exact: true }).click();
        await page.waitForTimeout(100);
      }
    })();
    const result = await page.evaluate(
      (ids) =>
        new Promise<{ queries: number; errors: string[] }>((resolve) => {
          const errors: string[] = [];
          let queries = 0;
          const end = performance.now() + 15_000;
          const tick = () => {
            for (const id of ids) {
              queries++;
              try {
                window.__vivi!.renderedCount(id);
              } catch (e) {
                errors.push(String(e));
              }
            }
            if (performance.now() < end) requestAnimationFrame(tick);
            else resolve({ queries, errors });
          };
          requestAnimationFrame(tick);
        }),
      [...layers],
    );
    switching = false;
    await switcher;
    expect(result.queries).toBeGreaterThan(100);
    expect(result.errors).toEqual([]);
  });
}
