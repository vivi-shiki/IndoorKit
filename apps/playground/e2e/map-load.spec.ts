import { expect, test } from '@playwright/test';
import '../src/testing/hooks';

test('a map that cannot load says so and can be retried', async ({ page }) => {
  // 场馆数据请求失败时，地图区域给出说明和重试按钮，而不是一直空白
  await page.route('**/data/sakura-hospital/**', (route) => route.abort());
  await page.goto('./#/hospital/assets');
  const status = page.getByTestId('map-status');
  await expect(status).toContainText('The map could not be loaded. Please try again.');
  await expect(status).toHaveAttribute('role', 'alert');

  await page.unroute('**/data/sakura-hospital/**');
  await status.getByRole('button', { name: 'Try again' }).click();
  await page.waitForFunction(
    () => window.__vivi?.demo === 'assets' && window.__vivi.ready === true,
    undefined,
    {
      timeout: 30_000,
    },
  );
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(status).toBeHidden();
});
