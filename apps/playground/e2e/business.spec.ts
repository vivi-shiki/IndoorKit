import { expect, test } from '@playwright/test';
import { DEMOS, openDemo, pollHook, TITLES } from './helpers';

test.describe('Real-time Tracking', () => {
  test('renders moving tags on the current floor only', async ({ page }) => {
    await openDemo(page, 'tracking');
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-positions')).toBeGreaterThan(0);
    const ground = await page.evaluate(() => window.__vivi!.levelIdOf('1F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-positions')).toEqual([ground]);

    await page.getByRole('button', { name: '3F' }).click();
    const third = await page.evaluate(() => window.__vivi!.levelIdOf('3F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-positions')).toEqual([third]);
  });

  test('changes the number of simulated tags', async ({ page }) => {
    await openDemo(page, 'tracking');
    await page.getByRole('radio', { name: '500' }).check();
    // 换数量会重新进入页面，等新页面就绪
    await page.waitForFunction(
      () => location.hash.includes('tags=500') && window.__vivi?.demo === 'tracking' && window.__vivi.ready,
      undefined,
      { timeout: 30_000 },
    );
    // 新页面挂载完成前，钩子仍属于旧页面或尚未就绪
    await pollHook(page, () => {
      try {
        return window.__vivi!.perf().tags;
      } catch {
        return -1;
      }
    }).toBe(500);
  });

  test('clicking a tag replays its trail', async ({ page }) => {
    await openDemo(page, 'tracking');
    // 先等标签至少上报两次，轨迹才有线段
    await pollHook(page, () => window.__vivi!.tagScreenPoint()?.samples ?? 0).toBeGreaterThan(1);
    const point = await page.evaluate(() => window.__vivi!.tagScreenPoint()!);
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: point.x, y: point.y } });
    await pollHook(page, () => window.__vivi!.replaying()).not.toBeNull();
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-trail')).toBeGreaterThan(0);
  });

  test('the performance overlay shows the numbers the hooks report', async ({ page }) => {
    await openDemo(page, 'tracking');
    await pollHook(page, () => window.__vivi!.perf().fps).toBeGreaterThan(0);
    // 同一时刻读取浮层文字和钩子，避免两次读取之间数值刷新
    const { shown, perf } = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="perf"]')!;
      const read = (key: string) => Number(el.querySelector(`[data-perf="${key}"]`)!.textContent);
      return {
        shown: { fps: read('fps'), frameMs: read('frame-ms'), tags: read('tags') },
        perf: window.__vivi!.perf(),
      };
    });
    expect(shown).toEqual({ fps: perf.fps, frameMs: perf.frameMs, tags: perf.tags });
  });
});

test.describe('Asset Overview', () => {
  test('shows assets as unit clusters on the current floor', async ({ page }) => {
    await openDemo(page, 'assets');
    await pollHook(page, () => window.__vivi!.clusterCount()).toBeGreaterThan(0);
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-unit-clusters')).toBeGreaterThan(0);
    const ground = await page.evaluate(() => window.__vivi!.levelIdOf('1F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-unit-clusters')).toEqual([ground]);

    await page.getByRole('button', { name: '4F', exact: true }).click();
    const fourth = await page.evaluate(() => window.__vivi!.levelIdOf('4F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-unit-clusters')).toEqual([fourth]);
  });

  test('has no algorithm comparison any more', async ({ page }) => {
    await openDemo(page, 'assets');
    await expect(page.getByRole('button', { name: /Run comparison|运行对比|比較を実行/ })).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);
    for (const id of ['naive-ms', 'indexed-ms', 'speedup']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.getByText(/Double loop|Spatial index|双重循环|空间索引/)).toHaveCount(0);
    expect(await page.evaluate(() => 'clusterRun' in window.__vivi!)).toBe(false);
  });
});
test.describe('Zone Alerts', () => {
  test('draws the preset fences and raises alerts with a popup', async ({ page }) => {
    await openDemo(page, 'alerts');
    expect(await page.evaluate(() => window.__vivi!.fenceIds())).toEqual(
      expect.arrayContaining(['icu-restricted', 'exit-antitheft', 'ward-dwell']),
    );
    // 页面打开在围栏所在楼层，围栏和告警弹窗才可见
    expect(await page.evaluate(() => window.__vivi!.floor())).toBe('3F');
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-polygons')).toBeGreaterThan(0);
    await pollHook(page, () => window.__vivi!.alertCount()).toBeGreaterThan(0);
    await expect(page.getByTestId('alert-list').locator('li').first()).toBeVisible();
    await expect(page.locator('[data-popup-id]').first()).toBeVisible();
  });
});

test.describe('Occupancy Heatmap', () => {
  test('collects points and follows the time window and floor', async ({ page }) => {
    await openDemo(page, 'occupancy');
    await pollHook(page, () => window.__vivi!.heatPointCount()).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__vivi!.styleLayerIds())).toContain('indoor-heat');

    await page.getByRole('radio', { name: /15/ }).check();
    await pollHook(page, () => window.__vivi!.heatWindow()).toBe(15);

    await page.getByRole('button', { name: '2F' }).click();
    const second = await page.evaluate(() => window.__vivi!.levelIdOf('2F'));
    await pollHook(page, () => window.__vivi!.heatLevelIds()).toEqual([second]);
  });
});

test.describe('theme', () => {
  test('switches UI and map to dark and keeps it after reload', async ({ page }) => {
    await openDemo(page, 'tracking');
    const light = await page.evaluate(() => window.__vivi!.mapBackground());
    await page.getByRole('button', { name: /Dark|暗色|ダーク/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await pollHook(page, () => window.__vivi!.mapBackground()).not.toBe(light);

    await page.reload();
    await page.waitForFunction(() => window.__vivi?.ready === true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await pollHook(page, () => window.__vivi!.mapBackground()).not.toBe(light);
  });
});

test('every page title follows the language switch', async ({ page }) => {
  // 依次打开全部五个页面
  test.setTimeout(90_000);
  for (const demo of DEMOS) {
    await openDemo(page, demo);
    const switcher = page.getByRole('group', { name: /language|语言|言語/i });
    const heading = page.getByRole('heading', { level: 1 });
    await switcher.getByRole('button', { name: '中文' }).click();
    await expect(heading).toHaveText(TITLES[demo].zh);
    await switcher.getByRole('button', { name: '日本語' }).click();
    await expect(heading).toHaveText(TITLES[demo].ja);
    await switcher.getByRole('button', { name: 'English' }).click();
    await expect(heading).toHaveText(TITLES[demo].en);
  }
});
