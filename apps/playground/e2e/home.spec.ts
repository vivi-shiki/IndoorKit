import { expect, type Page, test } from '@playwright/test';
import { openHome, TAGLINES } from './helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });
const carousel = (page: Page) => page.getByRole('region', { name: /Use cases|应用场景|活用シーン/ });
const slide = (page: Page, id: string) => page.locator(`[data-scenario="${id}"]`);
const active = (page: Page) => page.locator('[data-scenario][data-active="true"]');

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

test('the arrows name what they switch in every language', async ({ page }) => {
  await openHome(page);
  for (const [language, previous, next] of [
    ['中文', '上一个场景', '下一个场景'],
    ['English', 'Previous use case', 'Next use case'],
    ['日本語', '前の活用シーン', '次の活用シーン'],
  ]) {
    await switcher(page).getByRole('button', { name: language }).click();
    await expect(carousel(page).getByRole('button', { name: previous, exact: true })).toBeVisible();
    await expect(carousel(page).getByRole('button', { name: next, exact: true })).toBeVisible();
  }
});

test('the carousel shows hospital, parking and museum, starting with the hospital', async ({ page }) => {
  await openHome(page);
  await expect(carousel(page)).toBeVisible();
  await expect(page.locator('[data-scenario]')).toHaveCount(3);
  await expect(page.locator('[data-scenario] h3')).toHaveText(['Hospital', 'Parking', 'Museum']);
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  // 只有当前这一页对辅助技术可见
  await expect(slide(page, 'parking')).toHaveAttribute('aria-hidden', 'true');
});

test('the arrows and dots switch scenarios', async ({ page }) => {
  await openHome(page);
  await carousel(page)
    .getByRole('button', { name: /Next|下一个|次の活用シーン/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
  await carousel(page)
    .getByRole('button', { name: /Next|下一个|次の活用シーン/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  // 最后一页再往后回到第一页
  await carousel(page)
    .getByRole('button', { name: /Next|下一个|次の活用シーン/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  await carousel(page)
    .getByRole('button', { name: /Previous|上一个|前の活用シーン/ })
    .click();
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

test('parking and museum are greyed out and marked as in development', async ({ page }) => {
  await openHome(page);
  for (const id of ['parking', 'museum']) {
    await page
      .getByTestId('carousel-dot')
      .nth(id === 'parking' ? 1 : 2)
      .click();
    const card = slide(page, id);
    await expect(card).toHaveAttribute('data-disabled', 'true');
    await expect(card.getByTestId('coming-soon')).toHaveText('In development');
    await expect(card.getByRole('button', { name: /Open demo/ })).toBeDisabled();
    expect(
      await card.evaluate((el) => getComputedStyle(el.querySelector('.scenario-visual')!).filter),
    ).toContain('grayscale');
  }
  await expect(slide(page, 'hospital').getByTestId('coming-soon')).toHaveCount(0);
});

test('opening the hospital demo goes straight to a map', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('carousel-dot').first().click();
  await slide(page, 'hospital')
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

test('the hospital slide uses the reviewed copy in every language', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('carousel-dot').first().click();
  const description = slide(page, 'hospital').getByTestId('scenario-description');
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
  await expect(slide(page, 'hospital').getByTestId('scenario-view').locator('strong')).toHaveText([
    '医療機器',
    '人の所在',
  ]);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('the carousel fits the screen', async ({ page }) => {
    await openHome(page);
    await expect(carousel(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const box = (await active(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375);
  });
});

test('screen readers hear the carousel and its slides in the chosen language', async ({ page }) => {
  await openHome(page);
  const region = page.locator('[aria-roledescription]').first();
  await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(slide(page, 'hospital')).toHaveAttribute('aria-roledescription', 'slide');
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(region).toHaveAttribute('aria-roledescription', '轮播');
  await expect(slide(page, 'hospital')).toHaveAttribute('aria-roledescription', '场景卡片');
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(region).toHaveAttribute('aria-roledescription', 'カルーセル');
  await expect(slide(page, 'hospital')).toHaveAttribute('aria-roledescription', 'スライド');
});
