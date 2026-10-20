import { describe, expect, it } from 'vitest';
import { detectStops, floorPlugin, type Sample, trailPlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

const L1 = IDS.level1;
const L2 = IDS.level2;
const s = (time: number, x: number, levelId = L1): Sample => ({ time, coord: [x, 0.0005], levelId });
/** 0.00001° 经度约 1 m */
const SAMPLES: Sample[] = [
  s(0, 0.0001),
  s(1000, 0.0001),
  s(2000, 0.0001),
  s(3000, 0.0003),
  s(4000, 0.0005),
  s(5000, 0.0005, L2),
  s(6000, 0.0005, L2),
  s(7000, 0.0005, L2),
];

describe('detectStops', () => {
  it('finds places where the samples stay within the radius long enough', () => {
    const stops = detectStops(SAMPLES, { radiusMeters: 3, minMs: 2000 });
    expect(stops.map((x) => [x.start, x.end, x.levelId])).toEqual([
      [0, 2000, L1],
      [5000, 7000, L2],
    ]);
    expect(stops[0]!.durationMs).toBe(2000);
    expect(stops[0]!.coord).toEqual([0.0001, 0.0005]);
  });

  it('places the stop where most of it happened, not at the step in from the corridor', () => {
    const stops = detectStops([s(0, 0.0001), s(1000, 0.00012), s(2000, 0.00012), s(3000, 0.00012)], {
      radiusMeters: 3,
      minMs: 2000,
    });
    expect(stops[0]!.coord).toEqual([0.00012, 0.0005]);
  });

  it('treats a floor change as leaving the place', () => {
    const stops = detectStops([s(0, 0.0005), s(1000, 0.0005), s(2000, 0.0005, L2)], {
      radiusMeters: 3,
      minMs: 1500,
    });
    expect(stops).toEqual([]);
    expect(detectStops([], { radiusMeters: 3, minMs: 0 })).toEqual([]);
  });
});

describe('trailPlugin', () => {
  async function open() {
    const opened = await openMap([floorPlugin, trailPlugin({ stopRadiusMeters: 3, stopMinMs: 2000 })]);
    return { ...opened, trail: opened.map.plugins.trail };
  }

  it('draws the part of the trail on the current floor and its stops', async () => {
    const { map, fake, trail } = await open();
    trail.set(SAMPLES);
    const levels = (source: string) =>
      featureCollection(fake, source).features.map((f) => f.properties!.level_id);
    expect(levels('indoor-trail-path')).toEqual([L1]);
    expect(levels('indoor-trail-stops')).toEqual([L1]);
    expect(trail.stops().map((x) => x.start)).toEqual([0, 5000]);
    expect(trail.range()).toEqual([0, 7000]);
    map.plugins.floor.set('2F');
    expect(levels('indoor-trail-path')).toEqual([L2]);
    expect(levels('indoor-trail-stops')).toEqual([L2]);
    expect(fake.getLayoutProperty('indoor-trail-path', 'visibility')).not.toBe('none');
  });

  it('moves the head to the sought time and draws the played part', async () => {
    const { fake, trail } = await open();
    trail.set(SAMPLES);
    trail.seek(3500);
    expect(trail.time()).toBe(3500);
    const head = trail.position()!;
    expect(head.levelId).toBe(L1);
    expect(head.coord[0]).toBeCloseTo(0.0004, 9);
    const played = featureCollection(fake, 'indoor-trail-played')
      .features as GeoJSON.Feature<GeoJSON.LineString>[];
    expect(played.at(-1)!.geometry.coordinates.at(-1)![0]).toBeCloseTo(0.0004, 9);
    trail.seek(6500);
    expect(trail.position()!.levelId).toBe(L2);
    trail.seek(99_999);
    expect(trail.time()).toBe(7000);
  });

  it('clears everything and releases its layers', async () => {
    const { map, fake, trail } = await open();
    trail.set(SAMPLES);
    trail.clear();
    expect(trail.position()).toBeNull();
    expect(featureCollection(fake, 'indoor-trail-path').features).toEqual([]);
    expect(() => trail.seek(0)).toThrow(/no trail/);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
