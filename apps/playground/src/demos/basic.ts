import { createIndoorMap, languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import { floorPlugin, markerPlugin } from '@indoorkit/plugins';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { i18n, translate } from '../app-i18n';
import { setHooks } from '../test-hooks';
import { loadVenue } from '../venue';

export async function mountBasicDemo(root: HTMLElement) {
  root.innerHTML = `
    <header class="bar">
      <a href="#/" class="back">← vivi-map</a>
      <h1 data-i18n="demo.basic.title"></h1>
      <span class="metric"><span data-i18n="metric.firstRender"></span>: <b data-testid="first-render">…</b></span>
      <span class="metric"><span data-i18n="metric.markers"></span>: <b data-testid="marker-count">0</b></span>
      <button type="button" class="action" data-action="add-marker" data-i18n="action.addMarker"></button>
    </header>
    <div class="stage">
      <div class="map" id="map"></div>
      <div class="floors" role="group" data-i18n-aria="floor.label"></div>
      <div class="venue-name" data-testid="venue-name"></div>
    </div>`;
  translate(root);
  const hooks = setHooks({ demo: 'basic' });
  const started = performance.now();

  const venue = await loadVenue();
  const indoor = await createIndoorMap({
    container: root.querySelector<HTMLElement>('#map')!,
    venue,
    plugins: [floorPlugin, markerPlugin],
    languages: languageFallbacks(i18n.locale),
  });
  const map = indoor.map as unknown as MapLibreMap;
  const { floor, marker } = indoor.plugins;

  // 地图外的场馆名与地图内的标注随语言一起切换，不重建地图
  const venueNameEl = root.querySelector('.venue-name')!;
  const applyLanguage = () => {
    const languages = languageFallbacks(i18n.locale);
    venueNameEl.textContent = pickLabel(venue.name, languages) ?? '';
    if (indoor.languages[0] !== languages[0]) indoor.setLanguages(languages);
  };
  applyLanguage();
  const unsubscribe = i18n.subscribe(applyLanguage);

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
    marker.add({ id: `marker-${added}`, coord: [lng + offset, lat], label: `#${added}` });
  });

  map.once('idle', () => {
    root.querySelector('[data-testid="first-render"]')!.textContent =
      `${Math.round(performance.now() - started)} ms`;
    hooks.ready = true;
  });

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

  return () => {
    unsubscribe();
    return indoor.destroy();
  };
}
