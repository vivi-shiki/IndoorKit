import { definePlugin } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { floorOverlay } from './overlay';

type Coord = [number, number];

export interface PolygonInput {
  id: string;
  /** 闭合环：至少 4 个点，首尾相同 */
  coordinates: Coord[];
  /** 楼层 id 或简称；省略时使用当前楼层 */
  floor?: string;
  label?: string;
  color?: string;
}

export interface LineInput {
  id: string;
  coordinates: Coord[];
  floor?: string;
  color?: string;
}

export interface ShapeApi<I> {
  add(input: I): string;
  remove(id: string): boolean;
  count(): number;
}

function sameCoord(a: Coord | undefined, b: Coord | undefined) {
  return a !== undefined && b !== undefined && a[0] === b[0] && a[1] === b[1];
}

export const polygonPlugin = definePlugin({
  name: 'polygon',
  deps: ['floor'],
  setup(ctx): ShapeApi<PolygonInput> {
    const overlay = floorOverlay(ctx, 'indoor-polygons', [
      {
        id: 'indoor-polygons',
        type: 'fill',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.25 },
      },
      {
        id: 'indoor-polygon-outlines',
        type: 'line',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      },
    ]);
    const shapes = new Map<string, Feature>();
    const sync = () => overlay.setData([...shapes.values()]);
    return {
      add({ id, coordinates, floor, label, color }) {
        if (shapes.has(id)) throw new Error(`polygon "${id}" already exists`);
        if (coordinates.length < 4 || !sameCoord(coordinates[0], coordinates.at(-1))) {
          throw new Error(`polygon "${id}" must be a closed ring of at least 4 points`);
        }
        const level = floor ? overlay.floor.resolve(floor) : overlay.floor.current();
        shapes.set(id, {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [coordinates] },
          properties: { id, level_id: level.id, label: label ?? '', color: color ?? '#ef4444' },
        });
        sync();
        return id;
      },
      remove(id) {
        const removed = shapes.delete(id);
        if (removed) sync();
        return removed;
      },
      count: () => shapes.size,
    };
  },
});

export const linePlugin = definePlugin({
  name: 'line',
  deps: ['floor'],
  setup(ctx): ShapeApi<LineInput> {
    const overlay = floorOverlay(ctx, 'indoor-lines', [
      { id: 'indoor-lines', type: 'line', paint: { 'line-color': ['get', 'color'], 'line-width': 3 } },
    ]);
    const lines = new Map<string, Feature>();
    const sync = () => overlay.setData([...lines.values()]);
    return {
      add({ id, coordinates, floor, color }) {
        if (lines.has(id)) throw new Error(`line "${id}" already exists`);
        if (coordinates.length < 2) throw new Error(`line "${id}" needs at least two points`);
        const level = floor ? overlay.floor.resolve(floor) : overlay.floor.current();
        lines.set(id, {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates },
          properties: { id, level_id: level.id, color: color ?? '#0ea5e9' },
        });
        sync();
        return id;
      },
      remove(id) {
        const removed = lines.delete(id);
        if (removed) sync();
        return removed;
      },
      count: () => lines.size,
    };
  },
});
