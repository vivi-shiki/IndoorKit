import { expect, test } from '@playwright/test';
import { openDemo, pollHook } from './helpers';

/** 拥挤热度页：缩小时画热力图，放大后换成按权重着色的圆点，中间一段两者交叉淡入淡出 */
test('crowding shows a heatmap when zoomed out and colored cells when zoomed in', async ({ page }) => {
  await openDemo(page, 'occupancy');
  await pollHook(page, () => window.__vivi!.heatPointCount()).toBeGreaterThan(0);
  const rendered = (layer: string) => page.evaluate((id) => window.__vivi!.renderedCount(id), layer);
  const zoomTo = (zoom: number) => page.evaluate((z) => window.__vivi!.setZoom(z), zoom);

  // 打开时的视角：只有热力图
  expect(await page.evaluate(() => window.__vivi!.zoom())).toBeLessThan(19);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat')).toBeGreaterThan(0);
  expect(await rendered('indoor-heat-point')).toBe(0);

  // 过渡区间：两者都在
  await zoomTo(19.5);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat-point')).toBeGreaterThan(0);
  expect(await rendered('indoor-heat')).toBeGreaterThan(0);

  // 放大后：只有着色圆点
  await zoomTo(21.5);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat-point')).toBeGreaterThan(0);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat')).toBe(0);

  // 再缩小回去，又只剩热力图
  await zoomTo(18);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat-point')).toBe(0);
  await pollHook(page, () => window.__vivi!.renderedCount('indoor-heat')).toBeGreaterThan(0);
});
