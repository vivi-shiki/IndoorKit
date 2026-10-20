import { expect, test } from '@playwright/test';
import { openDemo, pollHook } from './helpers';

test.describe('Asset Overview: departments and drill-down', () => {
  test('lists departments and filters the clusters to the chosen one', async ({ page }) => {
    await openDemo(page, 'assets');
    const rows = page.getByTestId('dept-row');
    await expect(rows).not.toHaveCount(0);
    expect(await rows.count()).toBeGreaterThanOrEqual(8);
    await pollHook(page, () => window.__vivi!.clusterCount()).toBeGreaterThan(0);

    const icu = await page.evaluate(() => window.__vivi!.departmentIdOf('icu'));
    await page.locator(`[data-testid="dept-row"][data-dept="${icu}"]`).click();
    await pollHook(page, () => window.__vivi!.highlightedDepartment()).toBe(icu);
    // 选中科室后切到该科室所在楼层，只显示该科室的设备
    await pollHook(page, () => window.__vivi!.floor()).toBe('3F');
    await pollHook(page, () => window.__vivi!.groupDepartments()).toEqual([icu]);
    await expect(page.locator(`[data-testid="dept-row"][data-dept="${icu}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('opens a unit drawer from a cluster and an asset detail from the drawer', async ({ page }) => {
    await openDemo(page, 'assets');
    await pollHook(page, () => window.__vivi!.clusterScreenPoint()).not.toBeNull();
    const point = await page.evaluate(() => window.__vivi!.clusterScreenPoint()!);
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: point.x, y: point.y } });
    await pollHook(page, () => window.__vivi!.drawerUnit()).toBe(point.unitId);

    const drawer = page.getByTestId('unit-drawer');
    await expect(drawer).toBeVisible();
    const assets = drawer.getByTestId('asset-row');
    await expect(assets).toHaveCount(point.count);
    await expect(assets.first()).toContainText(/[A-Z]{2,3}-\d{4}/);

    await assets.first().click();
    const detail = page.getByTestId('asset-detail');
    await expect(detail).toBeVisible();
    const id = await page.evaluate(() => window.__vivi!.detailAsset());
    expect(id).toMatch(/^A\d{4}$/);
    await expect(detail.getByTestId('asset-status')).not.toBeEmpty();
    await expect(detail.getByTestId('asset-run-today')).toContainText(/\d/);
    await expect(detail.getByTestId('asset-department')).not.toBeEmpty();
    await expect(detail.getByTestId('status-timeline').locator('[data-status]')).not.toHaveCount(0);

    await page.getByTestId('close-detail').click();
    await expect(detail).toBeHidden();
  });

  test('filters by status and searches an asset by code', async ({ page }) => {
    await openDemo(page, 'assets');
    await pollHook(page, () => window.__vivi!.clusterCount()).toBeGreaterThan(0);
    await page
      .getByTestId('status-chip')
      .filter({ hasText: /Running/ })
      .click();
    await pollHook(page, () => window.__vivi!.groupStatuses()).toEqual(['running']);
    await page
      .getByTestId('status-chip')
      .filter({ hasText: /Running/ })
      .click();

    const target = await page.evaluate(() => window.__vivi!.assetOnAnotherFloor());
    await page.getByTestId('asset-search').fill(target.code);
    const results = page.getByTestId('search-result');
    await expect(results).toHaveCount(1);
    await results.first().click();
    await pollHook(page, () => window.__vivi!.floor()).toBe(target.floor);
    await pollHook(page, () => window.__vivi!.detailAsset()).toBe(target.id);
  });

  test('shows the department ranges on the map', async ({ page }) => {
    await openDemo(page, 'assets');
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-zones')).toBeGreaterThan(0);
    await page.getByTestId('toggle-departments').click();
    await pollHook(page, () => window.__vivi!.departmentLayerVisible()).toBe(false);
  });
});
