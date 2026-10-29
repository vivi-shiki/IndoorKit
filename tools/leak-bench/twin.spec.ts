import { expect, test } from '@playwright/test';

test('editable 3D campuses release their scenes across every render level, floors and focus', async ({
  page,
}) => {
  test.setTimeout(480000);
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
      for (const level of ['L4', 'L3', 'L2', 'L1', 'L0']) {
        if (!(await page.getByTestId('twin-quality-panel').isVisible()))
          await page.getByTestId('twin-quality-button').click();
        await page.getByTestId(`twin-level-${level}`).click();
        await expect(page.getByTestId('twin-status')).toHaveAttribute('data-level', level);
        await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true', {
          timeout: 60000,
        });
        if (level === 'L3') {
          const target = await page.evaluate(() => window.__twin!.buildingPoint());
          await page.mouse.click(target.x, target.y);
          await page.getByTestId('twin-enter-floor').click();
          await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'indoor');
          await page.getByTestId('twin-outdoor').click();
        }
      }
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
