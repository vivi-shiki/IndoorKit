import { expect, type Page, test } from '@playwright/test';
import { openHome, TAGLINES } from './helpers';
import './museum-helpers';
import './parking-helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });
const scenarios = (page: Page) => page.getByRole('region', { name: /Use cases|应用场景|活用シーン/ });
const card = (page: Page, id: string) => page.locator(`[data-scenario="${id}"]`);

test('the home page introduces IndoorKit as an IoT and indoor map SDK', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IndoorKit');
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.en);
  await expect(page).toHaveTitle('IndoorKit');
  await expect(page.getByTestId('home-intro')).toHaveText(
    'The SDK provides map rendering, IMDF venue data handling, and real-time position updates. Developers can build industry-specific logic and interfaces on top.',
  );
  // 页脚说明覆盖三个场景，不只提医院
  await expect(page.locator('footer')).toContainText(
    'All venues, people, equipment, and related data in this demo are fictional.',
  );
});

test('the three use cases sit side by side, all ready to open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  await expect(scenarios(page)).toBeVisible();
  await expect(page.locator('[data-scenario]')).toHaveCount(3);
  await expect(page.locator('[data-scenario] h3')).toHaveText(['Hospital', 'Parking', 'Museum']);
  const boxes = await Promise.all(
    ['hospital', 'parking', 'museum'].map(async (id) => (await card(page, id).boundingBox())!),
  );
  // 同一行、从左到右、宽度相同
  for (const box of boxes.slice(1)) {
    expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(2);
    expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThan(2);
  }
  expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x);
  expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x);
  await expect(page.getByTestId('coming-soon')).toHaveCount(0);
  for (const id of ['hospital', 'parking', 'museum']) {
    await expect(card(page, id)).not.toHaveAttribute('data-disabled');
    await expect(card(page, id).getByRole('link', { name: /Open demo/ })).toBeVisible();
  }
});

test('opening the museum demo goes straight to the conservation environment map', async ({ page }) => {
  await openHome(page);
  await card(page, 'museum')
    .getByRole('link', { name: /Open demo/ })
    .click();
  await page.waitForFunction(
    () => window.__museum?.page === 'environment' && window.__museum.ready === true,
    undefined,
    { timeout: 30_000 },
  );
  expect(new URL(page.url()).hash).toBe('#/museum/environment');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
});

test('opening the parking demo goes straight to the availability map', async ({ page }) => {
  await openHome(page);
  await card(page, 'parking')
    .getByRole('link', { name: /Open demo/ })
    .click();
  await page.waitForFunction(
    () => window.__parking?.page === 'availability' && window.__parking.ready === true,
    undefined,
    { timeout: 30_000 },
  );
  expect(new URL(page.url()).hash).toBe('#/parking/availability');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
});

test('opening the hospital demo goes straight to a map', async ({ page }) => {
  await openHome(page);
  await card(page, 'hospital')
    .getByRole('link', { name: /Open demo/ })
    .click();
  await page.waitForFunction(
    () => window.__vivi?.demo === 'assets' && window.__vivi.ready === true,
    undefined,
    {
      timeout: 30_000,
    },
  );
  expect(new URL(page.url()).hash).toBe('#/hospital/assets');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
});

test('the hospital card uses the reviewed copy in every language', async ({ page }) => {
  await openHome(page);
  const description = card(page, 'hospital').getByTestId('scenario-description');
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(description).toHaveText(
    '以虚构的“樱花综合医院”为例，查看院内设备的位置与运行状态，以及人员的实时位置和历史轨迹。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.zh);
  await switcher(page).getByRole('button', { name: 'English' }).click();
  await expect(description).toHaveText(
    'Explore equipment locations and operating status, along with real-time locations and movement history for people at the fictional Sakura General Hospital.',
  );
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(description).toHaveText(
    '架空の「さくら総合病院」を例に、医療機器の所在と稼働状況、職員や患者などの所在と移動履歴を確認できるデモです。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.ja);
  // 医院场景列出侧栏里的两个业务视图
  await expect(card(page, 'hospital').getByTestId('scenario-view').locator('strong')).toHaveText([
    '医療機器',
    '人の所在',
  ]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('the use cases stack and fit the screen', async ({ page }) => {
    await openHome(page);
    await expect(scenarios(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const [a, b] = [
      (await card(page, 'hospital').boundingBox())!,
      (await card(page, 'parking').boundingBox())!,
    ];
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x + a.width).toBeLessThanOrEqual(375);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  });
});
