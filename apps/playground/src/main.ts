import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibre-worker';
import './style.css';
import { languageSwitcher, translate } from './app-i18n';
import { mountBasicDemo } from './demos/basic';
import { mountMemoryDemo } from './demos/memory';
import { setHooks } from './test-hooks';

type Unmount = () => Promise<void> | void;

const app = document.querySelector<HTMLDivElement>('#app')!;
let unmount: Unmount | undefined;

// 语言切换按钮常驻右下角，跨页面保留
document.body.append(languageSwitcher().element);
translate();

function mountGallery(root: HTMLElement): Unmount {
  root.innerHTML = `
    <main class="gallery">
      <h1>vivi-map</h1>
      <p data-i18n="gallery.subtitle"></p>
      <ul class="cards">
        <li><a href="#/basic"><strong data-i18n="gallery.basic.title"></strong><span data-i18n="gallery.basic.desc"></span></a></li>
        <li><a href="#/memory"><strong data-i18n="gallery.memory.title"></strong><span data-i18n="gallery.memory.desc"></span></a></li>
      </ul>
      <p class="note"><span data-i18n="gallery.note"></span> <a href="https://github.com/vivi-shiki/vivi-map">GitHub</a></p>
    </main>`;
  translate(root);
  setHooks({ demo: 'gallery', ready: true });
  return () => {};
}

async function route() {
  await unmount?.();
  unmount = undefined;
  app.replaceChildren();
  const target = document.createElement('div');
  target.className = 'page';
  app.append(target);
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash === 'basic') unmount = await mountBasicDemo(target);
  else if (hash === 'memory') unmount = await mountMemoryDemo(target);
  else unmount = mountGallery(target);
}

window.addEventListener('hashchange', () => void route());
void route();
