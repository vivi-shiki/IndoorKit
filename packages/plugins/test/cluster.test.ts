import { describe, expect, it } from 'vitest';
import * as plugins from '../src/index';
import { clusterPlugin, clusterPoints, distanceMeters, floorPlugin } from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

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

describe('clusterPoints', () => {
  it('puts every point in exactly one cluster', () => {
    const points = scatter(1500);
    const ids = clusterPoints(points, 5).flatMap((c) => c.ids);
    expect(ids.sort()).toEqual(points.map((p) => p.id).sort());
  });

  it('keeps every member within the radius of its cluster seed', () => {
    const points = scatter(1500);
    const byId = new Map(points.map((p) => [p.id, p.coord]));
    for (const c of clusterPoints(points, 4)) {
      const seed = byId.get(c.ids[0]!)!;
      for (const id of c.ids) expect(distanceMeters(seed, byId.get(id)!)).toBeLessThanOrEqual(4 + 1e-9);
    }
  });

  it('merges points closer than the radius and keeps distant points apart', () => {
    const near = [
      { id: 'a', coord: [139.9, 35.2] as [number, number] },
      { id: 'b', coord: [139.90001, 35.2] as [number, number] },
      { id: 'c', coord: [139.901, 35.2] as [number, number] },
    ];
    expect(clusterPoints(near, 3).map((c) => c.ids)).toEqual([['a', 'b'], ['c']]);
    expect(clusterPoints([], 3)).toEqual([]);
  });

  it('no longer ships the naive comparison algorithm', () => {
    expect('clusterNaive' in plugins).toBe(false);
    expect('clusterIndexed' in plugins).toBe(false);
  });
});

describe('clusterPlugin', () => {
  it('clusters live positions on the current floor and follows floor changes', async () => {
    const { map, fake } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    map.events.emit(
      'positions:update',
      batch(0, [
        tag('a', IDS.level1, [0.0001, 0.0001]),
        tag('b', IDS.level1, [0.0001, 0.0001]),
        tag('c', IDS.level2, [0.0005, 0.0005]),
      ]),
    );
    const counts = () => featureCollection(fake, 'indoor-clusters').features.map((f) => f.properties!.count);
    expect(counts()).toEqual([2]);
    expect(map.plugins.cluster.clusters()).toHaveLength(1);
    map.plugins.floor.set('2F');
    expect(counts()).toEqual([1]);
  });

  it('has no algorithm switch or timing API', async () => {
    const { map } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    expect(Object.keys(map.plugins.cluster).sort()).toEqual(['clusters', 'setPoints']);
  });

  it('releases its layers on destroy', async () => {
    const { map, fake } = await openMap([floorPlugin, clusterPlugin({ radiusMeters: 3 })]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
