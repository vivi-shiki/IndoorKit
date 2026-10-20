import {
  type AnyPlugin,
  type CreateIndoorMapOptions,
  createIndoorMap,
  type IndoorMap,
  languageFallbacks,
  themes,
} from '@indoorkit/core';
import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import { createVenueIndex, type DepartmentApi, type FloorApi } from '@indoorkit/plugins';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { i18n, setPageTitle, translate } from './app-i18n';
import { appTheme } from './app-theme';
import type { MessageKey } from './i18n';
import { setHooks, stats, type ViviTestHooks } from './test-hooks';
import { loadVenue } from './venue';

/** 创建地图并计入全局统计；销毁后记录未释放资源数 */
export async function createTrackedMap<const P extends readonly AnyPlugin[]>(
  options: CreateIndoorMapOptions<P>,
): Promise<IndoorMap<P>> {
  const indoor = await createIndoorMap({
    ...options,
    languages: options.languages ?? languageFallbacks(i18n.locale),
    theme: options.theme ?? themes[appTheme.value],
  });
  stats().liveMaps++;
  const destroy = indoor.destroy;
  let counted = false;
  indoor.destroy = async () => {
    try {
      await destroy();
    } finally {
      if (!counted) {
        counted = true;
        stats().liveMaps--;
        stats().lastUnreleased = indoor.resources.size;
      }
    }
  };
  return indoor;
}

export interface MapPageOptions<P extends readonly AnyPlugin[]> {
  demo: ViviTestHooks['demo'];
  title: MessageKey;
  /** 标题栏里的指标和控件（HTML，可带 data-i18n） */
  controls: string;
  /** 地图上方的叠加面板（HTML） */
  overlays?: string;
  plugins: (venue: VenueModel) => P;
  /** 打开时所在楼层 */
  floor?: string;
  /**
   * 页面何时算就绪。默认等地图第一次 idle；实时数据页的地图会一直重绘、不会 idle，
   * 改为等第一批位置画出来。manual：页面自己设置 hooks.ready。
   */
  readyWhen?: 'idle' | 'first-positions' | 'manual';
}

/**
 * 地图示例页的公共部分：标题栏、地图、楼层按钮、场馆名、语言与主题联动、通用测试钩子。
 * 返回的 cleanup 列表在卸载时按逆序执行，最后销毁地图。
 */
export async function mountMapPage<const P extends readonly AnyPlugin[]>(
  root: HTMLElement,
  options: MapPageOptions<P>,
) {
  root.innerHTML = `
    <header class="bar">
      <a href="#/" class="back">← IndoorKit</a>
      <h1 data-i18n="${options.title}"></h1>
      ${options.controls}
    </header>
    <div class="stage">
      <div class="map" id="map"></div>
      <div class="floors" role="group" data-i18n-aria="floor.label"></div>
      <div class="venue-name" data-testid="venue-name"></div>
      ${options.overlays ?? ''}
    </div>`;
  // 列表面板：桌面端常驻左侧；手机端收在按钮后面，点开后是底部抽屉
  const stage = root.querySelector<HTMLElement>('.stage')!;
  const panel = stage.querySelector<HTMLElement>('.panel');
  const toggle = panel && document.createElement('button');
  if (toggle) {
    toggle.type = 'button';
    toggle.className = 'panel-toggle';
    toggle.dataset.testid = 'panel-toggle';
    toggle.dataset.i18n = 'panel.toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      stage.toggleAttribute('data-panel-open', open);
    });
    stage.append(toggle);
  }
  setPageTitle(options.title);
  translate(root);
  const hooks = setHooks({ demo: options.demo });
  const cleanups: (() => void)[] = [];

  const venue = await loadVenue();
  const indoor = await createTrackedMap({
    container: root.querySelector<HTMLElement>('#map')!,
    venue,
    plugins: options.plugins(venue),
  });
  const map = indoor.map as unknown as MapLibreMap;
  const floor = (indoor.plugins as Record<string, unknown>).floor as FloorApi;
  if (options.floor) floor.set(options.floor);
  // 场馆放在面板和按钮之外的空白里，留白按实际布局计算
  if (panel && toggle) {
    const shown = (el: HTMLElement) => getComputedStyle(el).display !== 'none';
    const stageBox = stage.getBoundingClientRect();
    map.fitBounds(venue.bounds, {
      padding: {
        top: shown(toggle) ? toggle.getBoundingClientRect().bottom - stageBox.top + 16 : 48,
        bottom: 72,
        left: shown(panel) ? panel.getBoundingClientRect().right - stageBox.left + 16 : 24,
        right: 88,
      },
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: 0,
    });
  }

  // 地图外的场馆名与地图内的标注随语言一起切换，不重建地图
  const venueNameEl = root.querySelector('.venue-name')!;
  const applyLanguage = () => {
    const languages = languageFallbacks(i18n.locale);
    venueNameEl.textContent = pickLabel(venue.name, languages) ?? '';
    if (indoor.languages[0] !== languages[0]) indoor.setLanguages(languages);
  };
  applyLanguage();
  cleanups.push(i18n.subscribe(applyLanguage));
  cleanups.push(appTheme.subscribe((name) => indoor.setTheme(themes[name])));

  const floorsEl = root.querySelector<HTMLElement>('.floors')!;
  const renderFloors = () => {
    floorsEl.replaceChildren(
      ...[...floor.list()].reverse().map((level) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = level.shortName.en ?? level.id;
        button.setAttribute('aria-pressed', String(level.id === floor.current().id));
        button.addEventListener('click', () => floor.set(level.id));
        return button;
      }),
    );
  };
  renderFloors();
  indoor.events.on('floor:change', renderFloors);

  const index = createVenueIndex(venue);
  const department = (indoor.plugins as Record<string, unknown>).department as DepartmentApi | undefined;
  if (department) {
    hooks.departmentIdOf = (code) => index.departmentByCode(code).id;
    hooks.highlightedDepartment = () => department.highlighted();
    hooks.departmentLayerVisible = () => department.visible();
  }

  const rendered = (layerId: string) => map.queryRenderedFeatures({ layers: [layerId] });
  hooks.floor = () => floor.current().shortName.en ?? '';
  hooks.levelIdOf = (short) => floor.resolve(short).id;
  hooks.renderedLevelIds = (layerId) =>
    [...new Set(rendered(layerId).map((f) => String(f.properties.level_id)))].sort();
  hooks.renderedCount = (layerId) => new Set(rendered(layerId).map((f) => String(f.properties.id))).size;
  hooks.labelLanguage = () => {
    const field = map.getLayoutProperty('indoor-labels', 'text-field') as [string, [string, string]];
    return field[1][1].replace('label_', '');
  };
  hooks.resourceLabels = () => indoor.resources.labels();
  hooks.styleLayerIds = () => map.getStyle().layers.map((layer) => layer.id);
  hooks.mapBackground = () => String(map.getPaintProperty('background', 'background-color'));
  hooks.venueScreenCenter = () => {
    const [[west, south], [east, north]] = venue.bounds;
    const point = map.project([(west + east) / 2, (south + north) / 2]);
    const box = map.getContainer().getBoundingClientRect();
    return { x: box.left + point.x, y: box.top + point.y };
  };

  const ready = () => {
    hooks.ready = true;
  };
  if (options.readyWhen === 'first-positions') {
    const off = indoor.events.on('positions:update', () => {
      off();
      map.once('render', ready);
    });
  } else if (options.readyWhen !== 'manual') {
    map.once('idle', ready);
  }

  return {
    indoor,
    map,
    floor,
    venue,
    index,
    hooks,
    cleanups,
    unmount: async () => {
      for (const cleanup of cleanups.reverse()) cleanup();
      await indoor.destroy();
    },
  };
}

/** 标题栏里的单选组，选项文字可选择是否翻译 */
export function radioGroup(
  name: string,
  label: MessageKey,
  values: { value: string; text: string }[],
  selected: string,
) {
  const items = values
    .map(
      (v) =>
        `<label class="radio"><input type="radio" name="${name}" value="${v.value}"${v.value === selected ? ' checked' : ''} />${v.text}</label>`,
    )
    .join('');
  return `<fieldset class="radios"><legend data-i18n="${label}"></legend>${items}</fieldset>`;
}

/** 楼层简称，如 3F */
export const floorName = (floor: FloorApi, levelId: string) => {
  const level = floor.resolve(levelId);
  return level.shortName.en ?? level.id;
};

/** 读取 #/demo?key=value 里的参数 */
export function routeParam(key: string): string | null {
  const query = location.hash.split('?')[1] ?? '';
  return new URLSearchParams(query).get(key);
}
