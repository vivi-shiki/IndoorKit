import { expect, test } from '@playwright/test';
import { PRODUCT } from './helpers';

for (const lang of ['en', 'zh', 'ja'] as const) {
  test(`a link with ?lang=${lang} opens the demo in that language`, async ({ page }) => {
    // 先存一个不同的语言，确认链接里的语言优先
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('indoorkit.locale', 'en');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto(`./?lang=${lang}`);
    await page.waitForFunction(() => window.__vivi?.demo === 'gallery');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PRODUCT[lang]);
    await expect(
      page.getByRole('group', { name: /language|语言|言語/i }).getByRole('button', { pressed: true }),
    ).toHaveCount(1);
    // 参数用过即从地址栏去掉，之后刷新仍保持这个语言
    expect(new URL(page.url()).searchParams.has('lang')).toBe(false);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
  });
}
