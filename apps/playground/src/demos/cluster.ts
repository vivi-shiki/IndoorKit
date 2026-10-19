import { clusterIndexed, clusterNaive, clusterPlugin, floorPlugin } from '@indoorkit/plugins';
import { createSimulation } from '@indoorkit/rtls-simulator';
import { mountMapPage, radioGroup, routeParam } from '../map-page';

const POINT_COUNTS = [1000, 5000, 10_000];
const RADIUS_METERS = 3;

export async function mountClusterDemo(root: HTMLElement) {
  const count = POINT_COUNTS.includes(Number(routeParam('points'))) ? Number(routeParam('points')) : 10_000;
  const page = await mountMapPage(root, {
    demo: 'cluster',
    title: 'demo.cluster.title',
    controls: `
      ${radioGroup(
        'points',
        'control.points',
        POINT_COUNTS.map((n) => ({ value: String(n), text: n.toLocaleString('en-US') })),
        String(count),
      )}
      <button type="button" class="action" data-action="run" data-i18n="action.runCompare"></button>
      <span class="metric"><span data-i18n="metric.naive"></span>: <b data-testid="naive-ms">–</b></span>
      <span class="metric"><span data-i18n="metric.indexed"></span>: <b data-testid="indexed-ms">–</b></span>
      <span class="metric"><span data-i18n="metric.speedup"></span>: <b data-testid="speedup">–</b></span>
      <span class="metric"><span data-i18n="metric.clusters"></span>: <b data-testid="cluster-count">–</b></span>`,
    plugins: () => [floorPlugin, clusterPlugin({ radiusMeters: RADIUS_METERS })] as const,
  });
  const { indoor, venue, hooks } = page;
  let selected = count;
  let lastRun: ReturnType<typeof hooks.clusterRun> = null;

  for (const input of root.querySelectorAll<HTMLInputElement>('input[name="points"]')) {
    input.addEventListener('change', () => {
      selected = Number(input.value);
    });
  }

  const show = (testId: string, text: string) => {
    root.querySelector(`[data-testid="${testId}"]`)!.textContent = text;
  };

  /** 同一批点（模拟器生成的真实分布）分别跑两种算法，并把当前楼层的结果画到地图上 */
  const run = () => {
    const points = createSimulation(venue, { seed: `cluster-${selected}`, tags: selected }).positions();
    let started = performance.now();
    const naive = clusterNaive(points, RADIUS_METERS);
    const naiveMs = performance.now() - started;
    started = performance.now();
    const indexed = clusterIndexed(points, RADIUS_METERS);
    const indexedMs = performance.now() - started;
    indoor.plugins.cluster.setPoints(points);
    lastRun = {
      points: points.length,
      naiveMs,
      indexedMs,
      match: JSON.stringify(naive) === JSON.stringify(indexed),
      clusters: indexed.length,
    };
    show('naive-ms', `${naiveMs.toFixed(1)} ms`);
    show('indexed-ms', `${indexedMs.toFixed(1)} ms`);
    show('speedup', `×${(naiveMs / Math.max(indexedMs, 0.01)).toFixed(1)}`);
    show('cluster-count', String(indexed.length));
  };

  root.querySelector('[data-action="run"]')!.addEventListener('click', run);
  run();
  hooks.clusterRun = () => lastRun;

  return page.unmount;
}
