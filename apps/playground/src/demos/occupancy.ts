import {
  floorPlugin,
  HEAT_WINDOWS,
  type HeatWindow,
  heatmapPlugin,
  positionStreamPlugin,
} from '@indoorkit/plugins';
import { i18n } from '../app-i18n';
import { mountMapPage, radioGroup } from '../map-page';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';

export async function mountOccupancyPage(root: HTMLElement) {
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
      <span class="metric"><span data-i18n="metric.heatPoints"></span>: <b data-testid="heat-points">0</b></span>`,
    plugins: (venue) =>
      [
        floorPlugin,
        heatmapPlugin({ cellMeters: 2 }),
        positionStreamPlugin({
          provider: createSimProvider(venue, 2000, 'heatmap'),
          intervalMs: SIM_INTERVAL_MS,
        }),
      ] as const,
  });
  const { indoor, map, hooks, cleanups } = page;
  const heat = indoor.plugins.heatmap;
  // 热力图页只看密度，隐藏单个标签
  map.setLayoutProperty('indoor-positions', 'visibility', 'none');

  const labelMinutes = () => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-minutes]')) {
      el.textContent = i18n.t('control.minutes', { value: el.dataset.minutes! });
    }
  };
  labelMinutes();
  cleanups.push(i18n.subscribe(labelMinutes));

  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="window"]')) {
    input.addEventListener('change', () => heat.setWindow(Number(input.value) as HeatWindow));
  }

  const countEl = root.querySelector('[data-testid="heat-points"]')!;
  indoor.events.on('positions:update', () => {
    countEl.textContent = String(heat.pointCount());
  });

  hooks.heatWindow = () => heat.window();
  hooks.heatPointCount = () => heat.pointCount();
  hooks.heatLevelIds = () => [...new Set(heat.data().map((f) => String(f.properties!.level_id)))].sort();

  return page.unmount;
}
