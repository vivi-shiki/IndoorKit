import { expect, test } from '@playwright/test';
import '../src/test-hooks';

test.beforeEach(async ({ page }) => {
  await page.goto('./#/basic');
  await page.waitForFunction(() => window.__vivi?.ready === true, undefined, { timeout: 30_000 });
});

test('gallery lists the two demos', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: /基础地图|Basic map/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /内存实验室|Memory lab/ })).toBeVisible();
});

test('renders the fictional hospital on a WebGL canvas', async ({ page }) => {
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  await expect(page.getByTestId('first-render')).toHaveText(/\d+ ms/);
  const units = await page.evaluate(() => window.__vivi!.renderedLevelIds('indoor-units'));
  const ground = await page.evaluate(() => window.__vivi!.levelIdOf('1F'));
  expect(units).toEqual([ground]);
});

test('switches floors from the floor control', async ({ page }) => {
  const buttons = page.getByRole('group', { name: /floor/i }).getByRole('button');
  await expect(buttons).toHaveText(['3F', '2F', '1F']);
  await page.getByRole('button', { name: '2F' }).click();
  await expect(page.getByRole('button', { name: '2F' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__vivi!.floor())).toBe('2F');
  const second = await page.evaluate(() => window.__vivi!.levelIdOf('2F'));
  await expect
    .poll(() => page.evaluate(() => window.__vivi!.renderedLevelIds('indoor-units')))
    .toEqual([second]);
});

test('adds a marker on the current floor', async ({ page }) => {
  await page.getByRole('button', { name: '3F' }).click();
  await page.getByRole('button', { name: /添加标记|Add marker/ }).click();
  await expect(page.getByTestId('marker-count')).toHaveText('1');
  await expect.poll(() => page.evaluate(() => window.__vivi!.renderedCount('indoor-markers'))).toBe(1);
  await page.getByRole('button', { name: '1F' }).click();
  await expect.poll(() => page.evaluate(() => window.__vivi!.renderedCount('indoor-markers'))).toBe(0);
});
