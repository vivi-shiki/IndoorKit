import { expect, test } from '@playwright/test';
import { DEMOS, openDemo, pollHook, TITLES } from './helpers';

test('the gallery lists exactly the four business pages', async ({ page }) => {
  await page.goto('./');
  const links = page.locator('.cards a strong');
  await expect(links).toHaveText(DEMOS.map((d) => TITLES[d].en));
  for (const title of await links.allTextContents()) {
    // 业务展示风格：不带「3 ·」之类的编号
    expect(title).not.toMatch(/^\d|·/);
  }
});

test('the removed demo pages are gone', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Basic map|Memory lab|Clustering comparison/ })).toHaveCount(0);
  for (const old of ['basic', 'memory', 'realtime', 'cluster', 'geofence', 'heatmap']) {
    await page.goto(`./#/${old}`);
    // 旧地址回到画廊，不再有对应页面
    await page.waitForFunction(() => window.__vivi?.demo === 'gallery');
  }
});

for (const demo of DEMOS) {
  test(`${demo} shows its business title`, async ({ page }) => {
    await openDemo(page, demo);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES[demo].en);
  });
}

test.describe('shared map behaviour', () => {
  test('renders the hospital and switches floors', async ({ page }) => {
    await openDemo(page, 'tracking');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    const buttons = page.getByRole('group', { name: /floor/i }).getByRole('button');
    await expect(buttons).toHaveText(['5F', '4F', '3F', '2F', '1F']);
    const ground = await page.evaluate(() => window.__vivi!.levelIdOf('1F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-units')).toEqual([ground]);

    await page.getByRole('button', { name: '2F' }).click();
    await expect(page.getByRole('button', { name: '2F' })).toHaveAttribute('aria-pressed', 'true');
    const second = await page.evaluate(() => window.__vivi!.levelIdOf('2F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-units')).toEqual([second]);
  });

  test('every SDK layer uses the indoor- prefix', async ({ page }) => {
    await openDemo(page, 'tracking');
    const ids = await page.evaluate(() => window.__vivi!.styleLayerIds());
    // `background` belongs to the base style, not to the SDK or a plugin
    const sdkLayers = ids.filter((id) => id !== 'background');
    expect(sdkLayers.length).toBeGreaterThan(0);
    expect(sdkLayers.filter((id) => !id.startsWith('indoor-'))).toEqual([]);
  });

  test('switching floors registers no new resources', async ({ page }) => {
    await openDemo(page, 'tracking');
    const before = await page.evaluate(() => window.__vivi!.resourceLabels());
    expect(before).toContain('map');
    for (const floor of ['2F', '3F', '1F']) await page.getByRole('button', { name: floor }).click();
    expect(await page.evaluate(() => window.__vivi!.resourceLabels())).toEqual(before);
  });
});
