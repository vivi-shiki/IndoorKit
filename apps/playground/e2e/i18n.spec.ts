import { expect, type Page, test } from '@playwright/test';
import { openDemo, openHome, TAGLINES, TITLES } from './helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });

test('the home page offers Chinese, English and Japanese', async ({ page }) => {
  await openHome(page);
  await expect(switcher(page).getByRole('button')).toHaveText(['中文', 'English', '日本語']);
});

test('switching on the home page translates the page and is remembered after reload', async ({ page }) => {
  await openHome(page);
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.ja);
  await expect(switcher(page).getByRole('button', { name: '日本語' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await page.evaluate(() => localStorage.getItem('indoorkit.locale'))).toBe('ja');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.ja);
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
  await page.addInitScript(() => localStorage.setItem('indoorkit.locale', 'zh'));
  await openDemo(page, 'occupancy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES.occupancy.zh);
  await expect(page.getByTestId('venue-name')).toHaveText('樱花综合医院');
  expect(await page.evaluate(() => window.__vivi!.labelLanguage())).toBe('zh');
});

test('the home page names the hospital the same way as the map in each language', async ({ page }) => {
  await openHome(page);
  await page.getByTestId('carousel-dot').first().click();
  // 日文的说明写在医院场景的介绍里，其他语言另外写在底部说明里
  const home = page.locator('.home');
  const names = { 中文: '樱花综合医院', English: 'Sakura General Hospital', 日本語: 'さくら総合病院' };
  for (const [button, name] of Object.entries(names)) {
    await switcher(page).getByRole('button', { name: button }).click();
    await expect(home).toContainText(name);
  }
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(home).not.toContainText('さくら');
});

test('the alert popup on the map follows a language switch', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('indoorkit.locale', 'zh'));
  await openDemo(page, 'alerts');
  const popup = page.locator('[data-popup-id="alarm"]');
  await expect(popup).toContainText(/[一-鿿]/, { timeout: 20_000 });
  await switcher(page).getByRole('button', { name: 'English' }).click();
  // 新告警也会用英文重开弹窗，所以只给很短的时间：切换后应立即变成英文
  await expect(popup).not.toContainText(/[一-鿿]/, { timeout: 300 });
});
