import { definePlugin } from '@indoorkit/core';
import type { Feature, Point } from 'geojson';
import { floorOverlay } from './overlay';

export interface MarkerInput {
  id: string;
  coord: [number, number];
  /** 楼层 id 或简称；省略时使用当前楼层 */
  floor?: string;
  label?: string;
}

export interface MarkerApi {
  add(marker: MarkerInput): string;
  remove(id: string): boolean;
  clear(): void;
  count(): number;
}

export const markerPlugin = definePlugin({
  name: 'marker',
  deps: ['floor'],
  setup(ctx): MarkerApi {
    const overlay = floorOverlay(ctx, 'indoor-markers', [
      {
        id: 'indoor-markers',
        type: 'circle',
        paint: {
          'circle-radius': 8,
          'circle-color': '#e5484d',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      },
      {
        id: 'indoor-marker-labels',
        type: 'symbol',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
        },
        paint: { 'text-color': '#2f3a48', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 },
      },
    ]);
    const markers = new Map<string, Feature<Point>>();

    const sync = () => {
      overlay.setData([...markers.values()]);
      ctx.events.emit('marker:change', { count: markers.size });
    };

    return {
      add({ id, coord, floor: ref, label }) {
        if (markers.has(id)) throw new Error(`marker "${id}" already exists`);
        const level = ref ? overlay.floor.resolve(ref) : overlay.floor.current();
        markers.set(id, {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: coord },
          properties: { id, level_id: level.id, label: label ?? '' },
        });
        sync();
        return id;
      },
      remove(id) {
        const removed = markers.delete(id);
        if (removed) sync();
        return removed;
      },
      clear() {
        markers.clear();
        sync();
      },
      count: () => markers.size,
    };
  },
});
