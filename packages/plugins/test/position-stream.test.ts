import { createManualProvider } from '@indoorkit/rtls/testing';
import { describe, expect, it } from 'vitest';
import {
  floorPlugin,
  interpolatePosition,
  type PositionStreamOptions,
  positionStreamPlugin,
} from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

async function open(
  options: Pick<PositionStreamOptions, 'staleAfterMs' | 'historyMs' | 'decorate' | 'circleColor'> = {},
) {
  const provider = createManualProvider();
  let now = 0;
  const plugin = positionStreamPlugin({ provider, intervalMs: 1000, clock: () => now, ...options });
  const opened = await openMap([floorPlugin, plugin]);
  const setNow = (t: number) => {
    now = t;
  };
  return { ...opened, provider, setNow, stream: opened.map.plugins['position-stream'] };
}

const rendered = (fake: Awaited<ReturnType<typeof open>>['fake']) =>
  featureCollection(fake, 'indoor-positions').features as GeoJSON.Feature<GeoJSON.Point>[];

describe('interpolatePosition', () => {
  const from = { coord: [0, 0] as [number, number], levelId: 'a', time: 0 };
  const to = { coord: [10, 20] as [number, number], levelId: 'a', time: 1000 };

  it('moves linearly between two samples', () => {
    expect(interpolatePosition(from, to, 500)).toEqual({ coord: [5, 10], levelId: 'a' });
  });

  it('clamps before the start and after the end', () => {
    expect(interpolatePosition(from, to, -100).coord).toEqual([0, 0]);
    expect(interpolatePosition(from, to, 5000).coord).toEqual([10, 20]);
  });

  it('snaps to the new floor instead of sliding across floors', () => {
    expect(interpolatePosition(from, { ...to, levelId: 'b' }, 100)).toEqual({
      coord: [10, 20],
      levelId: 'b',
    });
  });
});

describe('positionStreamPlugin', () => {
  it('starts and stops its provider with the map', async () => {
    const { map, provider } = await open();
    expect(provider.started).toBe(true);
    await map.destroy();
    expect(provider.started).toBe(false);
    expect(provider.disposed).toBe(true);
    expect(provider.listenerCount()).toBe(0);
  });

  it('renders only tags on the current floor', async () => {
    const { map, fake, provider, stream } = await open();
    provider.emit(batch(0, [tag('a', IDS.level1, [0.0001, 0.0001]), tag('b', IDS.level2, [0.0002, 0.0002])]));
    stream.render(0);
    expect(rendered(fake).map((f) => f.properties!.id)).toEqual(['a']);
    map.plugins.floor.set('2F');
    stream.render(0);
    expect(rendered(fake).map((f) => f.properties!.id)).toEqual(['b']);
    expect(stream.count()).toBe(2);
  });

  it('glides from the previous position to the new one over one interval', async () => {
    const { fake, provider, setNow, stream } = await open();
    setNow(0);
    provider.emit(batch(0, [tag('a', IDS.level1, [0, 0])]));
    setNow(1000);
    provider.emit(batch(1000, [tag('a', IDS.level1, [0.001, 0])]));
    stream.render(1500);
    expect(rendered(fake)[0]!.geometry.coordinates[0]).toBeCloseTo(0.0005, 9);
    stream.render(2000);
    expect(rendered(fake)[0]!.geometry.coordinates[0]).toBeCloseTo(0.001, 9);
  });

  it('hides tags that stopped reporting', async () => {
    const { fake, provider, setNow, stream } = await open({ staleAfterMs: 3000 });
    provider.emit(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0, 0])]));
    setNow(4000);
    provider.emit(batch(4000, [tag('a', IDS.level1, [0, 0])]));
    stream.render(4000);
    expect(rendered(fake).map((f) => f.properties!.id)).toEqual(['a']);
  });

  it('broadcasts every batch to other plugins', async () => {
    const { map, provider } = await open();
    const seen: number[] = [];
    map.events.on('positions:update', (b) => seen.push(b.time));
    provider.emit(batch(42, [tag('a', IDS.level1, [0, 0])]));
    expect(seen).toEqual([42]);
  });

  it('keeps only the history window and replays a trail', async () => {
    const { fake, provider, stream } = await open({ historyMs: 2000 });
    for (let t = 0; t <= 5000; t += 1000) provider.emit(batch(t, [tag('a', IDS.level1, [t / 1e6, 0])]));
    expect(stream.history('a').map((h) => h.time)).toEqual([3000, 4000, 5000]);
    stream.replay('a');
    expect(stream.replaying()).toBe('a');
    const trail = featureCollection(fake, 'indoor-trail').features[0]!.geometry as GeoJSON.LineString;
    expect(trail.coordinates).toHaveLength(3);
    stream.clearReplay();
    expect(featureCollection(fake, 'indoor-trail').features).toHaveLength(0);
  });

  it('refuses to replay an unknown tag', async () => {
    const { stream } = await open();
    expect(() => stream.replay('ghost')).toThrow(/unknown tag/);
  });

  it('releases its sources and layers on destroy', async () => {
    const { map, fake } = await open();
    await map.destroy();
    expect(fake.sourceIds()).toEqual([]);
    expect(map.resources.size).toBe(0);
  });

  it('adds caller properties to every rendered tag', async () => {
    const { fake, provider, stream } = await open({
      decorate: (id) => ({ role: id === 'a' ? 'nurse' : 'visitor' }),
    });
    provider.emit(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0, 0])]));
    stream.render(0);
    expect(rendered(fake).map((f) => f.properties!.role)).toEqual(['nurse', 'visitor']);
  });

  it('colours tags with a caller expression', async () => {
    const { fake } = await open({ circleColor: ['match', ['get', 'role'], 'nurse', '#2563eb', '#6b7280'] });
    expect(fake.getPaintProperty('indoor-positions', 'circle-color')).toEqual([
      'match',
      ['get', 'role'],
      'nurse',
      '#2563eb',
      '#6b7280',
    ]);
  });

  it('hides tags rejected by the filter and reports the latest sample of any tag', async () => {
    const { fake, provider, stream } = await open();
    provider.emit(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level2, [1, 1])]));
    stream.setFilter((id) => id !== 'a');
    stream.render(0);
    expect(rendered(fake)).toEqual([]);
    stream.setFilter(null);
    stream.render(0);
    expect(rendered(fake).map((f) => f.properties!.id)).toEqual(['a']);
    expect(stream.latest('b')).toEqual({ coord: [1, 1], levelId: IDS.level2, time: 0 });
    expect(stream.latest('ghost')).toBeNull();
  });
});
