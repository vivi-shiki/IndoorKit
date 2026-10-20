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
  expect(await page.evaluate(() => localStorage.getItem('indoorkit.locale'))).toBe('ja');

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
  await page.addInitScript(() => localStorage.setItem('indoorkit.locale', 'zh'));
  await openDemo(page, 'occupancy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLES.occupancy.zh);
  await expect(page.getByTestId('venue-name')).toHaveText('樱花综合医院');
  expect(await page.evaluate(() => window.__vivi!.labelLanguage())).toBe('zh');
});

test('the gallery names the hospital the same way as the map in each language', async ({ page }) => {
  await page.goto('./');
  // 日文的说明写在副标题里，其他语言写在底部说明里
  const note = page.locator('.gallery');
  const names = { 中文: '樱花综合医院', English: 'Sakura General Hospital', 日本語: 'さくら総合病院' };
  for (const [button, name] of Object.entries(names)) {
    await switcher(page).getByRole('button', { name: button }).click();
    await expect(note).toContainText(name);
  }
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(note).not.toContainText('さくら');
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(page.locator('.gallery > p').first()).toHaveText(
    '架空の「さくら総合病院」を舞台に、院内の機器の配置と稼働状況、人の位置と移動履歴を確認できるデモです。',
  );
});

test('the gallery uses the reviewed Chinese and English copy', async ({ page }) => {
  await page.goto('./');
  const subtitle = page.locator('.gallery > p').first();
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(subtitle).toHaveText(
    '以虚构的“樱花综合医院”为例，展示院内设备的位置与运行状态，以及人员的位置与移动轨迹。',
  );
  await switcher(page).getByRole('button', { name: 'English' }).click();
  await expect(subtitle).toHaveText(
    'Explore equipment locations and operating status, along with people’s locations and movement history, in the fictional Sakura General Hospital.',
  );
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
