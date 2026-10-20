import type { Role } from '@indoorkit/hospital';
import { floorPlugin, heatmapPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { createRoster, createSimProvider, PEOPLE_SEED, SIM_INTERVAL_MS } from '../../adapters/sim';
import { i18n, translate } from '../../app-i18n';
import { ROLE_COLORS, ROLES } from '../../presentation/colors';
import { t } from '../../presentation/format';
import { chipGroup, throttle } from '../../presentation/ui';
import { mountMapPage } from '../map-page';
import { busyList, controls, DEFAULT_WINDOW, HEAT_WINDOWS, overlays } from './view';

const PEOPLE = 2000;
const BUSIEST = 3;

/** 人流密度分析：按时间窗口和角色统计的热力图，以及最忙的区块 */
export async function mountOccupancyPage(root: HTMLElement) {
  let roleOf = (_id: string): Role => 'nurse';
  const page = await mountMapPage(root, {
    demo: 'occupancy',
    readyWhen: 'first-positions',
    title: 'page.occupancy.title',
    controls,
    overlays,
    plugins: (venue) =>
      [
        floorPlugin,
        heatmapPlugin({
          cellMeters: 2,
          windowsMinutes: HEAT_WINDOWS,
          window: DEFAULT_WINDOW,
          groupOf: (p) => roleOf(p.id),
        }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: PEOPLE, seed: PEOPLE_SEED }),
          intervalMs: SIM_INTERVAL_MS,
          // 热力图页只看密度，不画单个标签
          visible: false,
        }),
      ] as const,
  });
  const { indoor, venue, index, hospital, hooks, cleanups } = page;
  const heat = indoor.plugins.heatmap;
  const roles = new Map(createRoster(venue, { people: PEOPLE, assets: 0 }).people.map((p) => [p.id, p.role]));
  roleOf = (id) => roles.get(id)!;
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;

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
    $('[data-testid="busy-list"]').innerHTML = busyList(
      { venue, index, departmentOfUnit: hospital.departmentOfUnit },
      [...counts].sort((a, b) => b[1] - a[1]).slice(0, BUSIEST),
    );
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
      heat.setWindow(Number(input.value));
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
