import { floorPlugin, markerPlugin } from '@indoorkit/plugins';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { i18n, translate } from '../app-i18n';
import { createTrackedMap } from '../map-page';
import { setHooks } from '../test-hooks';
import { loadVenue } from '../venue';

interface PerformanceMemory {
  usedJSHeapSize: number;
}

const heapMb = () => {
  const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
  return memory ? memory.usedJSHeapSize / 1024 / 1024 : undefined;
};

/** 等待地图完成首次渲染；弱设备上设置上限，避免卡住 */
const waitIdle = (map: MapLibreMap) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5000);
    map.once('idle', () => {
      clearTimeout(timer);
      resolve();
    });
  });

export async function mountMemoryDemo(root: HTMLElement) {
  root.innerHTML = `
    <header class="bar">
      <a href="#/" class="back">← vivi-map</a>
      <h1 data-i18n="demo.memory.title"></h1>
      <span class="metric"><span data-i18n="metric.cycles"></span>: <b data-testid="cycles">0</b></span>
      <span class="metric"><span data-i18n="metric.heap"></span>: <b data-testid="heap">–</b></span>
      <span class="metric"><span data-i18n="metric.unreleased"></span>: <b data-testid="unreleased">0</b></span>
      <button type="button" class="action" data-action="run" data-i18n="action.runCycles"></button>
    </header>
    <div class="stage">
      <div class="map" id="map"></div>
      <canvas class="chart" width="360" height="140" aria-label="Heap per cycle"></canvas>
    </div>`;
  translate(root);
  const hooks = setHooks({ demo: 'memory' });
  const venue = await loadVenue();
  const container = root.querySelector<HTMLElement>('#map')!;
  const chart = root.querySelector<HTMLCanvasElement>('.chart')!;
  const button = root.querySelector<HTMLButtonElement>('[data-action="run"]')!;
  const samples: number[] = [];
  let stopped = false;

  const drawChart = () => {
    const ctx = chart.getContext('2d')!;
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, 0, chart.width, chart.height);
    if (samples.length === 0) return;
    const max = Math.max(...samples) * 1.2;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((v, i) => {
      const x = 10 + (i / Math.max(1, samples.length - 1)) * (chart.width - 20);
      const y = chart.height - 10 - (v / max) * (chart.height - 30);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = '#2f3a48';
    ctx.font = '12px sans-serif';
    ctx.fillText(i18n.t('chart.heap', { value: max.toFixed(1) }), 10, 16);
  };

  const cycle = async () => {
    const indoor = await createTrackedMap({ container, venue, plugins: [floorPlugin, markerPlugin] });
    const [lng, lat] = venue.center;
    for (let i = 0; i < 20; i++) {
      indoor.plugins.marker.add({ id: `m${i}`, coord: [lng + (i - 10) * 0.00002, lat] });
    }
    indoor.plugins.floor.set('2F');
    await waitIdle(indoor.map as unknown as MapLibreMap);
    await indoor.destroy();
    hooks.cycles++;
    hooks.unreleased = indoor.resources.size;
    root.querySelector('[data-testid="cycles"]')!.textContent = String(hooks.cycles);
    root.querySelector('[data-testid="unreleased"]')!.textContent = String(hooks.unreleased);
    const heap = heapMb();
    if (heap !== undefined) {
      samples.push(heap);
      root.querySelector('[data-testid="heap"]')!.textContent = `${heap.toFixed(1)} MB`;
      drawChart();
    }
  };

  let running: Promise<void> = Promise.resolve();
  hooks.runCycles = (n) => {
    running = running.then(async () => {
      button.disabled = true;
      for (let i = 0; i < n && !stopped; i++) await cycle();
      button.disabled = false;
    });
    return running;
  };
  button.addEventListener('click', () => void hooks.runCycles(10));
  const unsubscribe = i18n.subscribe(drawChart);
  drawChart();
  hooks.ready = true;

  return async () => {
    unsubscribe();
    stopped = true;
    await running;
  };
}
