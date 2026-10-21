import { describe, expect, it } from 'vitest';
import { floorPlugin, routePlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

const open = async () => {
  const opened = await openMap([floorPlugin, routePlugin()]);
  return { ...opened, route: opened.map.plugins.route };
};

/** 1F 走到换层点，上到 2F 继续走 */
const CROSS_FLOOR = [
  { floor: '1F', coord: [0, 0] as [number, number] },
  { floor: '1F', coord: [0.001, 0] as [number, number] },
  { floor: '2F', coord: [0.001, 0] as [number, number] },
  { floor: '2F', coord: [0.001, 0.001] as [number, number] },
];

describe('routePlugin', () => {
  it('draws the part of the route on the current floor as one line per floor', async () => {
    const { map, fake, route } = await open();
    route.set(CROSS_FLOOR);
    const lines = () => featureCollection(fake, 'indoor-route').features;
    expect(lines().map((f) => (f.geometry as GeoJSON.LineString).coordinates)).toEqual([
      [
        [0, 0],
        [0.001, 0],
      ],
    ]);
    map.plugins.floor.set('2F');
    expect(lines().map((f) => f.properties!.level_id)).toEqual([IDS.level2]);
  });

  it('lists the floors in the order the route passes them', async () => {
    const { route } = await open();
    route.set(CROSS_FLOOR);
    expect(route.levels()).toEqual([IDS.level1, IDS.level2]);
  });

  it('marks the start, the end and where the route changes floor, naming the other floor', async () => {
    const { map, fake, route } = await open();
    route.set(CROSS_FLOOR);
    const points = () =>
      featureCollection(fake, 'indoor-route-points').features.map((f) => [
        f.properties!.kind,
        f.properties!.label,
      ]);
    expect(points()).toEqual([
      ['start', ''],
      ['transition', '↑ 2F'],
    ]);
    map.plugins.floor.set('2F');
    expect(points()).toEqual([
      ['transition', '↓ 1F'],
      ['end', ''],
    ]);
  });

  it('measures the length on the ground and ignores the vertical change', async () => {
    const { route } = await open();
    route.set(CROSS_FLOOR);
    // 0.001° 经度和纬度在赤道附近各约 111 m
    expect(route.length()).toBeGreaterThan(200);
    expect(route.length()).toBeLessThan(240);
  });

  it('rejects a route with fewer than two points or an unknown floor', async () => {
    const { route } = await open();
    expect(() => route.set([CROSS_FLOOR[0]!])).toThrow(/at least two points/);
    expect(() => route.set([{ floor: '9F', coord: [0, 0] }, CROSS_FLOOR[0]!])).toThrow(/unknown floor/);
  });

  it('clears the route and releases its layers', async () => {
    const { map, fake, route } = await open();
    route.set(CROSS_FLOOR);
    route.clear();
    expect(route.levels()).toEqual([]);
    expect(featureCollection(fake, 'indoor-route').features).toEqual([]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
