import { expect, type Page, test } from '@playwright/test';
import { DEMOS, GROUP_TITLES, GROUPS, openDemo, openHome, PRODUCT, TITLES } from './helpers';

const sidebar = (page: Page) => page.getByTestId('nav-sidebar');
const waitFor = (page: Page, demo: string) =>
  page.waitForFunction((d) => window.__vivi?.demo === d && window.__vivi.ready === true, demo, {
    timeout: 30_000,
  });

test.describe('desktop sidebar', () => {
  test('lists the two business views and their pages', async ({ page }) => {
    await openDemo(page, 'assets');
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByTestId('nav-appbar')).toBeHidden();
    await expect(sidebar(page).getByTestId('nav-product')).toHaveText(PRODUCT.en);
    await expect(sidebar(page).getByTestId('nav-group')).toHaveText([
      GROUP_TITLES.efficiency.en,
      GROUP_TITLES.people.en,
    ]);
    await expect(sidebar(page).getByTestId('nav-link')).toHaveText(
      [...GROUPS.efficiency, ...GROUPS.people].map((d) => TITLES[d].en),
    );
    await expect(sidebar(page).getByRole('link', { name: TITLES.assets.en })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('clicking a page renders its content next to the menu', async ({ page }) => {
    await openDemo(page, 'assets');
    for (const demo of ['tracking', 'alerts', 'assets'] as const) {
      await sidebar(page).getByRole('link', { name: TITLES[demo].en }).click();
      await waitFor(page, demo);
      expect(new URL(page.url()).hash).toBe(`#/hospital/${demo}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES[demo].en);
      await expect(sidebar(page).getByRole('link', { name: TITLES[demo].en })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
      // 切换页面后只剩一张地图：上一页的地图已经释放
      await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
    }
    const stats = await page.evaluate(() => window.__viviStats!);
    expect(stats.liveMaps).toBe(1);
  });

  test('the menu sits beside the map instead of covering it', async ({ page }) => {
    for (const demo of DEMOS) {
      await openDemo(page, demo);
      const menu = (await sidebar(page).boundingBox())!;
      const stage = (await page.locator('.stage').boundingBox())!;
      expect(stage.x).toBeGreaterThanOrEqual(menu.x + menu.width - 1);
    }
  });

  test('the menu follows the language switch', async ({ page }) => {
    await openDemo(page, 'assets');
    await page
      .getByRole('group', { name: /language|语言|言語/i })
      .getByRole('button', { name: '日本語' })
      .click();
    await expect(sidebar(page).getByTestId('nav-group')).toHaveText([
      GROUP_TITLES.efficiency.ja,
      GROUP_TITLES.people.ja,
    ]);
    await expect(sidebar(page).getByTestId('nav-product')).toHaveText(PRODUCT.ja);
  });

  test('the IndoorKit link goes back to the home page', async ({ page }) => {
    await openDemo(page, 'tracking');
    await sidebar(page).getByTestId('home-link').click();
    await page.waitForFunction(() => window.__vivi?.demo === 'home');
    const stats = await page.evaluate(() => window.__viviStats!);
    expect(stats).toMatchObject({ liveMaps: 0, activeWorkers: 0, lastUnreleased: 0 });
  });
});

test.describe('entering the hospital demo', () => {
  test('opens a map directly, without a page list in between', async ({ page }) => {
    await page.goto('./#/hospital');
    await waitFor(page, 'assets');
    expect(new URL(page.url()).hash).toBe('#/hospital/assets');
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });

  test('old page links still open the same page', async ({ page }) => {
    await page.goto('./#/tracking?tags=500');
    await waitFor(page, 'tracking');
    expect(new URL(page.url()).hash).toBe('#/hospital/tracking?tags=500');
    await expect.poll(() => page.evaluate(() => window.__vivi!.perf().tags), { timeout: 20_000 }).toBe(500);
  });

  test('the home page is still one step back', async ({ page }) => {
    await openHome(page);
    await page.goto('./#/hospital/trail');
    await waitFor(page, 'trail');
    await page.goBack();
    await page.waitForFunction(() => window.__vivi?.demo === 'home');
  });
});

test.describe('phone top menu', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('replaces the sidebar with a top bar and a menu button', async ({ page }) => {
    await openDemo(page, 'assets');
    await expect(sidebar(page)).toBeHidden();
    const bar = page.getByTestId('nav-appbar');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(PRODUCT.en);
    const box = (await bar.boundingBox())!;
    expect(box.y).toBe(0);
    expect(box.width).toBe(375);
  });

  test('opens the menu, switches page and closes again', async ({ page }) => {
    await openDemo(page, 'assets');
    const button = page.getByTestId('nav-menu-button');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByTestId('nav-top-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByTestId('nav-group')).toHaveText([
      GROUP_TITLES.efficiency.en,
      GROUP_TITLES.people.en,
    ]);
    await expect(menu.getByTestId('nav-link')).toHaveCount(DEMOS.length);

    await menu.getByRole('link', { name: TITLES.occupancy.en }).click();
    await waitFor(page, 'occupancy');
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES.occupancy.en);
  });

  test('the menu also leads back to the home page', async ({ page }) => {
    await openDemo(page, 'tracking');
    await page.getByTestId('nav-menu-button').click();
    await page.getByTestId('nav-top-menu').getByTestId('home-link').click();
    await page.waitForFunction(() => window.__vivi?.demo === 'home');
  });
});
