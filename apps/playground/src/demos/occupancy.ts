import {
  floorPlugin,
  HEAT_WINDOWS,
  type HeatWindow,
  heatmapPlugin,
  positionStreamPlugin,
} from '@indoorkit/plugins';
import { createRoster, type Role } from '@indoorkit/rtls-simulator';
import { i18n, translate } from '../app-i18n';
import { departmentName, ROLE_COLORS, ROLES, t, unitLabel } from '../business';
import { mountMapPage, radioGroup } from '../map-page';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';
import { chipGroup, escapeHtml, throttle } from '../ui';
import { PEOPLE_SEED } from './tracking';

const PEOPLE = 2000;
const BUSIEST = 3;

export async function mountOccupancyPage(root: HTMLElement) {
  let roleOf = (_id: string): Role => 'nurse';
  const page = await mountMapPage(root, {
    demo: 'occupancy',
    readyWhen: 'first-positions',
    title: 'page.occupancy.title',
    controls: `
      ${radioGroup(
        'window',
        'control.window',
        HEAT_WINDOWS.map((m) => ({ value: String(m), text: `<span data-minutes="${m}"></span>` })),
        '5',
      )}
      <span class="metric"><span data-i18n="metric.heatPoints"></span>: <b data-testid="heat-points">0</b></span>
      <span class="chips" data-chips="role"></span>`,
    overlays: `
      <aside class="panel">
        <h2 data-i18n="busy.title"></h2>
        <ol class="rows" data-testid="busy-list"></ol>
      </aside>`,
    plugins: (venue) =>
      [
        floorPlugin,
        heatmapPlugin({ cellMeters: 2, groupOf: (p) => roleOf(p.id) }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: PEOPLE, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
        }),
      ] as const,
  });
  const { indoor, map, venue, index, hooks, cleanups } = page;
  const heat = indoor.plugins.heatmap;
  const roles = new Map(createRoster(venue, { people: PEOPLE, assets: 0 }).people.map((p) => [p.id, p.role]));
  roleOf = (id) => roles.get(id)!;
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;
  // 热力图页只看密度，隐藏单个标签
  map.setLayoutProperty('indoor-positions', 'visibility', 'none');

  const labelMinutes = () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-minutes]')) {
      el.textContent = i18n.t('control.minutes', { value: el.dataset.minutes! });
    }
  };

  const roleChips = chipGroup({
    container: $('[data-chips="role"]'),
    testId: 'role-chip',
    items: () => ROLES.map((r) => ({ value: r, text: t(`role.${r}`), color: ROLE_COLORS[r] })),
    onChange: (selected) => {
      heat.setGroups(selected.size === 0 ? null : [...selected]);
      busy(true);
    },
  });

  // 当前楼层、当前窗口里上报最多的区块（不含走廊等公共通道）
  const renderBusy = () => {
    const counts = new Map<string, number>();
    for (const f of heat.data()) {
      const coord = (f.geometry as GeoJSON.Point).coordinates as [number, number];
      const where = index.locate(String(f.properties!.level_id), coord);
      if (!where || index.unit(where.unitId).category === 'walkway') continue;
      counts.set(where.unitId, (counts.get(where.unitId) ?? 0) + Number(f.properties!.weight));
    }
    $('[data-testid="busy-list"]').innerHTML = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, BUSIEST)
      .map(([id, n]) => {
        const unit = index.unit(id);
        return `<li data-testid="busy-row"><span class="name">${escapeHtml(unitLabel(index, venue, id))} <span class="muted">${escapeHtml(
          departmentName(venue, unit.departmentId),
        )}</span></span><span class="count">${t('busy.reports', { value: n })}</span></li>`;
      })
      .join('');
  };
  const busy = throttle(renderBusy, 2000);

  const relabel = () => {
    labelMinutes();
    roleChips.render();
    translate(root);
    busy(true);
  };
  relabel();
  cleanups.push(i18n.subscribe(relabel));

  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="window"]')) {
    input.addEventListener('change', () => {
      heat.setWindow(Number(input.value) as HeatWindow);
      busy(true);
    });
  }

  const countEl = root.querySelector('[data-testid="heat-points"]')!;
  indoor.events.on('positions:update', () => {
    countEl.textContent = String(heat.pointCount());
    busy();
  });
  indoor.events.on('floor:change', () => busy(true));

  hooks.heatWindow = () => heat.window();
  hooks.heatPointCount = () => heat.pointCount();
  hooks.heatGroups = () => (heat.groups() ? [...heat.groups()!] : null);
  hooks.heatLevelIds = () => [...new Set(heat.data().map((f) => String(f.properties!.level_id)))].sort();

  return page.unmount;
}
