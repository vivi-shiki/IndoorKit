import { expect, type Page, test } from '@playwright/test';
import { openHome, TAGLINES } from './helpers';
import './museum-helpers';
import './parking-helpers';

const switcher = (page: Page) => page.getByRole('group', { name: /language|语言|言語/i });
const carousel = (page: Page) => page.getByRole('region', { name: /Use cases|应用场景|活用シーン/ });
const card = (page: Page, id: string) => page.locator(`[data-scenario="${id}"]`);
const active = (page: Page) => page.locator('[data-scenario][data-active="true"]');
const next = (page: Page) => carousel(page).getByRole('button', { name: /Next|下一个|次の活用シーン/ });
const previous = (page: Page) =>
  carousel(page).getByRole('button', { name: /Previous|上一个|前の活用シーン/ });

/** 卡片切换有过渡动画，等它停稳再量位置 */
async function settled(page: Page) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll('[data-scenario]')].every((el) => el.getAnimations().length === 0),
  );
}

/** 两侧卡片露在中间卡片外面的地方：走马灯可见区域的左右边缘 */
async function sidePoint(page: Page, side: 'left' | 'right') {
  const viewport = page.locator('.carousel-viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = (await viewport.boundingBox())!;
  return {
    x: side === 'left' ? box.x + 20 : box.x + box.width - 20,
    y: box.y + Math.min(box.height / 2, 160),
  };
}

const centerX = async (page: Page, id: string) => {
  const box = (await card(page, id).boundingBox())!;
  return box.x + box.width / 2;
};

test('the home page introduces IndoorKit as an IoT and indoor map SDK', async ({ page }) => {
  await openHome(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('IndoorKit');
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.en);
  await expect(page).toHaveTitle('IndoorKit');
  await expect(page.getByTestId('home-intro')).toHaveText(
    'The SDK provides map rendering, IMDF venue data handling, and real-time position updates. Developers can build industry-specific logic and interfaces on top.',
  );
  // 页脚说明覆盖三个场景，不只提医院
  await expect(page.locator('footer')).toContainText(
    'All venues, people, equipment, and related data in this demo are fictional.',
  );
});

test('three cards show at once: the focused one in the middle, the other two blurred on either side', async ({
  page,
}) => {
  await openHome(page);
  await expect(carousel(page)).toBeVisible();
  await expect(page.locator('[data-scenario]')).toHaveCount(3);
  await expect(page.locator('[data-scenario] h3')).toHaveText(['Hospital', 'Parking', 'Museum']);
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  await expect(card(page, 'hospital')).toHaveAttribute('data-slot', 'center');
  await expect(card(page, 'parking')).toHaveAttribute('data-slot', 'right');
  await expect(card(page, 'museum')).toHaveAttribute('data-slot', 'left');
  await settled(page);

  const region = (await carousel(page).boundingBox())!;
  const middle = region.x + region.width / 2;
  const [left, center, right] = await Promise.all(
    ['museum', 'hospital', 'parking'].map(async (id) => (await card(page, id).boundingBox())!),
  );
  // 三张都看得见，从左到右排开，中间那张最大且居中
  for (const box of [left!, center!, right!]) expect(box.width).toBeGreaterThan(0);
  expect(left!.x).toBeLessThan(center!.x);
  expect(right!.x + right!.width).toBeGreaterThan(center!.x + center!.width);
  expect(Math.abs(center!.x + center!.width / 2 - middle)).toBeLessThan(2);
  expect(left!.width).toBeLessThan(center!.width);
  expect(right!.width).toBeLessThan(center!.width);

  // 两侧的卡片虚化，中间的清晰
  const look = (id: string) =>
    card(page, id).evaluate((el) => ({
      filter: getComputedStyle(el.querySelector('.scenario-body')!).filter,
      opacity: Number(getComputedStyle(el).opacity),
    }));
  expect((await look('hospital')).filter).toBe('none');
  expect((await look('hospital')).opacity).toBe(1);
  for (const id of ['parking', 'museum']) {
    expect((await look(id)).filter, id).toContain('blur');
    expect((await look(id)).opacity, id).toBeLessThan(1);
  }
});

test('hovering a side card scrolls it to the middle', async ({ page }) => {
  await openHome(page);
  await settled(page);
  const right = await sidePoint(page, 'right');
  await page.mouse.move(right.x, right.y, { steps: 4 });
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
  await expect(card(page, 'parking')).toHaveAttribute('data-slot', 'center');
  await expect(card(page, 'hospital')).toHaveAttribute('data-slot', 'left');
  await expect(card(page, 'museum')).toHaveAttribute('data-slot', 'right');
  await settled(page);
  const region = (await carousel(page).boundingBox())!;
  expect(Math.abs((await centerX(page, 'parking')) - (region.x + region.width / 2))).toBeLessThan(2);

  const left = await sidePoint(page, 'left');
  await page.mouse.move(left.x, left.y, { steps: 4 });
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
});

test('clicking a side card focuses it instead of opening its demo', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  // 点左侧卡片露出来的地方
  const left = await sidePoint(page, 'left');
  await page.mouse.click(left.x, left.y);
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  expect(['', '#/']).toContain(new URL(page.url()).hash);
});

test('the arrows and dots switch scenarios', async ({ page }) => {
  await openHome(page);
  await next(page).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
  await next(page).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  // 最后一张再往后回到第一张
  await next(page).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  await previous(page).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');

  const dots = page.getByTestId('carousel-dot');
  await expect(dots).toHaveCount(3);
  await dots.nth(1).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
});

test('the arrows name what they switch in every language', async ({ page }) => {
  await openHome(page);
  for (const [language, prev, nxt] of [
    ['中文', '上一个场景', '下一个场景'],
    ['English', 'Previous use case', 'Next use case'],
    ['日本語', '前の活用シーン', '次の活用シーン'],
  ]) {
    await switcher(page).getByRole('button', { name: language }).click();
    await expect(carousel(page).getByRole('button', { name: prev, exact: true })).toBeVisible();
    await expect(carousel(page).getByRole('button', { name: nxt, exact: true })).toBeVisible();
  }
});

test('the carousel advances on its own until someone uses it', async ({ page }) => {
  await page.clock.install();
  await openHome(page);
  await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  await page.clock.runFor(7_000);
  await expect(active(page)).toHaveAttribute('data-scenario', 'parking');

  // 手动切换后不再自动播放
  await page.getByTestId('carousel-dot').nth(2).click();
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
  await page.clock.runFor(20_000);
  await expect(active(page)).toHaveAttribute('data-scenario', 'museum');
});

test('every use case is ready to open', async ({ page }) => {
  await openHome(page);
  await expect(page.getByTestId('coming-soon')).toHaveCount(0);
  for (const id of ['hospital', 'parking', 'museum']) {
    await expect(card(page, id)).not.toHaveAttribute('data-disabled');
  }
});

test('the dark theme shows dark screenshots', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('indoorkit.theme', 'dark'));
  await openHome(page);
  for (const id of ['hospital', 'parking', 'museum']) {
    await expect(card(page, id).locator('.scenario-visual img')).toHaveAttribute('src', /-dark[.-]/);
  }
  await page.getByRole('button', { name: /light theme|亮色|ライト/ }).click();
  for (const id of ['hospital', 'parking', 'museum']) {
    await expect(card(page, id).locator('.scenario-visual img')).not.toHaveAttribute('src', /-dark[.-]/);
  }
});

for (const [id, hash, ready] of [
  [
    'museum',
    '#/museum/environment',
    "window.__museum?.page === 'environment' && window.__museum.ready === true",
  ],
  [
    'parking',
    '#/parking/availability',
    "window.__parking?.page === 'availability' && window.__parking.ready === true",
  ],
  ['hospital', '#/hospital/assets', "window.__vivi?.demo === 'assets' && window.__vivi.ready === true"],
] as const) {
  test(`opening the ${id} demo from the focused card goes straight to its map`, async ({ page }) => {
    await openHome(page);
    await page.getByTestId('carousel-dot').nth(['hospital', 'parking', 'museum'].indexOf(id)).click();
    await card(page, id)
      .getByRole('link', { name: /Open demo/ })
      .click();
    await page.waitForFunction(ready, undefined, { timeout: 30_000 });
    expect(new URL(page.url()).hash).toBe(hash);
    await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible();
  });
}

test('the hospital slide uses the reviewed copy in every language', async ({ page }) => {
  await openHome(page);
  const description = card(page, 'hospital').getByTestId('scenario-description');
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(description).toHaveText(
    '以虚构的“樱花综合医院”为例，查看院内设备的位置与运行状态，以及人员的实时位置和历史轨迹。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.zh);
  await switcher(page).getByRole('button', { name: 'English' }).click();
  await expect(description).toHaveText(
    'Explore equipment locations and operating status, along with real-time locations and movement history for people at the fictional Sakura General Hospital.',
  );
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(description).toHaveText(
    '架空の「さくら総合病院」を例に、医療機器の所在と稼働状況、職員や患者などの所在と移動履歴を確認できるデモです。',
  );
  await expect(page.getByTestId('home-tagline')).toHaveText(TAGLINES.ja);
  // 医院场景列出侧栏里的两个业务视图
  await expect(card(page, 'hospital').getByTestId('scenario-view').locator('strong')).toHaveText([
    '医療機器',
    '人の所在',
  ]);
});

test('screen readers hear the carousel and only the focused slide', async ({ page }) => {
  await openHome(page);
  const region = page.locator('[aria-roledescription]').first();
  await expect(region).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', 'slide');
  await expect(card(page, 'parking')).toHaveAttribute('aria-hidden', 'true');
  await expect(card(page, 'museum')).toHaveAttribute('aria-hidden', 'true');
  await switcher(page).getByRole('button', { name: '中文' }).click();
  await expect(region).toHaveAttribute('aria-roledescription', '轮播');
  await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', '场景卡片');
  await switcher(page).getByRole('button', { name: '日本語' }).click();
  await expect(region).toHaveAttribute('aria-roledescription', 'カルーセル');
  await expect(card(page, 'hospital')).toHaveAttribute('aria-roledescription', 'スライド');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('the focused card fits the screen and the side cards peek in, blurred', async ({ page }) => {
    await openHome(page);
    await settled(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const center = (await active(page).boundingBox())!;
    expect(center.x).toBeGreaterThanOrEqual(0);
    expect(center.x + center.width).toBeLessThanOrEqual(375);
    expect(Math.abs(center.x + center.width / 2 - 187.5)).toBeLessThan(2);
    // 两侧卡片各露出一条边
    const left = (await card(page, 'museum').boundingBox())!;
    const right = (await card(page, 'parking').boundingBox())!;
    expect(left.x + left.width).toBeGreaterThan(0);
    expect(left.x + left.width).toBeLessThanOrEqual(center.x + 8);
    expect(right.x).toBeLessThan(375);
    expect(right.x).toBeGreaterThanOrEqual(center.x + center.width - 8);
    expect(
      await card(page, 'parking').evaluate(
        (el) => getComputedStyle(el.querySelector('.scenario-body')!).filter,
      ),
    ).toContain('blur');
  });

  test('tapping a side card brings it to the middle', async ({ page }) => {
    await openHome(page);
    await settled(page);
    const right = await sidePoint(page, 'right');
    await page.touchscreen.tap(right.x + 10, right.y);
    await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
    expect(['', '#/']).toContain(new URL(page.url()).hash);
  });

  test('swiping moves to the next or previous card', async ({ page }) => {
    await openHome(page);
    await settled(page);
    const box = (await active(page).boundingBox())!;
    const swipe = (from: number, to: number) =>
      active(page).evaluate(
        (el, [x0, x1, y]) => {
          const opts = (x: number) => ({
            bubbles: true,
            pointerType: 'touch',
            clientX: x,
            clientY: y,
            isPrimary: true,
          });
          el.dispatchEvent(new PointerEvent('pointerdown', opts(x0!)));
          el.dispatchEvent(new PointerEvent('pointerup', opts(x1!)));
        },
        [from, to, box.y + 100],
      );
    await swipe(300, 80);
    await expect(active(page)).toHaveAttribute('data-scenario', 'parking');
    await swipe(80, 300);
    await expect(active(page)).toHaveAttribute('data-scenario', 'hospital');
  });
});
