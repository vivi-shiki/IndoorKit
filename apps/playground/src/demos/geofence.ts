import type { GeofenceEvent } from '@indoorkit/core';
import {
  floorPlugin,
  geofencePlugin,
  polygonPlugin,
  popupPlugin,
  positionStreamPlugin,
} from '@indoorkit/plugins';
import { i18n } from '../app-i18n';
import { mountMapPage } from '../map-page';
import { createSimProvider, SIM_INTERVAL_MS } from '../sim';

const MAX_ALERTS_SHOWN = 30;

export async function mountGeofenceDemo(root: HTMLElement) {
  const page = await mountMapPage(root, {
    demo: 'geofence',
    readyWhen: 'first-positions',
    title: 'demo.geofence.title',
    controls: `
      <span class="metric"><span data-i18n="metric.alerts"></span>: <b data-testid="alert-count">0</b></span>`,
    overlays: `<ul class="alerts" data-testid="alert-list"></ul>`,
    plugins: (venue) =>
      [
        floorPlugin,
        polygonPlugin,
        popupPlugin,
        geofencePlugin,
        positionStreamPlugin({
          provider: createSimProvider(venue, 2000, 'geofence'),
          intervalMs: SIM_INTERVAL_MS,
        }),
      ] as const,
    floor: '3F',
  });
  const { indoor, venue, hooks } = page;
  const { geofence, popup } = indoor.plugins;

  // 预置围栏：中间那栋楼 3F 的 ICU
  const icus = venue.features.units.features.filter(
    (u) => u.properties.label_en === 'ICU' && u.properties.level_id === indoor.plugins.floor.resolve('3F').id,
  );
  const icu = icus[Math.floor(icus.length / 2)]!;
  geofence.add({
    id: 'icu',
    floor: '3F',
    coordinates: (icu.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][],
    label: i18n.t('fence.icu'),
  });

  let alerts = 0;
  const list = root.querySelector<HTMLUListElement>('[data-testid="alert-list"]')!;
  const countEl = root.querySelector('[data-testid="alert-count"]')!;
  const onEvent = (e: GeofenceEvent) => {
    alerts++;
    countEl.textContent = String(alerts);
    const text = i18n.t(e.type === 'enter' ? 'alert.enter' : 'alert.exit', {
      tag: e.tagId,
      fence: i18n.t('fence.icu'),
    });
    const li = document.createElement('li');
    li.className = e.type;
    li.textContent = text;
    list.prepend(li);
    while (list.children.length > MAX_ALERTS_SHOWN) list.lastElementChild!.remove();
    popup.open({ id: 'alert', coord: e.coord, text });
  };
  indoor.events.on('geofence:enter', onEvent);
  indoor.events.on('geofence:exit', onEvent);

  hooks.fenceIds = () => geofence.list().map((f) => f.id);
  hooks.alertCount = () => alerts;

  return page.unmount;
}
