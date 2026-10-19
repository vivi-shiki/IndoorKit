import { expect, type Page, test } from '@playwright/test';
import { openDemo, TITLES } from './helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });

test('the gallery offers Chinese, English and Japanese', async ({ page }) => {
  await page.goto('./');
  await expect(switcher(page).getByRole('button')).toHaveText(['中文', 'English', '日本語']);
});

test('switching on the gallery translates the page and is remembered after reload', async ({ page }) => {
  await page.goto('./');
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('link', { name: new RegExp(TITLES.tracking.ja) })).toBeVisible();
  await expect(switcher(page).getByRole('button', { name: '日本語' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => localStorage.getItem('vivi-map.locale'))).toBe('ja');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('link', { name: new RegExp(TITLES.tracking.ja) })).toBeVisible();
});

test('switching on a map page translates UI and map labels together', async ({ page }) => {
  await openDemo(page, 'tracking');
  await page.getByRole('button', { name: '2F' }).click();
  const heading = page.getByRole('heading', { level: 1 });

  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(heading).toHaveText(TITLES.tracking.zh);
  await expect(page.getByTestId('venue-name')).toHaveText('樱花综合医院');
  await expect.poll(() => page.evaluate(() => window.__vivi!.labelLanguage())).toBe('zh');
  await expect
    .poll(() => page.evaluate(() => window.__vivi!.renderedCount('indoor-labels')))
    .toBeGreaterThan(0);

  await switcher(page).getByRole('button', { name: 'English' }).click();
  await expect(heading).toHaveText(TITLES.tracking.en);
  await expect(page.getByTestId('venue-name')).toHaveText('Sakura General Hospital');
  await expect.poll(() => page.evaluate(() => window.__vivi!.labelLanguage())).toBe('en');

  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(heading).toHaveText(TITLES.tracking.ja);
  await expect(page.getByTestId('venue-name')).toHaveText('さくら総合病院');
  await expect.poll(() => page.evaluate(() => window.__vivi!.labelLanguage())).toBe('ja');

  // 切换语言不重建地图：楼层保持不变
  await expect.poll(() => page.evaluate(() => window.__vivi!.floor())).toBe('2F');
});

test('a map page opens in the saved language', async ({ page }) => {
  // 模拟上次会话保存的语言：页面脚本运行前写入 localStorage
  await page.addInitScript(() => localStorage.setItem('vivi-map.locale', 'zh'));
  await openDemo(page, 'occupancy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES.occupancy.zh);
  await expect(page.getByTestId('venue-name')).toHaveText('樱花综合医院');
  expect(await page.evaluate(() => window.__vivi!.labelLanguage())).toBe('zh');
});
