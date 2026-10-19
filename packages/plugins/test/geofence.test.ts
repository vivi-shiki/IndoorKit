import { describe, expect, it } from 'vitest';
import { floorPlugin, type GeofenceEvent, geofencePlugin, polygonPlugin } from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

async function open() {
  const opened = await openMap([floorPlugin, polygonPlugin, geofencePlugin]);
  const events: GeofenceEvent[] = [];
  opened.map.events.on('geofence:enter', (e) => events.push(e));
  opened.map.events.on('geofence:exit', (e) => events.push(e));
  return { ...opened, events, fence: opened.map.plugins.geofence };
}

const summary = (events: GeofenceEvent[]) => events.map((e) => `${e.type}:${e.fenceId}:${e.tagId}`);

describe('geofencePlugin', () => {
  it('reports enter once, nothing while inside, then exit', async () => {
    const { fence, events } = await open();
    fence.add({ id: 'icu', floor: '1F', coordinates: square(0, 0, 0.001, 0.001) });
    fence.check(batch(0, [tag('t', IDS.level1, [0.002, 0.002])]));
    fence.check(batch(1, [tag('t', IDS.level1, [0.0005, 0.0005])]));
    fence.check(batch(2, [tag('t', IDS.level1, [0.0006, 0.0005])]));
    fence.check(batch(3, [tag('t', IDS.level1, [0.002, 0.002])]));
    expect(summary(events)).toEqual(['enter:icu:t', 'exit:icu:t']);
    expect(events[0]!.time).toBe(1);
  });

  it('counts a point on the boundary as inside', async () => {
    const { fence, events } = await open();
    fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 0.001, 0.001) });
    fence.check(batch(0, [tag('t', IDS.level1, [0.001, 0.0005])]));
    expect(summary(events)).toEqual(['enter:f:t']);
  });

  it('handles nested fences independently', async () => {
    const { fence, events } = await open();
    fence.add({ id: 'outer', floor: '1F', coordinates: square(0, 0, 0.002, 0.002) });
    fence.add({ id: 'inner', floor: '1F', coordinates: square(0.0005, 0.0005, 0.001, 0.001) });
    fence.check(batch(0, [tag('t', IDS.level1, [0.0007, 0.0007])]));
    fence.check(batch(1, [tag('t', IDS.level1, [0.0015, 0.0015])]));
    expect(summary(events)).toEqual(['enter:outer:t', 'enter:inner:t', 'exit:inner:t']);
    expect(fence.inside('outer')).toEqual(['t']);
  });

  it('treats a move to another floor as leaving the fence', async () => {
    const { fence, events } = await open();
    fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 0.001, 0.001) });
    fence.check(batch(0, [tag('t', IDS.level1, [0.0005, 0.0005])]));
    fence.check(batch(1, [tag('t', IDS.level2, [0.0005, 0.0005])]));
    expect(summary(events)).toEqual(['enter:f:t', 'exit:f:t']);
  });

  it('checks every position batch broadcast on the map', async () => {
    const { map, fence, events } = await open();
    fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 0.001, 0.001) });
    map.events.emit('positions:update', batch(0, [tag('t', IDS.level1, [0.0005, 0.0005])]));
    expect(summary(events)).toEqual(['enter:f:t']);
  });

  it('draws fences with the polygon plugin and removes them', async () => {
    const { fence, fake } = await open();
    fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 0.001, 0.001), label: 'ICU' });
    expect(featureCollection(fake, 'indoor-polygons').features.map((f) => f.properties!.id)).toEqual(['f']);
    expect(fence.list().map((f) => f.id)).toEqual(['f']);
    fence.remove('f');
    expect(featureCollection(fake, 'indoor-polygons').features).toHaveLength(0);
    expect(fence.list()).toEqual([]);
  });

  it('rejects duplicate fences, unknown floors and open rings', async () => {
    const { fence } = await open();
    fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 1, 1) });
    expect(() => fence.add({ id: 'f', floor: '1F', coordinates: square(0, 0, 1, 1) })).toThrow(
      /already exists/,
    );
    expect(() => fence.add({ id: 'g', floor: '9F', coordinates: square(0, 0, 1, 1) })).toThrow(
      /unknown floor/,
    );
    expect(() =>
      fence.add({
        id: 'h',
        floor: '1F',
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      }),
    ).toThrow(/closed ring/);
  });
});
