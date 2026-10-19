import { expect, test } from '@playwright/test';
import { openDemo, pollHook } from './helpers';

test('gallery links to all six demos', async ({ page }) => {
  await page.goto('./');
  for (const name of [/Basic map/, /Memory lab/, /Live location/, /Clustering/, /Geofence/, /Heatmap/]) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});

test.describe('Demo 3 live location', () => {
  test('renders moving tags on the current floor only', async ({ page }) => {
    await openDemo(page, 'realtime');
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-positions')).toBeGreaterThan(0);
    const ground = await page.evaluate(() => window.__vivi!.levelIdOf('1F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-positions')).toEqual([ground]);

    await page.getByRole('button', { name: '3F' }).click();
    const third = await page.evaluate(() => window.__vivi!.levelIdOf('3F'));
    await pollHook(page, () => window.__vivi!.renderedLevelIds('indoor-positions')).toEqual([third]);
  });

  test('changes the number of simulated tags', async ({ page }) => {
    await openDemo(page, 'realtime');
    await page.getByRole('radio', { name: '500' }).check();
    // 换数量会重新进入页面，等新页面就绪
    await page.waitForFunction(
      () => location.hash.includes('tags=500') && window.__vivi?.demo === 'realtime' && window.__vivi.ready,
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
    await openDemo(page, 'realtime');
    // 先等标签至少上报两次，轨迹才有线段
    await pollHook(page, () => window.__vivi!.tagScreenPoint()?.samples ?? 0).toBeGreaterThan(1);
    const point = await page.evaluate(() => window.__vivi!.tagScreenPoint()!);
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: point.x, y: point.y } });
    await pollHook(page, () => window.__vivi!.replaying()).not.toBeNull();
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-trail')).toBeGreaterThan(0);
  });

  test('the performance overlay shows the numbers the hooks report', async ({ page }) => {
    await openDemo(page, 'realtime');
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

test.describe('Demo 4 clustering', () => {
  test('runs both algorithms on the same points and renders the clusters', async ({ page }) => {
    await openDemo(page, 'cluster');
    await page.getByRole('radio', { name: '10,000' }).check();
    await page.getByRole('button', { name: /Run comparison/ }).click();
    await pollHook(page, () => window.__vivi!.clusterRun()?.points).toBe(10_000);
    const run = await page.evaluate(() => window.__vivi!.clusterRun()!);
    expect(run.match).toBe(true);
    expect(run.clusters).toBeGreaterThan(0);
    await expect(page.getByTestId('naive-ms')).toHaveText(/\d+(\.\d+)? ms/);
    await expect(page.getByTestId('indexed-ms')).toHaveText(/\d+(\.\d+)? ms/);
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-clusters')).toBeGreaterThan(0);
  });
});

test.describe('Demo 7 geofence', () => {
  test('draws the preset fence and raises alerts with a popup', async ({ page }) => {
    await openDemo(page, 'geofence');
    expect(await page.evaluate(() => window.__vivi!.fenceIds())).toContain('icu');
    // 页面打开在围栏所在楼层，围栏和告警弹窗才可见
    expect(await page.evaluate(() => window.__vivi!.floor())).toBe('3F');
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-polygons')).toBeGreaterThan(0);
    await pollHook(page, () => window.__vivi!.alertCount()).toBeGreaterThan(0);
    await expect(page.getByTestId('alert-list').locator('li').first()).toBeVisible();
    await expect(page.locator('[data-popup-id]').first()).toBeVisible();
  });
});

test.describe('Demo 10 heatmap', () => {
  test('collects points and follows the time window and floor', async ({ page }) => {
    await openDemo(page, 'heatmap');
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
    await openDemo(page, 'basic');
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

test('every new page follows the language switch', async ({ page }) => {
  const titles = {
    realtime: ['Live location', '实时定位', 'リアルタイム測位'],
    cluster: ['Clustering', '聚合对比', 'クラスタリング'],
    geofence: ['Geofence', '电子围栏', 'ジオフェンス'],
    heatmap: ['Heatmap', '热力图', 'ヒートマップ'],
  } as const;
  for (const [demo, [en, zh, ja]] of Object.entries(titles)) {
    await openDemo(page, demo as keyof typeof titles);
    const switcher = page.getByRole('group', { name: /language|语言|言語/i });
    await switcher.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('heading', { name: new RegExp(en) })).toBeVisible();
    await switcher.getByRole('button', { name: '中文' }).click();
    await expect(page.getByRole('heading', { name: new RegExp(zh) })).toBeVisible();
    await switcher.getByRole('button', { name: '日本語' }).click();
    await expect(page.getByRole('heading', { name: new RegExp(ja) })).toBeVisible();
    await switcher.getByRole('button', { name: 'English' }).click();
  }
});
