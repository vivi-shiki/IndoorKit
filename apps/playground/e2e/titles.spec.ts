import { expect, test } from '@playwright/test';
import { DEMOS, openDemo, PRODUCT, TITLES } from './helpers';

test('the home page shows the product name instead of the project codename', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__vivi?.demo === 'gallery');
  await expect(page).toHaveTitle(PRODUCT.en);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(PRODUCT.en);
});

for (const demo of DEMOS) {
  test(`${demo} has a business browser tab title`, async ({ page }) => {
    await openDemo(page, demo);
    await expect(page).toHaveTitle(`${TITLES[demo].en} | ${PRODUCT.en}`);
  });
}

test('browser tab titles follow the language switch', async ({ page }) => {
  await openDemo(page, 'alerts');
  const switcher = page.getByRole('group', { name: /language|语言|言語/i });
  await switcher.getByRole('button', { name: '中文' }).click();
  await expect(page).toHaveTitle(`${TITLES.alerts.zh} | ${PRODUCT.zh}`);
  await switcher.getByRole('button', { name: '日本語' }).click();
  await expect(page).toHaveTitle(`${TITLES.alerts.ja} | ${PRODUCT.ja}`);
  await page.goto('./#/');
  await page.waitForFunction(() => window.__vivi?.demo === 'gallery');
  await expect(page).toHaveTitle(PRODUCT.ja);
});

test('no title mentions playground or demo', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.__vivi?.demo === 'gallery');
  for (const demo of DEMOS) {
    await openDemo(page, demo);
    expect(await page.title()).not.toMatch(/playground|demo|vivi-map/i);
  }
});
