import 'maplibre-gl/dist/maplibre-gl.css';
import './maplibre-worker';
import './style.css';
import { mountBasicDemo } from './demos/basic';
import { mountMemoryDemo } from './demos/memory';
import { setHooks } from './test-hooks';

type Unmount = () => Promise<void> | void;

const app = document.querySelector<HTMLDivElement>('#app')!;
let unmount: Unmount | undefined;

function mountGallery(root: HTMLElement): Unmount {
  root.innerHTML = `
    <main class="gallery">
      <h1>vivi-map</h1>
      <p>开源 TypeScript 室内地图 SDK 的示例画廊 · Demo gallery of an open-source indoor map SDK</p>
      <ul class="cards">
        <li><a href="#/basic"><strong>1 · 基础地图 Basic map</strong><span>虚构医院、楼层切换、标记</span></a></li>
        <li><a href="#/memory"><strong>2 · 内存实验室 Memory lab</strong><span>反复创建/销毁地图，观察堆与未释放资源</span></a></li>
      </ul>
      <p class="note">地图数据为虚构的「さくら総合病院」。<a href="https://github.com/vivi-shiki/vivi-map">GitHub</a></p>
    </main>`;
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
