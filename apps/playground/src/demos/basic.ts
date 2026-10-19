import { floorPlugin, markerPlugin } from '@indoorkit/plugins';
import { mountMapPage } from '../map-page';

export async function mountBasicDemo(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'basic',
    title: 'demo.basic.title',
    controls: `
      <span class="metric"><span data-i18n="metric.firstRender"></span>: <b data-testid="first-render">…</b></span>
      <span class="metric"><span data-i18n="metric.markers"></span>: <b data-testid="marker-count">0</b></span>
      <button type="button" class="action" data-action="add-marker" data-i18n="action.addMarker"></button>`,
    plugins: () => [floorPlugin, markerPlugin] as const,
  });
  const { indoor, venue } = page;

  const countEl = root.querySelector('[data-testid="marker-count"]')!;
  indoor.events.on('marker:change', ({ count }) => {
    countEl.textContent = String(count);
  });

  let added = 0;
  root.querySelector('[data-action="add-marker"]')!.addEventListener('click', () => {
    // 沿走廊依次摆放，位置可预测，方便验证
    const [lng, lat] = venue.center;
    const offset = ((added % 7) - 3) * 0.00005;
    added++;
    indoor.plugins.marker.add({ id: `marker-${added}`, coord: [lng + offset, lat], label: `#${added}` });
  });

  return page.unmount;
}
