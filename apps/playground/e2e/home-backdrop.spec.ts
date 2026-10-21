import { expect, type Page, test } from '@playwright/test';
import { openHome } from './helpers';

const backdrop = (page: Page) => page.getByTestId('home-backdrop');
const lanes = (page: Page) => backdrop(page).locator('.backdrop-lane');

/** 每条通道当前的纵向位移（px），用来确认图标在动 */
const offsets = (page: Page) =>
  lanes(page).evaluateAll((els) => els.map((el) => new DOMMatrix(getComputedStyle(el).transform).m42));

test('the icons scroll diagonally behind the home page, alternating direction', async ({ page }) => {
  await openHome(page);
  await expect(backdrop(page)).toBeAttached();
  await expect(backdrop(page)).toHaveAttribute('aria-hidden', 'true');
  expect(await lanes(page).count()).toBeGreaterThan(6);
  expect(
    await lanes(page)
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('mask-size'))),
  ).toBeGreaterThanOrEqual(40);

  // 整片图标斜 45 度
  const angle = await backdrop(page)
    .locator('.backdrop-field')
    .evaluate((el) => {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      return Math.round((Math.atan2(m.b, m.a) * 180) / Math.PI);
    });
  expect(angle).toBe(45);

  // 每条通道都在无限循环，相邻两条方向相反
  const animations = await lanes(page).evaluateAll((els) =>
    els.map((el) => {
      const [a] = el.getAnimations();
      const timing = a?.effect?.getComputedTiming();
      return { state: a?.playState, iterations: timing?.iterations, direction: timing?.direction };
    }),
  );
  animations.forEach((a, i) => {
    expect(a.state, `lane ${i}`).toBe('running');
    expect(a.iterations, `lane ${i}`).toBe(Number.POSITIVE_INFINITY);
    expect(a.direction, `lane ${i}`).toBe(i % 2 === 0 ? 'normal' : 'reverse');
  });

  const before = await offsets(page);
  await expect
    .poll(async () => (await offsets(page)).filter((y, i) => y !== before[i]).length)
    .toBe(before.length);
});

test('one loop moves a lane by exactly one tile, so the restart is invisible', async ({ page }) => {
  await openHome(page);
  const result = await lanes(page)
    .first()
    .evaluate((el) => {
      const [a] = el.getAnimations();
      const style = getComputedStyle(el);
      const tile = Number.parseFloat(style.getPropertyValue('mask-size').split(' ')[1] ?? '');
      a!.pause();
      const duration = Number(a!.effect!.getComputedTiming().duration);
      a!.currentTime = duration - 0.001;
      return { tile, end: new DOMMatrix(getComputedStyle(el).transform).m42 };
    });
  expect(result.tile).toBeGreaterThan(0);
  expect(Math.abs(result.end + result.tile)).toBeLessThan(0.5);
});

test('the backdrop covers the whole window and lets clicks through', async ({ page }) => {
  await openHome(page);
  const viewport = page.viewportSize()!;
  const box = (await backdrop(page).boundingBox())!;
  expect(box).toEqual({ x: 0, y: 0, width: viewport.width, height: viewport.height });
  expect(await backdrop(page).evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  // 斜过来的正方形边长至少 (宽+高)/√2 才能盖住窗口四角；通道铺满整个正方形的宽度
  const field = await backdrop(page)
    .locator('.backdrop-field')
    .evaluate((el: HTMLElement) => {
      const lanes = [...el.querySelectorAll<HTMLElement>('.backdrop-lane')];
      const first = lanes[0]!;
      const last = lanes[lanes.length - 1]!;
      return {
        side: el.offsetWidth,
        height: el.offsetHeight,
        spanLeft: first.offsetLeft,
        spanRight: last.offsetLeft + last.offsetWidth,
        laneTop: Math.max(...lanes.map((l) => l.offsetTop)),
        laneBottom: Math.min(...lanes.map((l) => l.offsetTop + l.offsetHeight)),
      };
    });
  expect(field.side).toBe(field.height);
  expect(field.side).toBeGreaterThanOrEqual((viewport.width + viewport.height) / Math.SQRT2);
  expect(field.spanLeft).toBeLessThanOrEqual(0);
  expect(field.spanRight).toBeGreaterThanOrEqual(field.side);
  expect(field.laneTop).toBeLessThanOrEqual(0);
  expect(field.laneBottom).toBeGreaterThanOrEqual(field.side);
});

test('scenario cards are frosted glass over the icons', async ({ page }) => {
  await openHome(page);
  const card = page.locator('[data-scenario]').first();
  const style = await card.evaluate((el) => {
    const s = getComputedStyle(el);
    return { filter: s.backdropFilter, background: s.backgroundColor };
  });
  expect(style.filter).toContain('blur');
  const alpha = Number(style.background.match(/[\d.]+(?=\))/)?.[0]);
  expect(alpha).toBeGreaterThan(0.3);
  expect(alpha).toBeLessThan(1);
});

test('icons are black in the light theme and faint white in the dark theme', async ({ page }) => {
  await openHome(page);
  const ink = () =>
    lanes(page)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  const [r, g, b, a] = parse(await ink());
  expect([r, g, b]).toEqual([0, 0, 0]);
  expect(a).toBeLessThan(0.2);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const [dr, dg, db, da] = parse(await ink());
  expect(Math.min(dr!, dg!, db!)).toBeGreaterThan(200);
  expect(da).toBeLessThan(0.2);
});

test('with reduced motion the icons stand still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await expect(backdrop(page)).toBeAttached();
  const running = await lanes(page).evaluateAll((els) => els.flatMap((el) => el.getAnimations()).length);
  expect(running).toBe(0);
});

test('the backdrop belongs to the home page only', async ({ page }) => {
  await openHome(page);
  await expect(backdrop(page)).toBeAttached();
  await page.goto('#/hospital/assets');
  await page.waitForFunction(
    () => window.__vivi?.demo === 'assets' && window.__vivi.ready === true,
    undefined,
    {
      timeout: 30_000,
    },
  );
  await expect(backdrop(page)).toHaveCount(0);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('the backdrop scrolls with smaller icons and never widens the page', async ({ page }) => {
    await openHome(page);
    await expect(backdrop(page)).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const iconSize = (await lanes(page)
      .first()
      .evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue('mask-size')))) as number;
    expect(iconSize).toBeLessThan(40);
    const [a] = await lanes(page)
      .first()
      .evaluate((el) => el.getAnimations().map((x) => x.playState));
    expect(a).toBe('running');
  });
});
