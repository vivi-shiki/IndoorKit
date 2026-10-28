import { expect, test } from '@playwright/test';

test('editable 3D campuses release their scenes after repeated high/low switches', async ({ page }) => {
  test.setTimeout(240000);
  await page.goto('./#/');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find((m) => m.name === 'JSHeapUsedSize')!.value;
  };
  const round = async () => {
    for (const scene of ['hospital', 'parking', 'museum']) {
      await page.evaluate((name) => {
        location.hash = `#/${name}/twin`;
      }, scene);
      await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
      await page.getByTestId('twin-quality').selectOption('high');
      await expect(page.getByTestId('twin-status')).toHaveAttribute('data-quality', 'high');
      await page.getByTestId('twin-quality').selectOption('low');
      await expect(page.getByTestId('twin-status')).toHaveAttribute('data-quality', 'low');
      await page.evaluate(() => {
        location.hash = '#/';
      });
      await page.waitForFunction(() => window.__viviStats?.liveMaps === 0);
      expect(await page.evaluate(() => window.__viviStats?.lastUnreleased)).toBe(0);
    }
  };
  await round();
  const before = await heap();
  for (let i = 0; i < 4; i++) await round();
  const growth = (await heap()) - before;
  test.info().annotations.push({ type: 'twin-heap-growth', description: `${Math.round(growth / 1024)} KiB` });
  expect(growth).toBeLessThan(8 * 1024 * 1024);
});
