import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibre-worker';
import './style.css';
import { languageSwitcher, setPageTitle, translate } from './app-i18n';
import { themeToggle } from './app-theme';
import { mountAlertsPage } from './demos/alerts';
import { mountAssetsPage } from './demos/assets';
import { mountOccupancyPage } from './demos/occupancy';
import { mountTrackingPage } from './demos/tracking';
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

/** 四个业务页面；其他地址（包括已移除的旧示例页）都回到画廊 */
const PAGES: Record<string, (root: HTMLElement) => Promise<Unmount>> = {
  tracking: mountTrackingPage,
  assets: mountAssetsPage,
  alerts: mountAlertsPage,
  occupancy: mountOccupancyPage,
};

const CARDS = Object.keys(PAGES).map((page) => ({
  page,
  title: `page.${page}.title` as MessageKey,
  desc: `page.${page}.desc` as MessageKey,
}));

function mountGallery(root: HTMLElement): Unmount {
  const cards = CARDS.map(
    (c) =>
      `<li><a href="#/${c.page}"><strong data-i18n="${c.title}"></strong><span data-i18n="${c.desc}"></span></a></li>`,
  ).join('');
  root.innerHTML = `
    <main class="gallery">
      <h1 data-i18n="app.name"></h1>
      <p data-i18n="gallery.subtitle"></p>
      <ul class="cards">${cards}</ul>
      <p class="note"><span data-i18n="gallery.note"></span> <a href="https://github.com/vivi-shiki/IndoorKit">GitHub</a></p>
    </main>`;
  setPageTitle(null);
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
  const mount = PAGES[name];
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
