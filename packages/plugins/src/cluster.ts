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
 * 两个版本共用的贪心规则：按输入顺序，第一个未归类的点作为起点，
 * 与起点距离不超过 radius 的未归类点并入该组。
 */
function finish(points: readonly ClusterPoint[], members: number[]): Cluster {
  let x = 0;
  let y = 0;
  for (const i of members) {
    x += points[i]!.coord[0];
    y += points[i]!.coord[1];
  }
  return { center: [x / members.length, y / members.length], ids: members.map((i) => points[i]!.id) };
}

/** O(n²)：每个起点都与其后所有点逐一比较距离 */
export function clusterNaive(points: readonly ClusterPoint[], radiusMeters: number): Cluster[] {
  const assigned = new Uint8Array(points.length);
  const clusters: Cluster[] = [];
  for (let i = 0; i < points.length; i++) {
    if (assigned[i]) continue;
    assigned[i] = 1;
    const members = [i];
    for (let j = i + 1; j < points.length; j++) {
      if (!assigned[j] && distanceMeters(points[i]!.coord, points[j]!.coord) <= radiusMeters) {
        assigned[j] = 1;
        members.push(j);
      }
    }
    clusters.push(finish(points, members));
  }
  return clusters;
}

/** KDBush 空间索引先取候选，再用与朴素版相同的距离判定，结果与朴素版完全一致 */
export function clusterIndexed(points: readonly ClusterPoint[], radiusMeters: number): Cluster[] {
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
    clusters.push(finish(points, [i, ...near]));
  }
  return clusters;
}

export type ClusterAlgorithm = 'naive' | 'indexed';

export interface ClusterApi {
  setPoints(points: readonly TagPosition[]): void;
  setAlgorithm(algorithm: ClusterAlgorithm): void;
  algorithm(): ClusterAlgorithm;
  /** 当前楼层的聚合结果 */
  clusters(): readonly Cluster[];
  lastDurationMs(): number;
}

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
            'circle-opacity': 0.8,
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 4, 10, 10, 100, 18],
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
      let algorithm: ClusterAlgorithm = 'indexed';
      let result: Cluster[] = [];
      let duration = 0;

      const run = () => {
        const levelId = overlay.floor.current().id;
        const onFloor = points.filter((p) => p.levelId === levelId);
        const started = performance.now();
        result = (algorithm === 'naive' ? clusterNaive : clusterIndexed)(onFloor, options.radiusMeters);
        duration = performance.now() - started;
        overlay.setData(
          result.map((c) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: c.center },
            properties: { id: c.ids[0], count: c.ids.length, level_id: levelId },
          })),
        );
      };
      ctx.on('floor:change', run);

      return {
        setPoints(next) {
          points = next;
          run();
        },
        setAlgorithm(next) {
          algorithm = next;
          run();
        },
        algorithm: () => algorithm,
        clusters: () => result,
        lastDurationMs: () => duration,
      };
    },
  });
}
