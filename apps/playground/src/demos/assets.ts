import { clusterPlugin, floorPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { mountMapPage } from '../map-page';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';

/** 3 米内的设备合为一个聚集点 */
const RADIUS_METERS = 3;

export async function mountAssetsPage(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'assets',
    title: 'page.assets.title',
    readyWhen: 'first-positions',
    controls: `
      <span class="metric"><span data-i18n="metric.clusters"></span>: <b data-testid="cluster-count">0</b></span>
      <span class="metric"><span data-i18n="metric.assets"></span>: <b data-testid="asset-count">0</b></span>`,
    plugins: (venue) =>
      [
        floorPlugin,
        clusterPlugin({ radiusMeters: RADIUS_METERS }),
        positionStreamPlugin({
          provider: createSimProvider(venue, 1500, 'assets'),
          intervalMs: SIM_INTERVAL_MS,
        }),
      ] as const,
  });
  const { indoor, map, hooks } = page;
  const { cluster } = indoor.plugins;
  // 只用聚集点展示设备，隐藏逐个标签
  map.setLayoutProperty('indoor-positions', 'visibility', 'none');

  const show = () => {
    const clusters = cluster.clusters();
    root.querySelector('[data-testid="cluster-count"]')!.textContent = String(clusters.length);
    root.querySelector('[data-testid="asset-count"]')!.textContent = String(
      clusters.reduce((sum, c) => sum + c.ids.length, 0),
    );
  };
  indoor.events.on('positions:update', show);
  indoor.events.on('floor:change', show);

  hooks.clusterCount = () => cluster.clusters().length;

  return page.unmount;
}
