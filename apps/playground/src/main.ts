import './engine/maplibre';
import './style.css';
import { languageSwitcher, setPageTitle, translate } from './app-i18n';
import { themeToggle } from './app-theme';
import type { MessageKey } from './i18n';
import { mountAlertsPage } from './pages/alerts';
import { mountAssetsPage } from './pages/assets';
import { mountOccupancyPage } from './pages/occupancy';
import { mountTrackingPage } from './pages/tracking';
import { mountTrailPage } from './pages/trail';
import { setHooks, stats } from './testing/hooks';

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

/** 业务页面；其他地址（包括已移除的旧示例页）都回到画廊 */
const PAGES: Record<string, (root: HTMLElement) => Promise<Unmount>> = {
  assets: mountAssetsPage,
  tracking: mountTrackingPage,
  trail: mountTrailPage,
  alerts: mountAlertsPage,
  occupancy: mountOccupancyPage,
};

/** 两个视图：设备视图看设备，人员视图看人 */
const GROUPS = {
  efficiency: ['assets'],
  people: ['tracking', 'trail', 'alerts', 'occupancy'],
};

function mountGallery(root: HTMLElement): Unmount {
  const card = (page: string) =>
    `<li><a href="#/${page}"><strong data-i18n="page.${page}.title"></strong><span data-i18n="page.${page}.desc"></span></a></li>`;
  const groups = Object.entries(GROUPS)
    .map(
      ([group, pages]) => `
      <section class="group" data-group="${group}">
        <h2 data-i18n="${`group.${group}.title` as MessageKey}"></h2>
        <p data-i18n="${`group.${group}.desc` as MessageKey}"></p>
        <ul class="cards">${pages.map(card).join('')}</ul>
      </section>`,
    )
    .join('');
  root.innerHTML = `
    <main class="gallery">
      <h1 data-i18n="app.name"></h1>
      <p data-i18n="gallery.subtitle"></p>
      ${groups}
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
