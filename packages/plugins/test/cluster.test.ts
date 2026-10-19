import { describe, expect, it } from 'vitest';
import { clusterIndexed, clusterNaive, clusterPlugin, distanceMeters, floorPlugin } from '../src/index';
import { featureCollection, IDS, openMap, tag } from './helpers';

/** 在 120 m 见方的范围内撒点，可复现 */
function scatter(n: number, seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    coord: [139.9 + rand() * 0.0013, 35.2 + rand() * 0.0011] as [number, number],
  }));
}

describe('cluster algorithms', () => {
  it('return identical clusters for the naive and indexed versions', () => {
    for (const n of [0, 1, 50, 2000]) {
      const points = scatter(n, n + 7);
      expect(clusterIndexed(points, 3)).toEqual(clusterNaive(points, 3));
    }
  });

  it('put every point in exactly one cluster', () => {
    const points = scatter(1500);
    const ids = clusterIndexed(points, 5).flatMap((c) => c.ids);
    expect(ids.sort()).toEqual(points.map((p) => p.id).sort());
  });

  it('keep every member within the radius of its cluster seed', () => {
    const points = scatter(1500);
    const byId = new Map(points.map((p) => [p.id, p.coord]));
    for (const c of clusterIndexed(points, 4)) {
      const seed = byId.get(c.ids[0]!)!;
      for (const id of c.ids) expect(distanceMeters(seed, byId.get(id)!)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('merge points closer than the radius and keep distant points apart', () => {
    const near = [
      { id: 'a', coord: [139.9, 35.2] as [number, number] },
      { id: 'b', coord: [139.90001, 35.2] as [number, number] },
      { id: 'c', coord: [139.901, 35.2] as [number, number] },
    ];
    expect(clusterNaive(near, 3).map((c) => c.ids)).toEqual([['a', 'b'], ['c']]);
  });
});

describe('clusterPlugin', () => {
  it('clusters only points on the current floor and follows floor changes', async () => {
    const { map, fake } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    map.plugins.cluster.setPoints([
      tag('a', IDS.level1, [0.0001, 0.0001]),
      tag('b', IDS.level1, [0.0001, 0.0001]),
      tag('c', IDS.level2, [0.0005, 0.0005]),
    ]);
    const counts = () => featureCollection(fake, 'indoor-clusters').features.map((f) => f.properties!.count);
    expect(counts()).toEqual([2]);
    map.plugins.floor.set('2F');
    expect(counts()).toEqual([1]);
  });

  it('switches algorithm and reports how long the last run took', async () => {
    const { map } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    map.plugins.cluster.setAlgorithm('naive');
    map.plugins.cluster.setPoints([tag('a', IDS.level1, [0, 0])]);
    expect(map.plugins.cluster.algorithm()).toBe('naive');
    expect(map.plugins.cluster.lastDurationMs()).toBeGreaterThanOrEqual(0);
  });

  it('releases its layers on destroy', async () => {
    const { map, fake } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
