import { floorPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { translate } from '../app-i18n';
import { mountMapPage, radioGroup, routeParam } from '../map-page';
import { mountPerfOverlay } from '../perf';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';

const TAG_COUNTS = [500, 2000, 5000];

export async function mountRealtimeDemo(root: HTMLElement) {
  const tags = TAG_COUNTS.includes(Number(routeParam('tags'))) ? Number(routeParam('tags')) : 2000;
  const page = await mountMapPage(root, {
    demo: 'realtime',
    readyWhen: 'first-positions',
    title: 'demo.realtime.title',
    controls: `
      ${radioGroup(
        'tags',
        'control.tags',
        TAG_COUNTS.map((n) => ({ value: String(n), text: n.toLocaleString('en-US') })),
        String(tags),
      )}
      <span class="hint" data-i18n="hint.replay"></span>`,
    overlays: `<div class="perf" data-testid="perf"></div>`,
    plugins: (venue) =>
      [
        floorPlugin,
        positionStreamPlugin({ provider: createSimProvider(venue, tags), intervalMs: SIM_INTERVAL_MS }),
      ] as const,
  });
  const { indoor, map, hooks, cleanups } = page;
  const stream = indoor.plugins['position-stream'];

  // 换标签数量时重新进入页面，旧地图和 Worker 随之释放
  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="tags"]')) {
    input.addEventListener('change', () => {
      location.hash = `#/realtime?tags=${input.value}`;
    });
  }

  const perfEl = root.querySelector<HTMLElement>('[data-testid="perf"]')!;
  const perf = mountPerfOverlay(perfEl, () => stream.count());
  translate(perfEl);
  cleanups.push(() => perf.dispose());

  // 点击位置周围 10 px 内的标签：标签在移动，精确命中一个像素不现实
  map.on('click', (e) => {
    const { x, y } = e.point;
    const hit = map.queryRenderedFeatures(
      [
        [x - 10, y - 10],
        [x + 10, y + 10],
      ],
      { layers: ['indoor-positions'] },
    )[0];
    if (hit) stream.replay(String(hit.properties.id));
    else stream.clearReplay();
  });

  hooks.perf = () => perf.snapshot();
  hooks.replaying = () => stream.replaying();
  hooks.tagScreenPoint = () => {
    const best = [...stream.visible()].sort(
      (a, b) => stream.history(b.id).length - stream.history(a.id).length,
    )[0];
    if (!best) return null;
    const { x, y } = map.project(best.coord);
    return { id: best.id, x, y, samples: stream.history(best.id).length };
  };

  return page.unmount;
}
