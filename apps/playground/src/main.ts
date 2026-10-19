import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibre-worker';
import './style.css';
import { languageSwitcher, translate } from './app-i18n';
import { themeToggle } from './app-theme';
import { mountBasicDemo } from './demos/basic';
import { mountClusterDemo } from './demos/cluster';
import { mountGeofenceDemo } from './demos/geofence';
import { mountHeatmapDemo } from './demos/heatmap';
import { mountMemoryDemo } from './demos/memory';
import { mountRealtimeDemo } from './demos/realtime';
import type { MessageKey } from './i18n';
import { setHooks, stats } from './test-hooks';

type Unmount = () => Promise<void> | void;

const app = document.querySelector<HTMLDivElement>('#app')!;
let unmount: Unmount | undefined;
stats();

// 语言和主题按钮常驻右下角，跨页面保留
const controls = document.createElement('div');
controls.className = 'app-controls';
controls.append(themeToggle(), languageSwitcher().element);
document.body.append(controls);
translate();

const DEMOS: Record<string, (root: HTMLElement) => Promise<Unmount>> = {
  basic: mountBasicDemo,
  memory: mountMemoryDemo,
  realtime: mountRealtimeDemo,
  cluster: mountClusterDemo,
  geofence: mountGeofenceDemo,
  heatmap: mountHeatmapDemo,
};

const CARDS: { demo: string; title: MessageKey; desc: MessageKey }[] = [
  { demo: 'basic', title: 'gallery.basic.title', desc: 'gallery.basic.desc' },
  { demo: 'memory', title: 'gallery.memory.title', desc: 'gallery.memory.desc' },
  { demo: 'realtime', title: 'demo.realtime.title', desc: 'demo.realtime.desc' },
  { demo: 'cluster', title: 'demo.cluster.title', desc: 'demo.cluster.desc' },
  { demo: 'geofence', title: 'demo.geofence.title', desc: 'demo.geofence.desc' },
  { demo: 'heatmap', title: 'demo.heatmap.title', desc: 'demo.heatmap.desc' },
];

function mountGallery(root: HTMLElement): Unmount {
  const cards = CARDS.map(
    (c) =>
      `<li><a href="#/${c.demo}"><strong data-i18n="${c.title}"></strong><span data-i18n="${c.desc}"></span></a></li>`,
  ).join('');
  root.innerHTML = `
    <main class="gallery">
      <h1>vivi-map</h1>
      <p data-i18n="gallery.subtitle"></p>
      <ul class="cards">${cards}</ul>
      <p class="note"><span data-i18n="gallery.note"></span> <a href="https://github.com/vivi-shiki/vivi-map">GitHub</a></p>
    </main>`;
  translate(root);
  setHooks({ demo: 'gallery', ready: true });
  return () => {};
}

// 路由按顺序切换：上一个页面完全卸载（地图、Worker）之后才挂载下一个
let routing: Promise<void> = Promise.resolve();
async function route() {
  await unmount?.();
  unmount = undefined;
  app.replaceChildren();
  const target = document.createElement('div');
  target.className = 'page';
  app.append(target);
  const name = location.hash.replace(/^#\/?/, '').split('?')[0]!;
  const mount = DEMOS[name];
  unmount = mount ? await mount(target) : mountGallery(target);
}

// 一次挂载失败要报出来，但不能卡住之后的导航
const navigate = () => {
  routing = routing.then(route).catch((error: unknown) => {
    console.error('[playground] failed to open page', error);
  });
};
window.addEventListener('hashchange', navigate);
navigate();
