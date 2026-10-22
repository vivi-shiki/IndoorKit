import { expect, type Page, test } from '@playwright/test';
import { openHome, TAGLINES } from './helpers';
import './museum-helpers';
import './parking-helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });
const scenarios = (page: Page) => page.getByRole('region', { name: /Use cases|应用场景|活用シーン/ });
const card = (page: Page, id: string) => page.locator(`[data-scenario="${id}"]`);
const active = (page: Page) => page.locator('[data-scenario][data-active="true"]');
const IDS = ['hospital', 'parking', 'museum'] as const;
const READY = {
  hospital: ['#/hospital/assets', () => window.__vivi?.demo === 'assets' && window.__vivi.ready === true],
  parking: [
    '#/parking/availability',
    () => window.__parking?.page === 'availability' && window.__parking.ready === true,
  ],
  museum: [
    '#/museum/environment',
    () => window.__museum?.page === 'environment' && window.__museum.ready === true,
  ],
} as const;

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

test('on a computer the three use cases sit side by side, all ready to open', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openHome(page);
  await expect(scenarios(page)).toBeVisible();
  await expect(page.locator('[data-scenario]')).toHaveCount(3);
  await expect(page.locator('[data-scenario] h3')).toHaveText(['Hospital', 'Parking', 'Museum']);
  const boxes = await Promise.all(IDS.map(async (id) => (await card(page, id).boundingBox())!));
  // 同一行、从左到右、宽度相同
  for (const box of boxes.slice(1)) {
    expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(2);
    expect(Math.abs(box.width - boxes[0]!.width)).toBeLessThan(2);
  }
  expect(boxes[0]!.x + boxes[0]!.width).toBeLessThanOrEqual(boxes[1]!.x);
  expect(boxes[1]!.x + boxes[1]!.width).toBeLessThanOrEqual(boxes[2]!.x);
  // 并排时没有走马灯：没有箭头和圆点，也没有虚化或隐藏的卡片
  await expect(page.getByTestId('carousel-dot')).toHaveCount(0);
  await expect(page.locator('[aria-roledescription]')).toHaveCount(0);
  await expect(page.getByTestId('coming-soon')).toHaveCount(0);
  for (const id of IDS) {
    await expect(card(page, id)).not.toHaveAttribute('data-disabled');
    await expect(card(page, id)).not.toHaveAttribute('aria-hidden');
    await expect(card(page, id).getByRole('link', { name: /Open demo/ })).toBeVisible();
  }
});

for (const id of IDS) {
  test(`opening the ${id} demo goes straight to its map`, async ({ page }) => {
    const [hash, ready] = READY[id];
    await openHome(page);
    await card(page, id)
      .getByRole('link', { name: /Open demo/ })
      .click();
    await page.waitForFunction(ready, undefined, { timeout: 30_000 });
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });
}

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
});

test('each card has only its title and a short introduction, no subheadings', async ({ page }) => {
  await openHome(page);
  for (const id of IDS) {
    await expect(card(page, id).getByTestId('scenario-description')).toBeVisible();
    await expect(card(page, id).getByTestId('scenario-view')).toHaveCount(0);
    await expect(card(page, id).locator('ul, strong, h4')).toHaveCount(0);
    await expect(card(page, id).getByRole('heading')).toHaveCount(1);
  }
});

test('the dark theme shows dark screenshots', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('indoorkit.theme', 'dark'));
  await openHome(page);
  for (const id of IDS) {
    await expect(card(page, id).locator('.scenario-visual img')).toHaveAttribute('src', /-dark[.-]/);
  }
  await page.getByRole('button', { name: /light theme|亮色|ライト/ }).click();
  for (const id of IDS) {
    await expect(card(page, id).locator('.scenario-visual img')).not.toHaveAttribute('src', /-dark[.-]/);
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  const carousel = (page: Page) => page.getByRole('region', { name: /Use cases|应用场景|活用シーン/ });
  const next = (page: Page) => carousel(page).getByRole('button', { name: /Next|下一个|次の活用シーン/ });
  const previous = (page: Page) =>
    carousel(page).getByRole('button', { name: /Previous|上一个|前の活用シーン/ });

  test('a carousel shows one use case at a time and fits the screen', async ({ page }) => {
    await openHome(page);
    await expect(carousel(page)).toHaveAttribute('aria-roledescription', 'carousel');
    await expect(page.locator('[data-scenario]')).toHaveCount(3);
    await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
    await expect(card(page, 'parking')).toHaveAttribute('aria-hidden', 'true');
    await expect(card(page, 'museum')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.carousel-track')].every((el) => el.getAnimations().length === 0),
    );
    const box = (await active(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    // 其他两张在走马灯可见区域右边，等着滑进来
    const viewport = (await page.locator('.carousel-viewport').boundingBox())!;
    for (const id of ['parking', 'museum']) {
      const other = (await card(page, id).boundingBox())!;
      expect(other.x, id).toBeGreaterThanOrEqual(viewport.x + viewport.width - 1);
    }
  });

  test('the arrows and dots switch scenarios', async ({ page }) => {
    await openHome(page);
    await next(page).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
    await next(page).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
    // 最后一张再往后回到第一张
    await next(page).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
    await previous(page).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'museum');

    const dots = page.getByTestId('carousel-dot');
    await expect(dots).toHaveCount(3);
    await dots.nth(1).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  });

  test('the carousel advances on its own until someone uses it', async ({ page }) => {
    await page.clock.install();
    await openHome(page);
    await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
    await page.clock.runFor(7_000);
    await expect(active(page)).toHaveAttribute('data-scenario', 'parking');

    // 手动切换后不再自动播放
    await page.getByTestId('carousel-dot').nth(2).click();
    await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
    await page.clock.runFor(20_000);
    await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  });

  test('the arrows name what they switch in every language', async ({ page }) => {
    await openHome(page);
    for (const [language, prev, nxt] of [
      ['中文', '上一个场景', '下一个场景'],
      ['English', 'Previous use case', 'Next use case'],
      ['日本語', '前の活用シーン', '次の活用シーン'],
    ]) {
      await switcher(page).getByRole('button', { name: language }).click();
      await expect(carousel(page).getByRole('button', { name: prev, exact: true })).toBeVisible();
      await expect(carousel(page).getByRole('button', { name: nxt, exact: true })).toBeVisible();
    }
  });

  test('screen readers hear the carousel and its slides in the chosen language', async ({ page }) => {
    await openHome(page);
    await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', 'slide');
    await switcher(page).getByRole('button', { name: '中文' }).click();
    await expect(carousel(page)).toHaveAttribute('aria-roledescription', '轮播');
    await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', '场景卡片');
    await switcher(page).getByRole('button', { name: '日本語' }).click();
    await expect(carousel(page)).toHaveAttribute('aria-roledescription', 'カルーセル');
    await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', 'スライド');
  });

  test('opening a demo from the carousel goes straight to its map', async ({ page }) => {
    await openHome(page);
    await page.getByTestId('carousel-dot').nth(2).click();
    await active(page)
      .getByRole('link', { name: /Open demo/ })
      .click();
    await page.waitForFunction(READY.museum[1], undefined, { timeout: 30_000 });
    expect(new URL(page.url()).hash).toBe(READY.museum[0]);
  });
});
