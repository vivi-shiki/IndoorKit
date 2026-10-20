import { definePlugin, type ScreenPoint } from '@indoorkit/core';
import type { TagPosition } from '@indoorkit/rtls';
import { floorOverlay } from './overlay';
import { createVenueIndex } from './venue-index';

export interface UnitGroup {
  unitId: string;
  levelId: string;
  /** 区块中心，聚合点画在这里 */
  center: [number, number];
  ids: string[];
  /** 状态 → 数量 */
  statuses: Record<string, number>;
  /** 按 statusOrder 最靠前（最严重）的状态；没有状态时为 null */
  worst: string | null;
}

export interface PlacedPosition extends TagPosition {
  unitId: string;
}

export interface UnitClusterApi {
  /** 当前楼层、通过筛选的分组，按区块在场馆数据里的顺序 */
  groups(): readonly UnitGroup[];
  /** 只统计通过筛选的标签；null 取消筛选 */
  setFilter(filter: ((p: PlacedPosition) => boolean) | null): void;
  /** 某个区块里通过筛选的标签（任何楼层） */
  members(unitId: string): PlacedPosition[];
  /** 标签最近一次上报的位置；不在任何区块里或从未上报时为 null */
  position(id: string): PlacedPosition | null;
  /** 最近一次上报里不在任何区块内的标签 */
  unplaced(): string[];
  /** 像素 point 周围 radius 以内画出的聚合点或单个标签所在的区块；没有时为 null */
  pick(point: ScreenPoint, radius: number): string | null;
  /** 当前画在地图上的区块（聚合点或单个标签所在），去重 */
  rendered(): string[];
}

export interface UnitClusterOptions {
  /** 状态从严重到轻微的顺序，决定聚合点的颜色 */
  statusOrder: readonly string[];
  /** 状态 → 颜色；未列出的状态（和没有状态的标签）用灰色 */
  statusColors: Record<string, string>;
  /** 从这个缩放级别起显示单个标签而不是聚合点 */
  pointsFromZoom?: number;
}

const GRAY = '#6b7280';
const LAYERS = ['indoor-unit-clusters', 'indoor-unit-points'];

/** 按区块聚合：同一个房间里的标签合成一个点，数字是数量，颜色是最严重的状态 */
export function unitClusterPlugin(options: UnitClusterOptions) {
  const colors = options.statusColors;
  const colorMatch = (property: string) =>
    [
      'match',
      ['coalesce', ['get', property], ''],
      ...Object.entries(colors).flat(),
      GRAY,
    ] as unknown as string;
  const zoom = options.pointsFromZoom ?? 20.5;
  const rank = (status: string) => {
    const i = options.statusOrder.indexOf(status);
    return i < 0 ? options.statusOrder.length : i;
  };

  return definePlugin({
    name: 'unit-cluster',
    deps: ['floor'],
    setup(ctx): UnitClusterApi {
      const index = createVenueIndex(ctx.venue);
      const unitOrder = new Map(ctx.venue.features.units.features.map((u, i) => [u.properties.id, i]));
      const clusters = floorOverlay(ctx, 'indoor-unit-clusters', [
        {
          id: 'indoor-unit-clusters',
          type: 'circle',
          maxzoom: zoom,
          paint: {
            'circle-color': '#ffffff',
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 9, 10, 14, 50, 20],
            'circle-stroke-color': colorMatch('worst'),
            'circle-stroke-width': 4,
          },
        },
        {
          id: 'indoor-unit-cluster-counts',
          type: 'symbol',
          maxzoom: zoom,
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 12,
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#111827' },
        },
      ]);
      const points = floorOverlay(ctx, 'indoor-unit-points', [
        {
          id: 'indoor-unit-points',
          type: 'circle',
          minzoom: zoom,
          paint: {
            'circle-radius': 5,
            'circle-color': colorMatch('status'),
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        },
      ]);

      let latest = new Map<string, PlacedPosition>();
      let unplaced: string[] = [];
      let filter: ((p: PlacedPosition) => boolean) | null = null;
      let groups: UnitGroup[] = [];

      const run = () => {
        const levelId = clusters.floor.current().id;
        const byUnit = new Map<string, PlacedPosition[]>();
        for (const p of latest.values()) {
          if (p.levelId !== levelId || (filter && !filter(p))) continue;
          byUnit.set(p.unitId, [...(byUnit.get(p.unitId) ?? []), p]);
        }
        groups = [...byUnit]
          .sort(([a], [b]) => unitOrder.get(a)! - unitOrder.get(b)!)
          .map(([unitId, members]) => {
            const statuses: Record<string, number> = {};
            for (const m of members) if (m.status) statuses[m.status] = (statuses[m.status] ?? 0) + 1;
            const worst = Object.keys(statuses).sort((a, b) => rank(a) - rank(b))[0] ?? null;
            return {
              unitId,
              levelId,
              center: index.unit(unitId).center,
              ids: members.map((m) => m.id),
              statuses,
              worst,
            };
          });
        clusters.setData(
          groups.map((g) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: g.center },
            properties: {
              id: g.unitId,
              unit_id: g.unitId,
              count: g.ids.length,
              worst: g.worst ?? '',
              level_id: levelId,
            },
          })),
        );
        points.setData(
          groups.flatMap((g) =>
            g.ids.map((id) => {
              const p = latest.get(id)!;
              return {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: p.coord },
                properties: { id, status: p.status ?? '', unit_id: g.unitId, level_id: levelId },
              };
            }),
          ),
        );
      };

      ctx.on('positions:update', (batch) => {
        const next = new Map(latest);
        unplaced = [];
        for (const p of batch.positions) {
          const where = index.locate(p.levelId, p.coord);
          if (!where) {
            next.delete(p.id);
            unplaced.push(p.id);
            continue;
          }
          next.set(p.id, { ...p, unitId: where.unitId });
        }
        latest = next;
        run();
      });
      ctx.on('floor:change', run);

      return {
        groups: () => groups,
        setFilter(next) {
          filter = next;
          run();
        },
        members: (unitId) =>
          [...latest.values()].filter((p) => p.unitId === unitId && (!filter || filter(p))),
        position: (id) => latest.get(id) ?? null,
        unplaced: () => unplaced,
        pick(point, radius) {
          const hit = ctx.queryRendered(LAYERS, { point, radius })[0];
          return hit ? String(hit.properties.unit_id) : null;
        },
        rendered: () => [...new Set(ctx.queryRendered(LAYERS).map((f) => String(f.properties.unit_id)))],
      };
    },
  });
}
