import { expect, type Page, test } from '@playwright/test';

const status = (page: Page) => page.getByTestId('twin-status');
const snapshot = (page: Page) => page.evaluate(() => window.__twin!.snapshot());

async function open(page: Page, scenario: string, query = 'lang=en') {
  await page.goto(`?${query}#/${scenario}/twin`);
  await expect(status(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
}

async function chooseLevel(page: Page, level: string) {
  if (!(await page.getByTestId('twin-quality-panel').isVisible()))
    await page.getByTestId('twin-quality-button').click();
  await page.getByTestId(`twin-level-${level}`).click();
  await expect(page.getByTestId(`twin-level-${level}`)).toHaveAttribute('aria-pressed', 'true');
  await expect(status(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
}

for (const scenario of ['hospital', 'parking', 'museum']) {
  test(`${scenario} twin: model, floors, quality, themes, and languages`, async ({ page }) => {
    test.setTimeout(150000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page, scenario);
    await expect(status(page)).toHaveAttribute('data-view', 'outdoor');
    expect((await snapshot(page)).fallback).toBe(false);
    expect((await snapshot(page)).progress).toBe(1);

    // 画质弹层：档位、单项覆盖、性能
    await chooseLevel(page, 'L3');
    await expect(status(page)).toHaveAttribute('data-level', 'L3');
    let s = await snapshot(page);
    expect(s.settings).toMatchObject({
      floors: true,
      shadows: 2048,
      outline: true,
      environment: true,
      sky: true,
    });
    expect(s.renderer).toMatchObject({ toneMapping: 'ACESFilmic', environment: true });
    expect(await page.evaluate(() => window.__twin!.sky())).toBe(true);
    await expect(page.getByTestId('twin-perf')).toContainText(/\d/);
    await page.getByTestId('twin-setting-shadows').selectOption('off');
    await expect.poll(async () => (await snapshot(page)).settings.shadows).toBe(0);
    await expect(status(page)).toHaveAttribute('data-level', 'L3');
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-desktop.png` });

    // 建筑标签跟随语言
    const buildings = await page.evaluate(() => window.__twin!.buildings());
    expect(buildings.length).toBeGreaterThan(0);
    for (const b of buildings) await expect(page.getByTestId(`twin-label-${b.id}`)).toBeVisible();

    // 点击楼栋：聚焦、信息卡、进入楼层
    const target = await page.evaluate(() => window.__twin!.buildingPoint());
    await page.mouse.click(target.x, target.y);
    await expect(page.getByTestId('twin-building-card')).toBeVisible();
    await expect.poll(async () => (await snapshot(page)).focused).toBe(target.id);
    await page.getByTestId('twin-enter-floor').click();
    await expect(status(page)).toHaveAttribute('data-view', 'indoor');

    // 剖切进入楼层：上层隐藏、当前实体、下层半透明，镜头斜看且整层在画面内
    await page.getByTestId('twin-floor-2F').click();
    await expect(page.getByTestId('twin-floor-2F')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.__twin!.idle());
    s = await snapshot(page);
    const levels = await page.evaluate(() => window.__twin!.levels());
    const current = levels.find((l) => l.shortName === '2F')!;
    for (const l of levels) {
      expect(s.cut[l.id], l.shortName).toBe(
        l.ordinal > current.ordinal ? 'hidden' : l.ordinal === current.ordinal ? 'solid' : 'ghost',
      );
    }
    expect(await page.evaluate(() => window.__twin!.floorMeshes())).toBeGreaterThan(0);
    expect((await page.evaluate(() => window.__twin!.camera())).pitch).toBeGreaterThanOrEqual(40);
    expect(await page.evaluate((id) => window.__twin!.levelInView(id), current.id)).toBe(true);
    await page.screenshot({ path: `test-results/twin-${scenario}-indoor.png` });

    await page.getByTestId('twin-outdoor').click();
    await expect(status(page)).toHaveAttribute('data-view', 'outdoor');
    await page.getByTestId('twin-reset').click();
    await expect.poll(async () => (await snapshot(page)).focused).toBeNull();

    // 省电档：不下载模型，只画 2.5D 挤出
    await chooseLevel(page, 'L0');
    s = await snapshot(page);
    expect(s.settings.model).toBe('extrusion');
    expect(s.meshes).toBe(0);
    expect(await page.evaluate(() => window.__twin!.extrusions())).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__twin!.gl().antialias)).toBe(false);

    await page.evaluate(() => window.__twin!.setZoom(18.95));
    await expect(status(page)).toHaveAttribute('data-view', 'indoor');
    await page.evaluate(() => window.__twin!.setZoom(18.7));
    await expect(status(page)).toHaveAttribute('data-view', 'indoor');
    await page.evaluate(() => window.__twin!.setZoom(18.4));
    await expect(status(page)).toHaveAttribute('data-view', 'outdoor');
    await expect(page.getByTestId('twin-export')).toHaveCount(0);

    // 刷新后保留画质选择和单项覆盖
    await chooseLevel(page, 'L2');
    await page.getByTestId('twin-setting-outline').selectOption('on');
    await page.reload();
    await expect(status(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await expect(status(page)).toHaveAttribute('data-level', 'L2');
    expect((await snapshot(page)).settings.outline).toBe(true);
    expect(await page.evaluate(() => window.__twin!.gl().antialias)).toBe(true);

    for (const lang of ['zh', 'ja', 'en']) {
      await page.getByTestId(`lang-${lang}`).click();
      await expect(page.getByTestId('twin-title')).not.toBeEmpty();
      await expect(page.getByTestId(`twin-label-${buildings[0]!.id}`)).toHaveText(
        buildings[0]!.names[lang as 'zh' | 'ja' | 'en'],
      );
    }
    await page.getByTestId('theme-toggle').click();
    await expect(status(page)).toHaveAttribute('data-ready', 'true');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('twin-mobile-panel')).toBeVisible();
    await chooseLevel(page, 'auto');
    await expect(status(page)).toHaveAttribute('data-level', /L[01]/);
    expect((await snapshot(page)).settings.shadows).toBe(0);
    const panel = await page.getByTestId('twin-quality-panel').boundingBox();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);
    await page.getByTestId('twin-quality-button').click();
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-mobile-scene.png` });
    await page.getByTestId('twin-mobile-panel').click();
    await expect(page.getByTestId('twin-inventory')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/twin-${scenario}-mobile.png` });
    expect(errors).toEqual([]);
  });
}

for (const scenario of ['parking', 'museum']) {
  test(`${scenario} twin follows the simulation clock with daylight and status colours`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page, scenario);
    expect((await snapshot(page)).night).toBe(false);
    await page.getByTestId('twin-time').fill('21');
    await expect.poll(async () => (await snapshot(page)).hour).toBe(21);
    expect((await snapshot(page)).night).toBe(true);
    await page.evaluate(() => window.__twin!.idle());
    await page.screenshot({ path: `test-results/twin-${scenario}-night.png` });
    await page.getByTestId('twin-time').fill('14');
    await expect.poll(async () => (await snapshot(page)).night).toBe(false);
    expect((await snapshot(page)).painted).toBeGreaterThan(0);
  });
}

test('the parking twin counts its principal entrance', async ({ page }) => {
  await open(page, 'parking');
  const row = page.getByTestId('twin-inventory').getByText('Principal entrances').locator('..');
  await expect(row.locator('dd')).not.toHaveText('0');
});

test('twin resources are released across scenario and quality changes', async ({ page }) => {
  test.setTimeout(150000);
  await page.goto('./#/hospital/twin');
  for (const scenario of ['hospital', 'parking', 'museum', 'hospital', 'parking', 'museum']) {
    await page.evaluate((name) => {
      location.hash = `#/${name}/twin`;
    }, scenario);
    await expect(status(page)).toHaveAttribute('data-ready', 'true', { timeout: 60000 });
    await chooseLevel(page, 'L3');
    await page.getByTestId('twin-floor-2F').click();
    await expect(status(page)).toHaveAttribute('data-view', 'indoor');
    await chooseLevel(page, 'L0');
    await expect(status(page)).toHaveAttribute('data-level', 'L0');
    await page.evaluate(() => {
      location.hash = '#/';
    });
    await page.waitForFunction(() => window.__viviStats?.liveMaps === 0);
    expect(await page.evaluate(() => window.__viviStats?.lastUnreleased)).toBe(0);
  }
  await page.evaluate(() => localStorage.clear());
});

test('a device without WebGL still opens the local plan and floors', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, ...args: unknown[]) {
        return String(args[0]).includes('webgl') ? null : Reflect.apply(original, this, args);
      },
    });
  });
  await page.goto('./#/museum/twin');
  await expect(page.getByTestId('twin-plan-fallback')).toBeVisible();
  await page.getByTestId('twin-floor-2F').click();
  await expect(status(page)).toHaveAttribute('data-view', 'indoor');
  await expect(page.getByTestId('twin-plan-fallback').locator('path').first()).toBeVisible();
});
