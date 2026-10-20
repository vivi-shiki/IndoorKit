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
    .getByRole('button', { name: /Next|下一个|次へ/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
  await carousel(page)
    .getByRole('button', { name: /Next|下一个|次へ/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  // 最后一页再往后回到第一页
  await carousel(page)
    .getByRole('button', { name: /Next|下一个|次へ/ })
    .click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  await carousel(page)
    .getByRole('button', { name: /Previous|上一个|前へ/ })
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

test('the hospital slide keeps the reviewed copy in every language', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('carousel-dot').first().click();
  const description = slide(page, 'hospital').getByTestId('scenario-description');
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(description).toHaveText(
    '以虚构的“樱花综合医院”为例，展示院内设备的位置与运行状态，以及人员的位置与移动轨迹。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.zh);
  await switcher(page).getByRole('button', { name: 'English' }).click();
  await expect(description).toHaveText(
    'Explore equipment locations and operating status, along with people’s locations and movement history, in the fictional Sakura General Hospital.',
  );
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(description).toHaveText(
    '架空の「さくら総合病院」を舞台に、院内の機器の配置と稼働状況、人の位置と移動履歴を確認できるデモです。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.ja);
  // 医院场景列出侧栏里的两个业务视图
  await expect(slide(page, 'hospital').getByTestId('scenario-view').locator('strong')).toHaveText([
    '機器ビュー',
    '人の位置・移動',
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
