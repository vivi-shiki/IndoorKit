import { definePlugin, type PositionBatch } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { floorOverlay, localProjection } from './overlay';

export const HEAT_WINDOWS = [1, 5, 15] as const;
export type HeatWindow = (typeof HEAT_WINDOWS)[number];
const MAX_WINDOW = Math.max(...HEAT_WINDOWS);
const MINUTE = 60_000;

export interface HeatmapApi {
  add(batch: PositionBatch): void;
  setWindow(minutes: HeatWindow): void;
  window(): HeatWindow;
  /** 时间窗口内、当前楼层的样本数 */
  pointCount(): number;
  /** 当前画在地图上的网格点（当前楼层、时间窗口内） */
  data(): readonly Feature[];
  /** 内部按分钟保留的桶数，最多为最大窗口的分钟数 */
  bucketCount(): number;
}

interface Cell {
  x: number;
  y: number;
  count: number;
}

/**
 * 人员密度热力图。样本按「分钟 × 楼层 × 网格」累加计数，
 * 内存只与最大窗口的分钟数和网格数有关，与标签数和上报次数无关。
 */
export function heatmapPlugin(options: { cellMeters: number }) {
  return definePlugin({
    name: 'heatmap',
    deps: ['floor'],
    setup(ctx): HeatmapApi {
      const overlay = floorOverlay(ctx, 'indoor-heat', [
        {
          id: 'indoor-heat',
          type: 'heatmap',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 20, 1],
            'heatmap-radius': 25,
            'heatmap-opacity': 0.8,
          },
        },
      ]);
      const { toMeters, toLngLat } = localProjection(ctx.venue.center);
      const cell = options.cellMeters;
      const buckets = new Map<number, Map<string, Map<string, Cell>>>();
      let latest = 0;
      let window: HeatWindow = 5;
      let count = 0;
      let features: Feature[] = [];

      const refresh = () => {
        const levelId = overlay.floor.current().id;
        const merged = new Map<string, Cell>();
        for (const [minute, levels] of buckets) {
          if (minute <= latest - window) continue;
          for (const [key, c] of levels.get(levelId) ?? []) {
            const m = merged.get(key);
            if (m) m.count += c.count;
            else merged.set(key, { ...c });
          }
        }
        count = 0;
        features = [];
        for (const c of merged.values()) {
          count += c.count;
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: toLngLat([(c.x + 0.5) * cell, (c.y + 0.5) * cell]) },
            properties: { weight: c.count, level_id: levelId },
          });
        }
        overlay.setData(features);
      };

      const add = (batch: PositionBatch) => {
        const minute = Math.floor(batch.time / MINUTE);
        latest = Math.max(latest, minute);
        const levels = buckets.get(minute) ?? new Map<string, Map<string, Cell>>();
        buckets.set(minute, levels);
        for (const p of batch.positions) {
          const [mx, my] = toMeters(p.coord);
          const x = Math.floor(mx / cell);
          const y = Math.floor(my / cell);
          const cells = levels.get(p.levelId) ?? new Map<string, Cell>();
          levels.set(p.levelId, cells);
          const key = `${x},${y}`;
          const c = cells.get(key);
          if (c) c.count++;
          else cells.set(key, { x, y, count: 1 });
        }
        for (const m of buckets.keys()) if (m <= latest - MAX_WINDOW) buckets.delete(m);
        refresh();
      };

      ctx.on('positions:update', add);
      ctx.on('floor:change', refresh);

      return {
        add,
        setWindow(minutes) {
          if (!HEAT_WINDOWS.includes(minutes))
            throw new Error(`heatmap window must be one of ${HEAT_WINDOWS.join(', ')}`);
          window = minutes;
          refresh();
        },
        window: () => window,
        pointCount: () => count,
        data: () => features,
        bucketCount: () => buckets.size,
      };
    },
  });
}
