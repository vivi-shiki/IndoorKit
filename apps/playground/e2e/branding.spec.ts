import { expect, test } from '@playwright/test';
import { DEMOS, openDemo, openHome } from './helpers';

const REPO = 'https://github.com/vivi-shiki/IndoorKit';

test('the home page links to the IndoorKit repository and never says vivi-map', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('link', { name: 'GitHub' }).first()).toHaveAttribute('href', REPO);
  expect(await page.locator('body').innerText()).not.toMatch(/vivi-map/i);
});

for (const demo of DEMOS) {
  test(`${demo} shows the IndoorKit name and never says vivi-map`, async ({ page }) => {
    await openDemo(page, demo);
    await expect(page.getByTestId('nav-sidebar').getByTestId('home-link')).toHaveText('← IndoorKit');
    expect(await page.locator('body').innerText()).not.toMatch(/vivi-map/i);
  });
}

test('settings are stored under the indoorkit prefix', async ({ page }) => {
  await openHome(page);
  await page
    .getByRole('group', { name: /language|语言|言語/i })
    .getByRole('button', { name: '日本語' })
    .click();
  await page.locator('.theme-toggle').click();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toEqual(['indoorkit.locale', 'indoorkit.theme']);
});
