import { definePlugin, type ScreenPoint, themes } from '@indoorkit/core';
import type { Feature, Point } from 'geojson';
import { floorOverlay } from './overlay';

export interface MarkerInput {
  id: string;
  coord: [number, number];
  /** 楼层 id 或简称；省略时使用当前楼层 */
  floor?: string;
  label?: string;
  /** 圆点颜色，默认红色 */
  color?: string;
}

export interface MarkerApi {
  /** Replace one complete dataset in one source update; invalid input leaves the previous data intact. */
  replaceAll(markers: readonly MarkerInput[]): void;
  setVisible(visible: boolean): void;
  pick(point: ScreenPoint, radius?: number): string | null;
  rendered(): string[];
  add(marker: MarkerInput): string;
  /** 改标记的文字、颜色或位置（同一楼层内） */
  update(id: string, patch: Partial<Pick<MarkerInput, 'label' | 'color' | 'coord'>>): void;
  remove(id: string): boolean;
  clear(): void;
  count(): number;
}

const DEFAULT_COLOR = '#e5484d';

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
          'circle-color': ['get', 'color'],
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
    const feature = ({ id, coord, floor: ref, label, color }: MarkerInput): Feature<Point> => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties: {
        id,
        level_id: (ref ? overlay.floor.resolve(ref) : overlay.floor.current()).id,
        label: label ?? '',
        color: color ?? DEFAULT_COLOR,
      },
    });
    ctx.on('theme:change', ({ name }) => {
      const theme = themes[name === 'dark' ? 'dark' : 'light'];
      ctx.map.setPaintProperty('indoor-marker-labels', 'text-color', theme.label);
      ctx.map.setPaintProperty('indoor-marker-labels', 'text-halo-color', theme.labelHalo);
    });

    const sync = () => {
      overlay.setData([...markers.values()]);
      ctx.events.emit('marker:change', { count: markers.size });
    };

    return {
      replaceAll(items) {
        const next = new Map<string, Feature<Point>>();
        for (const item of items) {
          if (next.has(item.id)) throw new Error(`marker "${item.id}" already exists`);
          next.set(item.id, feature(item));
        }
        markers.clear();
        for (const [id, item] of next) markers.set(id, item);
        sync();
      },
      setVisible(visible) {
        for (const id of ['indoor-markers', 'indoor-marker-labels'])
          ctx.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      },
      pick(point, radius = 12) {
        const hits = ctx.queryRendered(['indoor-markers'], { point, radius }).map((feature) => {
          const at = ctx.map.project((feature.geometry as Point).coordinates as [number, number]);
          return { id: String(feature.properties.id), distance: Math.hypot(at.x - point.x, at.y - point.y) };
        });
        hits.sort((a, b) => a.distance - b.distance);
        return hits[0]?.id ?? null;
      },
      rendered: () => [...new Set(ctx.queryRendered(['indoor-markers']).map((f) => String(f.properties.id)))],
      add(input) {
        const { id } = input;
        if (markers.has(id)) throw new Error(`marker "${id}" already exists`);
        markers.set(id, feature(input));
        sync();
        return id;
      },
      update(id, patch) {
        const marker = markers.get(id);
        if (!marker) throw new Error(`unknown marker "${id}"`);
        if (patch.coord) marker.geometry = { type: 'Point', coordinates: patch.coord };
        if (patch.label !== undefined) marker.properties!.label = patch.label;
        if (patch.color !== undefined) marker.properties!.color = patch.color;
        sync();
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
