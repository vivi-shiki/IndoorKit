import { definePlugin, type PositionBatch, type TagPosition } from '@indoorkit/core';
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
  /** 只显示这些分组的样本（分组由 groupOf 决定）；null 显示全部 */
  setGroups(groups: readonly string[] | null): void;
  groups(): readonly string[] | null;
}

/** 网格权重到这个值时颜色和热度到顶 */
const WEIGHT_MAX = 20;
/** Mapbox 热力图示例的色带：从透明的蓝到红，热力图和着色圆点共用 */
const PALETTE = [
  'rgba(33,102,172,0)',
  'rgb(103,169,207)',
  'rgb(209,229,240)',
  'rgb(253,219,199)',
  'rgb(239,138,98)',
  'rgb(178,24,43)',
];
/** 色带均匀铺在 [0, max] 上 */
const ramp = (max: number) => PALETTE.flatMap((color, i) => [(i / (PALETTE.length - 1)) * max, color]);
/** 放大到 POINTS_FROM 开始出现着色圆点，到 HEAT_UNTIL 热力图完全淡出 */
const POINTS_FROM = 19;
const POINTS_FULL = 20;
const HEAT_UNTIL = 21;

interface Cell {
  x: number;
  y: number;
  count: number;
}

/**
 * 人员密度热力图。样本按「分钟 × 楼层 × 网格」累加计数，
 * 内存只与最大窗口的分钟数和网格数有关，与标签数和上报次数无关。
 *
 * 显示按 Mapbox「Create a heatmap layer」示例：缩小时是热力图；放大后网格间距超过光斑半径，
 * 热力图会露出一个个格子中心，所以在 POINTS_FROM～HEAT_UNTIL 之间淡出，
 * 换成按权重着色、带白边的圆点（同一份数据、同一套色带）。
 */
export function heatmapPlugin(options: { cellMeters: number; groupOf?: (p: TagPosition) => string }) {
  return definePlugin({
    name: 'heatmap',
    deps: ['floor'],
    setup(ctx): HeatmapApi {
      const overlay = floorOverlay(ctx, 'indoor-heat', [
        {
          id: 'indoor-heat',
          type: 'heatmap',
          maxzoom: HEAT_UNTIL,
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, WEIGHT_MAX, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 16, 1, HEAT_UNTIL, 3],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...ramp(1)],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 16, 10, 18.5, 25, HEAT_UNTIL, 60],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], POINTS_FROM, 1, HEAT_UNTIL, 0],
          },
        },
        {
          id: 'indoor-heat-point',
          type: 'circle',
          minzoom: POINTS_FROM,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              POINTS_FROM,
              ['interpolate', ['linear'], ['get', 'weight'], 1, 2, WEIGHT_MAX, 7],
              22,
              ['interpolate', ['linear'], ['get', 'weight'], 1, 8, WEIGHT_MAX, 50],
            ],
            'circle-color': ['interpolate', ['linear'], ['get', 'weight'], ...ramp(WEIGHT_MAX)],
            'circle-stroke-color': 'white',
            'circle-stroke-width': 1,
            'circle-opacity': ['interpolate', ['linear'], ['zoom'], POINTS_FROM, 0, POINTS_FULL, 1],
          },
        },
      ]);
      const { toMeters, toLngLat } = localProjection(ctx.venue.center);
      const cell = options.cellMeters;
      /** 分钟 → 楼层 → 分组 → 网格 */
      const buckets = new Map<number, Map<string, Map<string, Map<string, Cell>>>>();
      let latest = 0;
      let selected: readonly string[] | null = null;
      let window: HeatWindow = 5;
      let count = 0;
      let features: Feature[] = [];

      const refresh = () => {
        const levelId = overlay.floor.current().id;
        const merged = new Map<string, Cell>();
        for (const [minute, levels] of buckets) {
          if (minute <= latest - window) continue;
          for (const [group, cells] of levels.get(levelId) ?? []) {
            if (selected && !selected.includes(group)) continue;
            for (const [key, c] of cells) {
              const m = merged.get(key);
              if (m) m.count += c.count;
              else merged.set(key, { ...c });
            }
          }
        }
        count = 0;
        features = [];
        for (const [key, c] of merged) {
          count += c.count;
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: toLngLat([(c.x + 0.5) * cell, (c.y + 0.5) * cell]) },
            properties: { id: key, weight: c.count, level_id: levelId },
          });
        }
        overlay.setData(features);
      };

      const add = (batch: PositionBatch) => {
        const minute = Math.floor(batch.time / MINUTE);
        latest = Math.max(latest, minute);
        const levels = buckets.get(minute) ?? new Map<string, Map<string, Map<string, Cell>>>();
        buckets.set(minute, levels);
        for (const p of batch.positions) {
          const [mx, my] = toMeters(p.coord);
          const x = Math.floor(mx / cell);
          const y = Math.floor(my / cell);
          const groups = levels.get(p.levelId) ?? new Map<string, Map<string, Cell>>();
          levels.set(p.levelId, groups);
          const group = options.groupOf?.(p) ?? '';
          const cells = groups.get(group) ?? new Map<string, Cell>();
          groups.set(group, cells);
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
        setGroups(groups) {
          selected = groups;
          refresh();
        },
        groups: () => selected,
      };
    },
  });
}
