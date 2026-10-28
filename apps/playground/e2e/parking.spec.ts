import { expect, type Page, test } from '@playwright/test';
import {
  openParking,
  PARKING_GROUP_TITLES,
  PARKING_GROUPS,
  PARKING_PAGES,
  PARKING_PRODUCT,
  PARKING_TITLES,
  pollParking,
  waitForParking,
} from './parking-helpers';

const sidebar = (page: Page) => page.getByTestId('nav-sidebar');
const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });
const TOTAL_SPACES = 331;

test.describe('parking menu', () => {
  test('enters on the availability map and lists the operator and driver pages', async ({ page }) => {
    await page.goto('./#/parking');
    await waitForParking(page, 'availability');
    expect(new URL(page.url()).hash).toBe('#/parking/availability');
    await expect(sidebar(page).getByTestId('nav-product')).toHaveText(PARKING_PRODUCT.en);
    await expect(sidebar(page).getByTestId('nav-group')).toHaveText([
      PARKING_GROUP_TITLES.operator.en,
      PARKING_GROUP_TITLES.driver.en,
    ]);
    await expect(sidebar(page).getByTestId('nav-link')).toHaveText(
      [...PARKING_GROUPS.operator, ...PARKING_GROUPS.driver].map((p) => PARKING_TITLES[p].en),
    );
    await expect(page).toHaveTitle(`${PARKING_TITLES.availability.en} | ${PARKING_PRODUCT.en}`);
  });

  test('every page opens from the menu with one map and its own title', async ({ page }) => {
    await openParking(page, 'availability');
    for (const name of [...PARKING_PAGES.slice(1), 'availability' as const]) {
      await sidebar(page).getByRole('link', { name: PARKING_TITLES[name].en }).click();
      await waitForParking(page, name);
      expect(new URL(page.url()).hash).toBe(`#/parking/${name}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(PARKING_TITLES[name].en);
      await expect(page.getByTestId('page-desc')).not.toBeEmpty();
      await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(1);
      await expect(sidebar(page).getByRole('link', { name: PARKING_TITLES[name].en })).toHaveAttribute(
        'aria-current',
        'page',
      );
    }
    expect(await page.evaluate(() => window.__viviStats!.liveMaps)).toBe(1);
  });

  test('the menu and the map labels follow the language switch', async ({ page }) => {
    await openParking(page, 'availability');
    for (const [locale, name] of [
      ['ja', '日本語'],
      ['zh', '中文'],
      ['en', 'English'],
    ] as const) {
      await switcher(page).getByRole('button', { name }).click();
      await expect(sidebar(page).getByTestId('nav-product')).toHaveText(PARKING_PRODUCT[locale]);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(PARKING_TITLES.availability[locale]);
      await pollParking(page, () => window.__parking!.labelLanguage()).toBe(locale);
    }
  });

  test('opens in the language of the link', async ({ page }) => {
    await page.goto('./?lang=ja#/parking/alerts');
    await waitForParking(page, 'alerts');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PARKING_TITLES.alerts.ja);
    await expect(page).toHaveTitle(`${PARKING_TITLES.alerts.ja} | ${PARKING_PRODUCT.ja}`);
  });

  test('going home releases every parking map', async ({ page }) => {
    for (const name of PARKING_PAGES) await openParking(page, name);
    await page.goto('./#/');
    await page.waitForFunction(() => window.__vivi?.demo === 'home');
    const stats = await page.evaluate(() => window.__viviStats!);
    expect(stats.liveMaps).toBe(0);
    expect(stats.lastUnreleased).toBe(0);
    expect(stats.activeWorkers).toBe(0);
  });
});

test.describe('space availability', () => {
  test('colors every space and counts the free ones', async ({ page }) => {
    await openParking(page, 'availability');
    const counts = await page.evaluate(() => window.__parking!.stateCounts());
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(TOTAL_SPACES);
    expect(counts.occupied).toBeGreaterThan(100);
    expect(counts.free).toBeGreaterThan(20);
    expect(counts.reserved).toBeGreaterThan(0);
    await expect(page.getByTestId('free-count')).toHaveText(String(counts.free));
    await expect(page.getByTestId('total-count')).toHaveText(String(TOTAL_SPACES));
  });

  test('the availability signs agree with the spaces on their floor', async ({ page }) => {
    await openParking(page, 'availability');
    const signs = await page.evaluate(() => window.__parking!.displays());
    expect(signs.map((s) => s.code).sort()).toEqual([
      'DISP-1F',
      'DISP-2F',
      'DISP-3F',
      'DISP-4F',
      'DISP-ENT',
      'DISP-P2',
    ]);
    for (const sign of signs.filter((s) => s.code !== 'DISP-ENT')) {
      const floor = sign.code.slice(5);
      const free = await page.evaluate((f) => window.__parking!.freeOn(f), floor);
      expect(sign.free, sign.code).toBe(free);
    }
  });

  test('switches to the surface lot and shows a space when it is clicked', async ({ page }) => {
    await openParking(page, 'availability');
    await expect(page.locator('.floors button')).toHaveText(['4F', '3F', '2F', 'P2', '1F']);
    await page.locator('.floors button', { hasText: 'P2' }).click();
    await pollParking(page, () => window.__parking!.floor()).toBe('P2');
    await page.evaluate(() => window.__parking!.showBay('P2-A05'));
    await page.waitForFunction(() => window.__parking!.idle());
    const point = await page.evaluate(() => window.__parking!.bayScreenPoint('P2-A05'));
    await page.mouse.click(point.x, point.y);
    const drawer = page.getByTestId('bay-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading')).toContainText('P2-A05');
    await expect(drawer).toContainText(/Space sensor|AI camera/);
  });

  test('filters spaces by type and highlights a zone from the list', async ({ page }) => {
    await openParking(page, 'availability');
    await page.getByTestId('type-chip').filter({ hasText: 'EV charging' }).click();
    await pollParking(page, () => window.__parking!.highlighted().length).toBe(6);
    await page.getByTestId('type-chip').filter({ hasText: 'EV charging' }).click();
    await page.getByTestId('zone-row').filter({ hasText: '1F' }).first().click();
    await pollParking(page, () => window.__parking!.highlighted().length).toBe(17);
  });

  test('turns the device layers on and off', async ({ page }) => {
    await openParking(page, 'availability');
    const before = await page.evaluate(() => window.__parking!.markerCount());
    await page.getByTestId('device-chip').filter({ hasText: 'CO sensor' }).click();
    await pollParking(page, () => window.__parking!.markerCount()).toBeGreaterThan(before);
    await page.getByTestId('device-chip').filter({ hasText: 'CO sensor' }).click();
    await pollParking(page, () => window.__parking!.markerCount()).toBe(before);
  });
});

test.describe('entries and exits', () => {
  test('lists recognition events and today’s counts', async ({ page }) => {
    await openParking(page, 'vehicles');
    await expect(page.getByTestId('event-item').first()).toBeVisible();
    expect(await page.getByTestId('event-item').count()).toBeLessThanOrEqual(50);
    expect(Number(await page.getByTestId('entries-today').textContent())).toBeGreaterThan(200);
    expect(Number(await page.getByTestId('in-lot').textContent())).toBeGreaterThan(100);
  });

  test('finds a vehicle by plate and shows its fee', async ({ page }) => {
    await openParking(page, 'vehicles');
    const plate = await page.evaluate(() => window.__parking!.parkedPlate());
    await page.getByTestId('plate-search').fill(plate);
    await page.getByTestId('plate-result').first().click();
    const card = page.getByTestId('vehicle-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('fee-total')).toHaveText(/¥[\d,]+/);
    await expect(card.getByTestId('fee-line').first()).toBeVisible();
    await pollParking(page, () => window.__parking!.highlighted().length).toBe(1);
  });

  test('masks plates by default and speeds up time', async ({ page }) => {
    await openParking(page, 'vehicles');
    await expect(page.getByTestId('event-item').first()).toContainText('*');
    await page.getByTestId('mask-toggle').click();
    await expect(page.getByTestId('event-item').first()).not.toContainText('*');
    await page.getByTestId('mask-toggle').click();
    const t0 = await page.evaluate(() => window.__parking!.time());
    await page.getByTestId('speed-chip').filter({ hasText: '60×' }).click();
    await pollParking(page, () => window.__parking!.speed()).toBe(60);
    await expect
      .poll(() => page.evaluate(() => window.__parking!.time()), { timeout: 20_000 })
      .toBeGreaterThan(t0 + 60_000);
  });
});

test.describe('alerts', () => {
  test('raises alerts of all three tiers', async ({ page }) => {
    await openParking(page, 'alerts');
    await pollParking(page, () => [...new Set(window.__parking!.alarms().map((a) => a.tier))].sort()).toEqual(
      ['contract', 'device', 'time'],
    );
    await page.getByTestId('tier-chip').filter({ hasText: 'Equipment and environment' }).click();
    const tiers = await page.getByTestId('alarm-item').evaluateAll((els) => els.map((e) => e.dataset.tier));
    expect(new Set(tiers)).toEqual(new Set(['device']));
    await expect(page.getByTestId('device-online')).toHaveText(/\d+ \/ \d+/);
  });

  test('acknowledges and resolves an alert, then shows where it happened', async ({ page }) => {
    await openParking(page, 'alerts');
    const item = page.getByTestId('alarm-item').first();
    const id = (await item.getAttribute('data-alarm'))!;
    await item.getByRole('button', { name: 'Mark as acknowledged' }).click();
    await pollParking(page, () => window.__parking!.alarms()[0]?.state).toBeTruthy();
    expect(await page.evaluate((i) => window.__parking!.alarmState(i), id)).toBe('acknowledged');
    await page.locator(`[data-alarm="${id}"]`).getByRole('button', { name: 'Mark as resolved' }).click();
    expect(await page.evaluate((i) => window.__parking!.alarmState(i), id)).toBe('resolved');
    await page.locator(`[data-alarm="${id}"]`).getByTestId('alarm-subject').click();
    await expect(page.getByTestId('alarm-detail')).toBeVisible();
    await expect(page.getByTestId('alarm-detail').locator('svg')).toBeVisible();
  });
});

test.describe('reserve and navigate', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('reserves a space and draws the route to it on a phone', async ({ page }) => {
    await openParking(page, 'reserve');
    await expect(page.getByTestId('nav-appbar')).toBeVisible();
    await page.getByTestId('panel-toggle').click();
    await page.getByTestId('reserve-submit').click();
    await expect(page.getByTestId('reservation-id')).toHaveText(/^R-\d{4}$/);
    await pollParking(page, () => window.__parking!.routeLevels()[0]).toBe('1F');
    expect(await page.evaluate(() => window.__parking!.routeMeters())).toBeGreaterThan(10);
    await expect(page.getByTestId('walk-meters')).toHaveText(/\d+ m/);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(390);
  });

  test('allocates fleet spaces in a row and books a zone for an event', async ({ page }) => {
    await openParking(page, 'reserve');
    await page.getByTestId('panel-toggle').click();
    await page.getByRole('tab', { name: 'Fleet' }).click();
    await page.getByTestId('fleet-count').fill('10');
    await page.getByTestId('fleet-allocate').click();
    await pollParking(page, () => window.__parking!.highlighted().length).toBe(10);
    await page.getByTestId('fleet-confirm').click();
    await expect(page.getByTestId('fleet-id')).toHaveText(/^F-\d{4}$/);
    await page.getByRole('tab', { name: 'Event' }).click();
    await page.getByTestId('event-submit').click();
    await expect(page.getByTestId('event-id')).toHaveText(/^E-\d{4}$/);
  });
});

test.describe('operations analytics', () => {
  test('shows the key figures, charts and suggestions', async ({ page }) => {
    await openParking(page, 'analytics');
    for (const id of [
      'kpi-utilization',
      'kpi-turnover',
      'kpi-stay',
      'kpi-revenue',
      'kpi-unpaid',
      'kpi-vacant',
    ]) {
      await expect(page.getByTestId(id)).not.toBeEmpty();
    }
    await expect(page.getByTestId('hourly-chart').locator('path')).toHaveCount(1);
    expect(await page.getByTestId('zone-bar').count()).toBeGreaterThan(5);
    expect(await page.getByTestId('suggestion').count()).toBeGreaterThanOrEqual(2);
  });

  test('colors spaces by utilization for the chosen period', async ({ page }) => {
    await openParking(page, 'analytics');
    const all = await page.evaluate(() => window.__parking!.stateCounts());
    await page.getByTestId('range-chip').filter({ hasText: '12:00–14:00' }).click();
    await pollParking(page, () => window.__parking!.stateCounts()).not.toEqual(all);
  });
});

test.describe('parking on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('every page fits the screen and opens from the top menu', async ({ page }) => {
    await openParking(page, 'availability');
    for (const name of PARKING_PAGES.slice(1)) {
      await page.getByTestId('nav-menu-button').click();
      await page.getByTestId('nav-top-menu').getByRole('link', { name: PARKING_TITLES[name].en }).click();
      await waitForParking(page, name);
      await expect(page.getByTestId('nav-top-menu')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
      // 列表收在按钮后面，点开后从底部升起
      await page.getByTestId('panel-toggle').click();
      const panel = (await page.locator('.panel').first().boundingBox())!;
      expect(panel.y + panel.height).toBeLessThanOrEqual(844);
      await page.getByTestId('panel-toggle').click();
    }
  });
});
