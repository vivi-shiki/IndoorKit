import { expect, type Page, test } from '@playwright/test';
import { DEMOS, openDemo, pollHook } from './helpers';

interface Box {
  name: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 地图页上浮在地图上的组件，以及它们周围的标题栏和右下角按钮 */
const FLOATING = [
  '.nav-appbar',
  '.bar',
  '.panel',
  '.panel-toggle',
  '.perf',
  '.player',
  '.floors',
  '.venue-name',
  '.drawer',
  '.app-controls',
];

/** 当前可见的浮动组件在视口里的位置 */
function visibleBoxes(page: Page) {
  return page.evaluate((selectors) => {
    const boxes: Box[] = [];
    for (const selector of selectors) {
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) continue;
        boxes.push({
          name: selector,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        });
      }
    }
    return boxes;
  }, FLOATING);
}

const overlaps = (a: Box, b: Box) =>
  a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

/** 每个组件都在视口里，两两不重叠 */
async function expectNaturalLayout(page: Page) {
  const viewport = page.viewportSize()!;
  const boxes = await visibleBoxes(page);
  for (const box of boxes) {
    expect(box.left, `${box.name} left`).toBeGreaterThanOrEqual(0);
    expect(box.top, `${box.name} top`).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.name} right`).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom, `${box.name} bottom`).toBeLessThanOrEqual(viewport.height);
  }
  const clashes = boxes.flatMap((a, i) =>
    boxes
      .slice(i + 1)
      .filter((b) => overlaps(a, b))
      .map((b) => `${a.name} × ${b.name}`),
  );
  expect(clashes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
}

test.describe('phone layout', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  for (const demo of DEMOS) {
    test(`${demo}: overlays sit around the map instead of covering it`, async ({ page }) => {
      await openDemo(page, demo);
      await expectNaturalLayout(page);

      // 地图中间留给场馆本身：场馆中心落在地图上，而不是被面板盖住
      const center = await page.evaluate(() => window.__vivi!.venueScreenCenter());
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', center);
      expect(hit).toContain('maplibregl-canvas');
    });

    test(`${demo}: the list opens as a sheet and closes again`, async ({ page }) => {
      await openDemo(page, demo);
      const toggle = page.getByTestId('panel-toggle');
      const panel = page.locator('.panel');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveText('List');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toBeVisible();
      await expectNaturalLayout(page);
      // 展开后仍露出一半以上的地图
      const stage = (await page.locator('.stage').boundingBox())!;
      const sheet = (await panel.boundingBox())!;
      expect(sheet.height).toBeLessThanOrEqual(stage.height / 2);

      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(panel).toBeHidden();
    });
  }

  test('assets: a unit drawer opens as a sheet that stays on screen', async ({ page }) => {
    await openDemo(page, 'assets');
    await pollHook(page, () => window.__vivi!.clusterScreenPoint()).not.toBeNull();
    const point = await page.evaluate(() => window.__vivi!.clusterScreenPoint()!);
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: point.x, y: point.y } });
    await expect(page.getByTestId('unit-drawer')).toBeVisible();
    await expectNaturalLayout(page);
  });

  test('tracking: picking a search result shows the person card without the list', async ({ page }) => {
    await openDemo(page, 'tracking');
    await page.getByTestId('panel-toggle').click();
    const target = await page.evaluate(() => window.__vivi!.personOnAnotherFloor());
    await page.getByTestId('person-search').fill(target.name);
    await page.getByTestId('search-result').first().click();
    await expect(page.getByTestId('person-card')).toBeVisible();
    await expect(page.locator('.panel')).toBeHidden();
    await expectNaturalLayout(page);
  });
});

test.describe('desktop layout', () => {
  for (const demo of DEMOS) {
    test(`${demo}: the list stays open beside the map`, async ({ page }) => {
      await openDemo(page, demo);
      await expect(page.locator('.panel')).toBeVisible();
      await expect(page.getByTestId('panel-toggle')).toBeHidden();
      await expectNaturalLayout(page);
    });
  }
});
