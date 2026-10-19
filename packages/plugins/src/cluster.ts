import { definePlugin, type TagPosition } from '@indoorkit/core';
import KDBush from 'kdbush';
import { distanceMeters, floorOverlay, localProjection } from './overlay';

export interface ClusterPoint {
  id: string;
  coord: [number, number];
}

export interface Cluster {
  center: [number, number];
  /** 第一个是聚合的起点，其余按输入顺序 */
  ids: string[];
}

/**
 * 贪心聚合：按输入顺序，第一个未归类的点作为起点，与起点距离不超过 radius 的未归类点并入该组。
 * 用 KDBush 空间索引取候选，再按真实距离判定。
 */
export function clusterPoints(points: readonly ClusterPoint[], radiusMeters: number): Cluster[] {
  if (points.length === 0) return [];
  const { toMeters } = localProjection(points[0]!.coord);
  const index = new KDBush(points.length);
  const xy = points.map((p) => toMeters(p.coord));
  for (const [x, y] of xy) index.add(x, y);
  index.finish();

  // 候选半径稍放大，抵消局部投影与逐点距离计算的微小差异
  const search = radiusMeters * 1.05 + 0.01;
  const assigned = new Uint8Array(points.length);
  const clusters: Cluster[] = [];
  for (let i = 0; i < points.length; i++) {
    if (assigned[i]) continue;
    assigned[i] = 1;
    const [x, y] = xy[i]!;
    const near = index
      .within(x, y, search)
      .filter((j) => !assigned[j] && distanceMeters(points[i]!.coord, points[j]!.coord) <= radiusMeters)
      .sort((a, b) => a - b);
    for (const j of near) assigned[j] = 1;
    const members = [i, ...near];
    let cx = 0;
    let cy = 0;
    for (const m of members) {
      cx += points[m]!.coord[0];
      cy += points[m]!.coord[1];
    }
    clusters.push({
      center: [cx / members.length, cy / members.length],
      ids: members.map((m) => points[m]!.id),
    });
  }
  return clusters;
}

export interface ClusterApi {
  /** 手动给一批点；地图上广播的位置（positions:update）会自动接入 */
  setPoints(points: readonly TagPosition[]): void;
  /** 当前楼层的聚合结果 */
  clusters(): readonly Cluster[];
}

/** 把位置聚合成带数量的点，只显示当前楼层 */
export function clusterPlugin(options: { radiusMeters: number }) {
  return definePlugin({
    name: 'cluster',
    deps: ['floor'],
    setup(ctx): ClusterApi {
      const overlay = floorOverlay(ctx, 'indoor-clusters', [
        {
          id: 'indoor-clusters',
          type: 'circle',
          paint: {
            'circle-color': '#7c3aed',
            'circle-opacity': 0.85,
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 10, 12, 100, 20],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        },
        {
          id: 'indoor-cluster-counts',
          type: 'symbol',
          layout: {
            'text-field': ['to-string', ['get', 'count']],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
          },
          paint: { 'text-color': '#ffffff' },
        },
      ]);
      let points: readonly TagPosition[] = [];
      let result: Cluster[] = [];

      const run = () => {
        const levelId = overlay.floor.current().id;
        result = clusterPoints(
          points.filter((p) => p.levelId === levelId),
          options.radiusMeters,
        );
        overlay.setData(
          result.map((c) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: c.center },
            properties: { id: c.ids[0], count: c.ids.length, level_id: levelId },
          })),
        );
      };
      const setPoints = (next: readonly TagPosition[]) => {
        points = next;
        run();
      };
      ctx.on('floor:change', run);
      ctx.on('positions:update', (batch) => setPoints(batch.positions));

      return { setPoints, clusters: () => result };
    },
  });
}
