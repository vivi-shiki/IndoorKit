import { expect, test } from '@playwright/test';
import { DEMOS, openDemo, openHome, PRODUCT, TITLES } from './helpers';

test('the home page shows the SDK name instead of the project codename', async ({ page }) => {
  await openHome(page);
  await expect(page).toHaveTitle('IndoorKit');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IndoorKit');
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
  await openHome(page, './#/');
  await expect(page).toHaveTitle('IndoorKit');
});

test('no title mentions the playground or the codename', async ({ page }) => {
  await openHome(page);
  for (const demo of DEMOS) {
    await openDemo(page, demo);
    expect(await page.title()).not.toMatch(/playground|vivi/i);
  }
});
