import { expect, test } from '@playwright/test';

for (const scenario of ['hospital', 'parking', 'museum']) {
  test(`${scenario} twin: model, floors, quality, themes, and languages`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(`?lang=en#/${scenario}/twin`);
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'outdoor');
    expect(await page.evaluate(() => window.__twin!.snapshot().fallback)).toBe(false);
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-desktop.png` });
    await page.getByTestId('twin-floor-2F').click();
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'indoor');
    await expect(page.getByTestId('twin-floor-2F')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-indoor.png` });
    await page.getByTestId('twin-outdoor').click();
    await page.getByTestId('twin-quality').selectOption('low');
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-quality', 'low');
    await page.evaluate(() => window.__twin!.setZoom(18.95));
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'indoor');
    await page.evaluate(() => window.__twin!.setZoom(18.7));
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'indoor');
    await page.evaluate(() => window.__twin!.setZoom(18.4));
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'outdoor');
    await page.getByTestId('twin-outdoor').click();
    // 模型下载在界面上隐藏
    await expect(page.getByTestId('twin-export')).toHaveCount(0);
    for (const lang of ['zh', 'ja', 'en']) {
      await page.getByTestId(`lang-${lang}`).click();
      await expect(page.getByTestId('twin-title')).not.toBeEmpty();
    }
    await page.getByTestId('theme-toggle').click();
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('twin-mobile-panel')).toBeVisible();
    await page.getByTestId('twin-quality').selectOption('auto');
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-quality', 'low');
    expect(await page.evaluate(() => window.__twin!.snapshot().shadows)).toBe(false);
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-mobile-scene.png` });
    await page.getByTestId('twin-mobile-panel').click();
    await expect(page.getByTestId('twin-inventory')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/twin-${scenario}-mobile.png` });
    expect(errors).toEqual([]);
  });
}

test('twin resources are released across scenario and quality changes', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./#/hospital/twin');
  for (const scenario of ['hospital', 'parking', 'museum', 'hospital', 'parking', 'museum']) {
    await page.evaluate((name) => {
      location.hash = `#/${name}/twin`;
    }, scenario);
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await page.getByTestId('twin-quality').selectOption('low');
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-quality', 'low');
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await page.waitForFunction(() => window.__viviStats?.liveMaps === 0);
    expect(await page.evaluate(() => window.__viviStats?.lastUnreleased)).toBe(0);
  }
});

test('a device without WebGL still opens the local plan and floors', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, ...args: unknown[]) {
        return String(args[0]).includes('webgl') ? null : Reflect.apply(original, this, args);
      },
    });
  });
  await page.goto('./#/museum/twin');
  await expect(page.getByTestId('twin-plan-fallback')).toBeVisible();
  await page.getByTestId('twin-floor-2F').click();
  await expect(page.getByTestId('twin-status')).toHaveAttribute('data-view', 'indoor');
  await expect(page.getByTestId('twin-plan-fallback').locator('path').first()).toBeVisible();
});
