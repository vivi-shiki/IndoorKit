import { expect, type Page, test } from '@playwright/test';
import {
  MUSEUM_GROUP_TITLES,
  MUSEUM_PAGES,
  MUSEUM_PRODUCT,
  MUSEUM_TITLES,
  openMuseum,
  pollMuseum,
  waitForMuseum,
} from './museum-helpers';

const sidebar = (page: Page) => page.getByTestId('nav-sidebar');
const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });

test.describe('museum menu', () => {
  test('enters on the environment map and lists the curator, operations and visitor pages', async ({
    page,
  }) => {
    await page.goto('./#/museum');
    await waitForMuseum(page, 'environment');
    expect(new URL(page.url()).hash).toBe('#/museum/environment');
    await expect(sidebar(page).getByTestId('nav-product')).toHaveText(MUSEUM_PRODUCT.en);
    await expect(sidebar(page).getByTestId('nav-group')).toHaveText([
      MUSEUM_GROUP_TITLES.curator.en,
      MUSEUM_GROUP_TITLES.operations.en,
      MUSEUM_GROUP_TITLES.visitor.en,
    ]);
    await expect(sidebar(page).getByTestId('nav-link')).toHaveText(
      MUSEUM_PAGES.map((p) => MUSEUM_TITLES[p].en),
    );
    await expect(page).toHaveTitle(`${MUSEUM_TITLES.environment.en} | ${MUSEUM_PRODUCT.en}`);
  });

  test('every page opens from the menu with one map and its own title', async ({ page }) => {
    await openMuseum(page, 'environment');
    for (const name of [...MUSEUM_PAGES.slice(1), 'environment' as const]) {
      await sidebar(page).getByRole('link', { name: MUSEUM_TITLES[name].en }).click();
      await waitForMuseum(page, name);
      expect(new URL(page.url()).hash).toBe(`#/museum/${name}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(MUSEUM_TITLES[name].en);
      await expect(page.getByTestId('page-desc')).not.toBeEmpty();
      await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
    }
    expect(await page.evaluate(() => window.__viviStats!.liveMaps)).toBe(1);
  });

  test('the menu and the map labels follow the language switch', async ({ page }) => {
    await openMuseum(page, 'environment');
    for (const [locale, name] of [
      ['ja', '日本語'],
      ['zh', '中文'],
      ['en', 'English'],
    ] as const) {
      await switcher(page).getByRole('button', { name }).click();
      await expect(sidebar(page).getByTestId('nav-product')).toHaveText(MUSEUM_PRODUCT[locale]);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(MUSEUM_TITLES.environment[locale]);
      await pollMuseum(page, () => window.__museum!.labelLanguage()).toBe(locale);
    }
  });

  test('going home releases every museum map', async ({ page }) => {
    for (const name of MUSEUM_PAGES) await openMuseum(page, name);
    await page.goto('./#/');
    await page.waitForFunction(() => window.__vivi?.demo === 'home');
    const stats = await page.evaluate(() => window.__viviStats!);
    expect(stats.liveMaps).toBe(0);
    expect(stats.lastUnreleased).toBe(0);
  });
});

test.describe('conservation environment', () => {
  test('shows the humidity rising in Gallery 4 and the 24-hour curve of a case', async ({ page }) => {
    await openMuseum(page, 'environment');
    expect(await page.evaluate(() => window.__museum!.stateOf('G4'))).toBe('above');
    await expect(page.getByTestId('out-of-range')).not.toHaveText('0');
    await expect(page.getByTestId('sensor-online')).toHaveText(/\d+ \/ \d+/);
    await page.evaluate(() => window.__museum!.showUnit('G4-F1'));
    await page.waitForFunction(() => window.__museum!.idle());
    const point = await page.evaluate(() => window.__museum!.unitScreenPoint('G4-F1'));
    await page.mouse.click(point.x, point.y);
    const drawer = page.getByTestId('env-drawer');
    await expect(drawer.getByRole('heading', { level: 2 })).toContainText('G4-F1');
    await expect(drawer.getByTestId('chart').locator('polyline')).toHaveCount(2);
    await expect(drawer.getByTestId('humidity-swing')).toHaveText(/\d+\.\d %/);
  });

  test('switches the measurement and finds the lighting fault in case G6-W2', async ({ page }) => {
    await openMuseum(page, 'environment');
    await page.getByTestId('metric-chip').filter({ hasText: 'Illuminance' }).click();
    await pollMuseum(page, () => window.__museum!.stateOf('G6-W2')).toBe('above');
    await page.getByTestId('room-row').filter({ hasText: 'Gallery 6' }).click();
    await pollMuseum(page, () => window.__museum!.floor()).toBe('3F');
    await expect(page.getByTestId('env-drawer')).toBeVisible();
  });
});

test.describe('collection and light exposure', () => {
  test('lists objects by exposure and opens an object card', async ({ page }) => {
    await openMuseum(page, 'collection');
    const counts = await page.evaluate(() => window.__museum!.stateCounts());
    expect((counts.warn ?? 0) + (counts.over ?? 0)).toBeGreaterThan(0);
    await page.getByTestId('object-row').first().click();
    const card = page.getByTestId('object-card');
    await expect(card.getByTestId('object-exposure')).toContainText('lx·h');
    await pollMuseum(page, () => window.__museum!.highlighted().length).toBe(1);
    await page.getByTestId('designated-chip').click();
    await page.getByTestId('object-row').first().click();
    await expect(card.getByTestId('display-days')).toHaveText(/\d+ of 60 days/);
  });

  test('checks today’s moves against the RFID reads and draws the route', async ({ page }) => {
    await openMuseum(page, 'collection');
    await page.getByTestId('tab-chip').filter({ hasText: 'Object moves' }).click();
    await expect(page.getByTestId('move-row')).toHaveCount(6);
    await expect(page.locator('[data-testid="move-row"][data-status="wrong-place"]')).toHaveCount(1);
    await page.locator('[data-testid="move-row"][data-status="wrong-place"]').click();
    await pollMuseum(page, () => window.__museum!.routeMeters()).toBeGreaterThan(5);
    await page.getByTestId('tab-chip').filter({ hasText: 'Rotation suggestions' }).click();
    await expect(page.getByTestId('swap-row').first()).toBeVisible();
  });
});

test.describe('visitors and crowding', () => {
  test('counts visitors and marks the school group in special exhibition gallery 1', async ({ page }) => {
    await openMuseum(page, 'visitors', 't=13:50');
    await pollMuseum(page, () => window.__museum!.stateOf('SP1')).toBe('full');
    expect(Number(await page.getByTestId('inside-count').textContent())).toBeGreaterThan(50);
    await expect(page.getByTestId('visitors-source')).toContainText('30%');
    await pollMuseum(page, () => window.__museum!.tagCount()).toBeGreaterThan(0);
    // 公开页面不显示地下收藏库
    await expect(page.locator('.floors button')).toHaveText(['3F', '2F', '1F']);
  });

  test('shows the heatmap and replays a visitor’s journey', async ({ page }) => {
    await openMuseum(page, 'visitors');
    await page.getByTestId('view-chip').filter({ hasText: 'Heatmap' }).click();
    await pollMuseum(page, () => window.__museum!.heatPointCount()).toBeGreaterThan(0);
    await page.getByTestId('view-chip').filter({ hasText: 'Dwell time' }).click();
    await expect(page.getByTestId('dwell-row').first()).toBeVisible();
    await page.getByTestId('visitor-row').first().click();
    await pollMuseum(page, () => window.__museum!.trail()?.stops ?? 0).toBeGreaterThan(0);
  });
});

test.describe('security and patrols', () => {
  test('raises alerts of all three tiers and handles one', async ({ page }) => {
    await openMuseum(page, 'security');
    await pollMuseum(page, () => [...new Set(window.__museum!.alarms().map((a) => a.tier))].sort()).toEqual([
      'access',
      'conservation',
      'device',
    ]);
    const item = page.getByTestId('alarm-item').first();
    const id = (await item.getAttribute('data-alarm'))!;
    await item.getByRole('button', { name: 'Mark as acknowledged' }).click();
    expect(await page.evaluate((i) => window.__museum!.alarmState(i), id)).toBe('acknowledged');
    await page.locator(`[data-alarm="${id}"]`).getByTestId('alarm-subject').click();
    await pollMuseum(page, () => window.__museum!.highlighted().length).toBe(1);
  });

  test('shows the missed checkpoint of the 11:15 patrol', async ({ page }) => {
    await openMuseum(page, 'security', 't=12:30');
    await page.getByTestId('tab-chip').filter({ hasText: 'Patrols' }).click();
    await page.getByTestId('guard-chip').filter({ hasText: 'SG-02' }).click();
    await expect(page.locator('[data-testid="checkpoint-row"][data-code="CP-G8"]')).toHaveAttribute(
      'data-status',
      'missed',
    );
    await pollMuseum(page, () => window.__museum!.routeLevels()).toContain('3F');
    expect(await page.evaluate(() => window.__museum!.markerCount())).toBe(3);
  });

  test('detects the intrusion after closing time', async ({ page }) => {
    await openMuseum(page, 'security');
    await page.getByTestId('after-hours').click();
    await page.getByTestId('speed-chip').filter({ hasText: '60×' }).click();
    await pollMuseum(page, () => window.__museum!.alarms().some((a) => a.rule === 'after-hours')).toBe(true);
  });
});

test.describe('visitor guide', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('walks a tour on a phone and shows the objects at each case', async ({ page }) => {
    await openMuseum(page, 'guide');
    await expect(page.getByTestId('nav-appbar')).toBeVisible();
    const first = await page.evaluate(() => window.__museum!.guide());
    expect(first.index).toBe(0);
    expect(first.objects.length).toBeGreaterThan(0);
    await expect(page.getByTestId('guide-object')).toHaveCount(first.objects.length);
    await page.getByTestId('guide-next').click();
    await pollMuseum(page, () => window.__museum!.guide().index).toBe(1);
    expect(await page.evaluate(() => window.__museum!.routeLevels())).toEqual(['1F', '2F', '3F']);
    await page
      .getByTestId('tour-chip')
      .filter({ hasText: /Japanese/ })
      .click();
    await pollMuseum(page, () => window.__museum!.floor()).toBe('3F');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test.describe('museum on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('every page fits the screen and opens from the top menu', async ({ page }) => {
    await openMuseum(page, 'environment');
    for (const name of MUSEUM_PAGES.slice(1)) {
      await page.getByTestId('nav-menu-button').click();
      await page.getByTestId('nav-top-menu').getByRole('link', { name: MUSEUM_TITLES[name].en }).click();
      await waitForMuseum(page, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      await page.getByTestId('panel-toggle').click();
      const panel = (await page.locator('.panel').first().boundingBox())!;
      expect(panel.y + panel.height).toBeLessThanOrEqual(844);
      await page.getByTestId('panel-toggle').click();
    }
  });
});
