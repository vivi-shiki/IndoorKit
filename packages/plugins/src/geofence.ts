import { definePlugin } from '@indoorkit/core';
import type { PositionBatch } from '@indoorkit/rtls';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import Flatbush from 'flatbush';
import type { Polygon } from 'geojson';
import type { FloorApi } from './floor';
import type { PolygonInput, ShapeApi } from './shapes';

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  fenceId: string;
  tagId: string;
  time: number;
  /** 触发事件时标签所在位置 */
  coord: [number, number];
}

declare module '@indoorkit/core' {
  interface IndoorEvents {
    'geofence:enter': GeofenceEvent;
    'geofence:exit': GeofenceEvent;
  }
}

export interface Fence {
  id: string;
  levelId: string;
  polygon: Polygon;
  label: string;
}

export interface GeofenceApi {
  /** 围栏同时用 polygon 插件画在地图上 */
  add(input: PolygonInput): string;
  remove(id: string): boolean;
  list(): readonly Fence[];
  /** 检测一批位置，返回本批产生的进入/离开事件 */
  check(batch: PositionBatch): GeofenceEvent[];
  /** 当前在围栏内的标签 */
  inside(fenceId: string): string[];
}

/** 每层一个 Flatbush 索引筛候选围栏，再做点在多边形内判断（边界算在内） */
export const geofencePlugin = definePlugin({
  name: 'geofence',
  deps: ['floor', 'polygon'],
  setup(ctx): GeofenceApi {
    const floor = ctx.get<FloorApi>('floor');
    const polygons = ctx.get<ShapeApi<PolygonInput>>('polygon');
    const fences = new Map<string, Fence>();
    /** 标签 → 所在围栏 */
    const state = new Map<string, Set<string>>();
    let indexes = new Map<string, { index: Flatbush; fences: Fence[] }>();

    const rebuild = () => {
      indexes = new Map();
      const byLevel = new Map<string, Fence[]>();
      for (const f of fences.values()) byLevel.set(f.levelId, [...(byLevel.get(f.levelId) ?? []), f]);
      for (const [levelId, list] of byLevel) {
        const index = new Flatbush(list.length);
        for (const f of list) {
          const xs = f.polygon.coordinates[0]!.map((p) => p[0]!);
          const ys = f.polygon.coordinates[0]!.map((p) => p[1]!);
          index.add(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
        }
        index.finish();
        indexes.set(levelId, { index, fences: list });
      }
    };

    const order = () => [...fences.keys()];

    const check = (batch: PositionBatch) => {
      const events: GeofenceEvent[] = [];
      const rank = order();
      for (const p of batch.positions) {
        const entry = indexes.get(p.levelId);
        const now = new Set<string>();
        if (entry) {
          for (const i of entry.index.search(p.coord[0], p.coord[1], p.coord[0], p.coord[1])) {
            const fence = entry.fences[i]!;
            if (booleanPointInPolygon(p.coord, fence.polygon)) now.add(fence.id);
          }
        }
        const before = state.get(p.id) ?? new Set<string>();
        for (const id of rank) {
          if (now.has(id) && !before.has(id))
            events.push({ type: 'enter', fenceId: id, tagId: p.id, time: batch.time, coord: p.coord });
        }
        for (const id of rank) {
          if (before.has(id) && !now.has(id))
            events.push({ type: 'exit', fenceId: id, tagId: p.id, time: batch.time, coord: p.coord });
        }
        if (now.size > 0) state.set(p.id, now);
        else state.delete(p.id);
      }
      for (const e of events) ctx.events.emit(e.type === 'enter' ? 'geofence:enter' : 'geofence:exit', e);
      return events;
    };
    ctx.on('positions:update', check);

    return {
      add(input) {
        if (fences.has(input.id)) throw new Error(`fence "${input.id}" already exists`);
        const level = input.floor ? floor.resolve(input.floor) : floor.current();
        polygons.add({ ...input, floor: level.id });
        fences.set(input.id, {
          id: input.id,
          levelId: level.id,
          polygon: { type: 'Polygon', coordinates: [input.coordinates] },
          label: input.label ?? '',
        });
        rebuild();
        return input.id;
      },
      remove(id) {
        if (!fences.delete(id)) return false;
        polygons.remove(id);
        for (const [tagId, set] of state) {
          set.delete(id);
          if (set.size === 0) state.delete(tagId);
        }
        rebuild();
        return true;
      },
      list: () => [...fences.values()],
      check,
      inside: (fenceId) =>
        [...state]
          .filter(([, set]) => set.has(fenceId))
          .map(([tagId]) => tagId)
          .sort(),
    };
  },
});
