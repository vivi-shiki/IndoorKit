import { describe, expect, it } from 'vitest';
import { floorPlugin, unitClusterPlugin } from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

const ROOM: [number, number] = [0.0005, 0.0005];
const HALL: [number, number] = [0.0015, 0.0005];
const STATUS_ORDER = ['offline', 'maintenance', 'running', 'idle'];
const withStatus = (id: string, levelId: string, coord: [number, number], status: string) => ({
  ...tag(id, levelId, coord),
  status,
});

async function open() {
  const opened = await openMap([floorPlugin, unitClusterPlugin({ statusOrder: STATUS_ORDER })]);
  return { ...opened, clusters: opened.map.plugins['unit-cluster'] };
}

describe('unitClusterPlugin', () => {
  it('groups positions by the unit they stand in, at the unit centre', async () => {
    const { map, fake, clusters } = await open();
    map.events.emit(
      'positions:update',
      batch(0, [
        withStatus('a', IDS.level1, [0.0002, 0.0002], 'running'),
        withStatus('b', IDS.level1, [0.0008, 0.0007], 'idle'),
        withStatus('c', IDS.level1, HALL, 'running'),
      ]),
    );
    const groups = clusters.groups();
    expect(groups.map((g) => [g.unitId, g.ids])).toEqual([
      [IDS.room, ['a', 'b']],
      [IDS.hall, ['c']],
    ]);
    expect(groups[0]!.center[0]).toBeCloseTo(0.0005, 9);
    expect(groups[0]!.statuses).toEqual({ running: 1, idle: 1 });
    const features = featureCollection(fake, 'indoor-unit-clusters').features;
    expect(features.map((f) => f.properties!.count)).toEqual([2, 1]);
  });

  it('marks each group with its worst status', async () => {
    const { map, fake, clusters } = await open();
    map.events.emit(
      'positions:update',
      batch(0, [
        withStatus('a', IDS.level1, ROOM, 'running'),
        withStatus('b', IDS.level1, ROOM, 'offline'),
        withStatus('c', IDS.level1, HALL, 'idle'),
      ]),
    );
    expect(clusters.groups().map((g) => g.worst)).toEqual(['offline', 'idle']);
    expect(featureCollection(fake, 'indoor-unit-clusters').features.map((f) => f.properties!.worst)).toEqual([
      'offline',
      'idle',
    ]);
  });

  it('shows only the current floor and follows floor changes', async () => {
    const { map, clusters } = await open();
    map.events.emit(
      'positions:update',
      batch(0, [withStatus('a', IDS.level1, ROOM, 'running'), withStatus('b', IDS.level2, ROOM, 'running')]),
    );
    expect(clusters.groups().map((g) => g.ids)).toEqual([['a']]);
    map.plugins.floor.set('2F');
    // 2F 没有区块，b 不在任何区块里
    expect(clusters.groups()).toEqual([]);
    expect(clusters.unplaced()).toEqual(['b']);
  });

  it('filters members and keeps the latest position of every id', async () => {
    const { map, clusters } = await open();
    map.events.emit(
      'positions:update',
      batch(0, [withStatus('a', IDS.level1, ROOM, 'running'), withStatus('b', IDS.level1, ROOM, 'idle')]),
    );
    clusters.setFilter((p) => p.status === 'idle');
    expect(clusters.groups().map((g) => g.ids)).toEqual([['b']]);
    clusters.setFilter(null);
    expect(clusters.groups()[0]!.ids).toEqual(['a', 'b']);
    expect(clusters.position('a')).toMatchObject({ unitId: IDS.room, status: 'running' });
    expect(clusters.members(IDS.room).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('draws single points for close zoom levels and releases its layers', async () => {
    const { map, fake } = await open();
    map.events.emit('positions:update', batch(0, [withStatus('a', IDS.level1, ROOM, 'running')]));
    expect(featureCollection(fake, 'indoor-unit-points').features.map((f) => f.properties!.status)).toEqual([
      'running',
    ]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
