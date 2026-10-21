import { expect, test } from '@playwright/test';
import { openDemo, pollHook } from './helpers';

const ROLES = ['doctor', 'nurse', 'patient', 'visitor', 'caregiver', 'security'];

test.describe('Real-time Tracking: people', () => {
  test('colours people by role and filters them by role', async ({ page }) => {
    await openDemo(page, 'tracking', 'tags=500');
    await pollHook(page, () => window.__vivi!.renderedRoles().length).toBeGreaterThan(1);
    for (const role of await page.evaluate(() => window.__vivi!.renderedRoles()))
      expect(ROLES).toContain(role);

    await page
      .getByTestId('role-chip')
      .filter({ hasText: /Visitor/ })
      .click();
    await pollHook(page, () => window.__vivi!.renderedRoles()).toEqual(['visitor']);
  });

  test('lists people by department, searches a person and follows them', async ({ page }) => {
    await openDemo(page, 'tracking', 'tags=500');
    await expect(page.getByTestId('person-group')).not.toHaveCount(0);
    const target = await page.evaluate(() => window.__vivi!.personOnAnotherFloor());
    await page.getByTestId('person-search').fill(target.name);
    await page.getByTestId('search-result').first().click();
    await pollHook(page, () => window.__vivi!.selected()).toBe(target.id);
    await pollHook(page, () => window.__vivi!.floor()).toBe(target.floor);

    const card = page.getByTestId('person-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(target.name);
    await expect(card.getByTestId('person-department')).not.toBeEmpty();
    await expect(card.getByTestId('person-location')).not.toBeEmpty();
    await expect(card.getByRole('link', { name: 'Play location history' })).toHaveAttribute(
      'href',
      `#/hospital/trail?tag=${target.id}`,
    );

    // 跟随按钮的文字说明点下去会发生什么
    const follow = card.getByTestId('follow');
    const following = await follow.getAttribute('aria-pressed');
    await expect(follow).toHaveText(following === 'true' ? 'Stop following' : 'Follow location');
    await follow.click();
    await expect(follow).toHaveAttribute('aria-pressed', following === 'true' ? 'false' : 'true');
    await expect(follow).toHaveText(following === 'true' ? 'Follow location' : 'Stop following');
  });

  test('clicking a person on the map opens their card', async ({ page }) => {
    await openDemo(page, 'tracking', 'tags=500');
    await pollHook(page, () => window.__vivi!.tagScreenPoint()?.samples ?? 0).toBeGreaterThan(1);
    const point = await page.evaluate(() => window.__vivi!.tagScreenPoint()!);
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: point.x, y: point.y } });
    await pollHook(page, () => window.__vivi!.selected()).not.toBeNull();
    await expect(page.getByTestId('person-card')).toBeVisible();
  });
});

test.describe('Trail Replay', () => {
  test('replays the history of a person with stops and floor changes', async ({ page }) => {
    await openDemo(page, 'trail', 'tag=P0001');
    expect(await page.evaluate(() => window.__vivi!.trailPerson())).toBe('P0001');
    const [start, end] = await page.evaluate(() => window.__vivi!.trailRange());
    expect(end).toBeGreaterThan(start);
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-trail-path')).toBeGreaterThan(0);
    await expect(page.getByTestId('stop-row')).not.toHaveCount(0);

    // 点途经地点跳到对应时刻和楼层
    const stops = await page.evaluate(() => window.__vivi!.trailStops());
    const last = stops.at(-1)!;
    await page
      .getByTestId('stop-row')
      .nth(stops.length - 1)
      .click();
    await pollHook(page, () => window.__vivi!.trailTime()).toBe(last.start);
    await pollHook(page, () => window.__vivi!.floor()).toBe(last.floor);
  });

  test('plays back at the chosen speed and switches floors with the person', async ({ page }) => {
    await openDemo(page, 'trail', 'tag=P0001');
    // range 输入框不能 fill：用原生 setter 设值再派发 input 事件，React 才认得这次修改
    await page.getByTestId('trail-seek').evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '0');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.getByRole('radio', { name: '16×' }).check();
    await page.getByTestId('trail-play').click();
    const before = await page.evaluate(() => window.__vivi!.trailTime());
    await pollHook(page, () => window.__vivi!.trailTime()).toBeGreaterThan(before + 5_000);
    await page.getByTestId('trail-play').click();
    const head = await page.evaluate(() => window.__vivi!.trailHeadFloor());
    expect(await page.evaluate(() => window.__vivi!.floor())).toBe(head);
  });

  test('switches to another person', async ({ page }) => {
    await openDemo(page, 'trail', 'tag=P0001');
    await page.getByTestId('trail-person').selectOption('P0002');
    await pollHook(page, () => window.__vivi!.trailPerson()).toBe('P0002');
    await expect(page.getByTestId('stop-row')).not.toHaveCount(0);
  });
});

test.describe('Alerts: two layers', () => {
  test('raises department alarms and shows who, where and which layer', async ({ page }) => {
    await openDemo(page, 'alerts');
    await pollHook(page, () => window.__vivi!.alarmLayers()).toContain('department');
    const item = page.getByTestId('alarm-item').first();
    await expect(item).toBeVisible();
    await expect(item.getByTestId('alarm-subject')).not.toBeEmpty();
    await expect(item.getByTestId('alarm-layer')).not.toBeEmpty();
    await pollHook(page, () => window.__vivi!.renderedCount('indoor-zones')).toBeGreaterThan(0);
  });

  test('acknowledges and resolves an alarm', async ({ page }) => {
    await openDemo(page, 'alerts');
    await pollHook(page, () => window.__vivi!.alertCount()).toBeGreaterThan(0);
    const id = await page.getByTestId('alarm-item').first().getAttribute('data-alarm');
    // 新告警插在列表顶部，按 id 定位同一条
    const item = page.locator(`[data-alarm="${id}"]`);
    const open = await page.evaluate(() => window.__vivi!.unhandledCount());
    await item.getByRole('button', { name: 'Mark as acknowledged' }).click();
    const state = () => page.evaluate((alarm) => window.__vivi!.alarmState(alarm), id!);
    await expect.poll(state).toBe('acknowledged');
    await item.getByRole('button', { name: 'Mark as resolved' }).click();
    await expect.poll(state).toBe('resolved');
    expect(await page.evaluate(() => window.__vivi!.unhandledCount())).toBeLessThanOrEqual(open);
  });

  test('locates the subject of an alarm and filters by layer', async ({ page }) => {
    await openDemo(page, 'alerts');
    await pollHook(page, () => window.__vivi!.alertCount()).toBeGreaterThan(0);
    const item = page.getByTestId('alarm-item').first();
    const floor = await item.getAttribute('data-floor');
    await item.getByTestId('alarm-subject').click();
    await pollHook(page, () => window.__vivi!.floor()).toBe(floor);

    await page
      .getByTestId('layer-chip')
      .filter({ hasText: /Department|科室|診療科/ })
      .click();
    const layers = await page
      .getByTestId('alarm-item')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-layer')));
    expect(layers.length).toBeGreaterThan(0);
    expect(new Set(layers)).toEqual(new Set(['department']));
  });
});

test.describe('Occupancy Heatmap: roles and busiest areas', () => {
  test('filters the heat by role and ranks the busiest areas', async ({ page }) => {
    await openDemo(page, 'occupancy');
    await pollHook(page, () => window.__vivi!.heatPointCount()).toBeGreaterThan(0);
    const rows = page.getByTestId('busy-row');
    await expect(rows).not.toHaveCount(0);
    expect(await rows.count()).toBeLessThanOrEqual(3);

    await page
      .getByTestId('role-chip')
      .filter({ hasText: /Visitor/ })
      .click();
    await pollHook(page, () => window.__vivi!.heatGroups()).toEqual(['visitor']);
  });
});
