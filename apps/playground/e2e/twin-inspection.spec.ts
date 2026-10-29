import { expect, test } from '@playwright/test';

const modes = {
  hospital: ['assets', 'people', 'alarms'],
  parking: ['bays', 'devices', 'vehicles', 'alarms'],
  museum: ['environment', 'visitors', 'security', 'collection', 'alarms'],
};

test('all three indoor selectors and details remain usable without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const [scene, layers] of Object.entries(modes)) {
    await page.goto(`?lang=zh#/${scene}/twin`);
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('twin-plan-fallback')).toBeVisible();
    await page.getByTestId('twin-floor-2F').click();
    const firstCount = await page.getByTestId('twin-result-count').textContent();
    expect(Number(firstCount)).toBeGreaterThan(0);
    await expect
      .poll(async () => page.getByTestId('twin-plan-fallback').locator('circle').count())
      .toBe(Number(firstCount));
    await page.getByTestId('twin-entity').first().click();
    await expect(page.getByTestId('twin-entity-detail')).toBeVisible();
    await page.getByTestId('twin-close-detail').click();
    await page.getByTestId('twin-layer').selectOption(layers[1]!);
    await expect(page.getByTestId('twin-status')).toHaveAttribute('data-mode', layers[1]!);
    await expect(page.getByTestId('twin-result-count')).not.toHaveText(firstCount!);
    await expect(page.getByTestId('twin-plan-fallback').locator('path').first()).toHaveClass(/twin-plan-/);
    await page.getByTestId('twin-outdoor').click();
    await expect(page.getByTestId('twin-layer')).toHaveCount(0);
  }
});

for (const [scenario, layers] of Object.entries(modes)) {
  for (const width of [1600, 390]) {
    test(`${scenario} indoor inspection at ${width}px preserves the campus and switches real data`, async ({
      page,
    }) => {
      test.setTimeout(150000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(`?lang=en#/${scenario}/twin`);
      const stage = page.getByTestId('twin-status');
      await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
      await page.getByTestId('twin-quality-button').click();
      await page.getByTestId('twin-level-L2').click();
      await expect(stage).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
      await page.getByTestId('twin-quality-button').click();
      await expect(page.getByTestId('twin-layer')).toHaveCount(0);
      const outside = await page.evaluate(() => window.__twin!.campus());
      expect(outside.siteVisible).toBe(true);
      expect(outside.buildingShells).toBeGreaterThan(0);
      await page.evaluate(() => window.__twin!.setZoom(18.95));
      await expect(stage).toHaveAttribute('data-view', 'indoor');
      await expect(page.getByTestId('twin-layer')).toBeVisible();
      await page.evaluate(() => window.__twin!.idle());
      const inside = await page.evaluate(() => window.__twin!.campus());
      expect(inside.siteVisible).toBe(true);
      expect(inside.buildingShells).toBe(0);
      expect(inside.landscapeMeshes).toBe(outside.landscapeMeshes);
      if (width === 390) await page.getByTestId('twin-mobile-panel').click();
      let previous = '';
      for (const layer of layers) {
        await page.getByTestId('twin-layer').selectOption(layer);
        await expect(stage).toHaveAttribute('data-mode', layer);
        await expect(page.getByTestId('twin-business-list')).toBeVisible();
        const data = await page.evaluate(() => window.__twin!.inspection());
        expect(data.mode).toBe(layer);
        expect(data.ids.join(',')).not.toBe(previous);
        previous = data.ids.join(',');
        await expect(page.getByTestId('twin-result-count')).toHaveText(String(data.ids.length));
        if (data.ids.length > 0) {
          if (width !== 390) {
            await expect
              .poll(async () => {
                const current = await page.evaluate(() => window.__twin!.inspection());
                return (
                  current.rendered.length > 0 && current.rendered.every((id) => current.ids.includes(id))
                );
              })
              .toBe(true);
          }
          await page.getByTestId('twin-entity').first().click();
          await expect(page.getByTestId('twin-entity-detail')).toBeVisible();
          await expect(page.getByTestId('twin-entity-detail')).toContainText(data.firstName!);
          await page.getByTestId('twin-close-detail').click();
        } else await expect(page.getByTestId('twin-empty')).toBeVisible();
      }
      await page.getByTestId('twin-layer').selectOption(layers[0]!);
      const groundIds = await page.evaluate(() => window.__twin!.inspection().ids);
      await page.getByTestId('twin-floor-2F').click();
      await expect.poll(async () => page.evaluate(() => window.__twin!.floor())).toBe('2F');
      const upstairs = await page.evaluate(() => window.__twin!.inspection());
      expect(upstairs.ids.length).toBeGreaterThan(0);
      expect(upstairs.ids.some((id) => groundIds.includes(id))).toBe(false);
      await page.getByTestId('twin-search').fill('no-such-object-98765');
      await expect(page.getByTestId('twin-empty')).toBeVisible();
      await expect.poll(async () => page.evaluate(() => window.__twin!.inspection().rendered.length)).toBe(0);
      await page.getByTestId('twin-search').fill('');
      await expect(page.getByTestId('twin-entity').first()).toBeVisible();
      for (const lang of ['zh', 'ja', 'en']) {
        await page.getByTestId(`lang-${lang}`).click();
        await expect(page.getByTestId('twin-layer')).not.toBeEmpty();
        await expect(page.getByTestId('twin-business-title')).not.toBeEmpty();
      }
      await page.getByTestId('theme-toggle').click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.evaluate(() => window.__twin!.idle());
      await page.screenshot({ path: `test-results/twin-${scenario}-inspection-${width}.png` });
      if (width === 390) await page.getByTestId('twin-mobile-panel').click();
      await expect
        .poll(async () => page.evaluate(() => window.__twin!.inspection().rendered.length))
        .toBeGreaterThan(0);
      const point = await page.evaluate(() => window.__twin!.inspection().point);
      expect(point).not.toBeNull();
      await page.mouse.click(point!.x, point!.y);
      await expect(page.getByTestId('twin-entity-detail')).toBeVisible();
      await expect
        .poll(async () => page.evaluate(() => window.__twin!.inspection().selected))
        .toBe(point!.id);
      await page.getByTestId('twin-close-detail').click();
      await page.getByTestId('twin-outdoor').click();
      await expect(stage).toHaveAttribute('data-view', 'outdoor');
      await expect(page.getByTestId('twin-layer')).toHaveCount(0);
      await expect.poll(async () => page.evaluate(() => window.__twin!.inspection().rendered.length)).toBe(0);
      await page.evaluate(() => window.__twin!.idle());
      const restored = await page.evaluate(() => window.__twin!.campus());
      expect(restored.siteVisible).toBe(true);
      expect(restored.buildingShells).toBe(outside.buildingShells);
      expect(errors).toEqual([]);
    });
  }
}
