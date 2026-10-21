import { expect, type Page, test } from '@playwright/test';
import { DEMOS, openDemo, openHome } from './helpers';

/** 页面上需要能读清的文字控件 */
const SELECTORS = [
  '.floors button',
  '.lang-switch button',
  '.theme-toggle',
  '.bar h1',
  '.bar .metric',
  '.venue-name',
  '.perf',
  '.bar .back',
  '.panel',
  '.panel button',
  '.drawer',
  '.chip',
  '.alarm-feed li',
  '.nav-sidebar a',
  '.nav-sidebar .MuiListSubheader-root',
  '.nav-sidebar .nav-product',
];

/**
 * 计算每个可见元素文字与其实际背景的 WCAG 对比度。
 * 背景向上找第一个不透明的祖先；返回低于 minRatio 的元素。
 */
function lowContrast(page: Page, selectors: string[], minRatio: number) {
  return page.evaluate(
    ({ selectors, minRatio }) => {
      const parse = (c: string) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const [r, g, b, a = 1] = m[1]!.split(',').map((v) => Number.parseFloat(v));
        return { r: r!, g: g!, b: b!, a };
      };
      const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const ch = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
      };
      const background = (el: Element) => {
        for (let e: Element | null = el; e; e = e.parentElement) {
          const c = parse(getComputedStyle(e).backgroundColor);
          if (c && c.a > 0.5) return c;
        }
        return parse(getComputedStyle(document.body).backgroundColor)!;
      };
      const failures: string[] = [];
      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || !el.textContent?.trim()) continue;
          const fg = parse(getComputedStyle(el).color)!;
          const bg = background(el);
          const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a) as [number, number];
          const ratio = (hi + 0.05) / (lo + 0.05);
          if (ratio < minRatio) failures.push(`${selector} "${el.textContent.trim()}" ${ratio.toFixed(2)}`);
        }
      }
      return failures;
    },
    { selectors, minRatio },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`text on map pages is readable in the ${theme} theme`, async ({ page }) => {
    // 一个测试依次打开所有地图页，每页最多等 30 秒就绪
    test.setTimeout(DEMOS.length * 30_000);
    await page.addInitScript((t) => localStorage.setItem('indoorkit.theme', t), theme);
    for (const demo of DEMOS) {
      await openDemo(page, demo);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      // WCAG AA 普通文字要求 4.5:1
      expect(await lowContrast(page, SELECTORS, 4.5)).toEqual([]);
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`text on the home page is readable in the ${theme} theme`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('indoorkit.theme', t), theme);
    await openHome(page);
    await expect(page.getByRole('link', { name: 'GitHub' }).first()).toBeVisible();
    // 置灰的开发中场景不参与检查：它们是不可用的内容
    expect(
      await lowContrast(
        page,
        [
          '.home a',
          '.home h1',
          '.home h2',
          '.home > header p',
          '[data-active="true"]:not([data-disabled]) p',
        ],
        4.5,
      ),
    ).toEqual([]);
  });
}
