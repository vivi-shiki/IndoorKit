import { describe, expect, it } from 'vitest';
import { floorPlugin, heatmapPlugin } from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

const MIN = 60_000;

async function open() {
  const opened = await openMap([floorPlugin, heatmapPlugin({ cellMeters: 2 })]);
  return { ...opened, heat: opened.map.plugins.heatmap };
}

describe('heatmapPlugin', () => {
  it('counts only samples inside the time window', async () => {
    const { heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0])]));
    heat.add(batch(10 * MIN, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0.0001, 0])]));
    heat.setWindow(5);
    expect(heat.window()).toBe(5);
    expect(heat.pointCount()).toBe(2);
    heat.setWindow(15);
    expect(heat.pointCount()).toBe(3);
  });

  it('shows only the current floor and updates when the floor changes', async () => {
    const { map, fake, heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level2, [0, 0]), tag('c', IDS.level2, [0, 0])]));
    const levels = () => featureCollection(fake, 'indoor-heat').features.map((f) => f.properties!.level_id);
    expect(new Set(levels())).toEqual(new Set([IDS.level1]));
    expect(heat.pointCount()).toBe(1);
    map.plugins.floor.set('2F');
    expect(new Set(levels())).toEqual(new Set([IDS.level2]));
    expect(heat.pointCount()).toBe(2);
  });

  it('aggregates samples into weighted grid cells', async () => {
    const { fake, heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0.000001, 0])]));
    const cells = featureCollection(fake, 'indoor-heat').features;
    expect(cells).toHaveLength(1);
    expect(cells[0]!.properties!.weight).toBe(2);
  });

  it('collects batches broadcast on the map', async () => {
    const { map, heat } = await open();
    map.events.emit('positions:update', batch(0, [tag('a', IDS.level1, [0, 0])]));
    expect(heat.pointCount()).toBe(1);
  });

  it('keeps memory bounded by dropping minutes older than the largest window', async () => {
    const { heat } = await open();
    for (let m = 0; m < 60; m++) heat.add(batch(m * MIN, [tag('a', IDS.level1, [0, 0])]));
    expect(heat.bucketCount()).toBeLessThanOrEqual(16);
  });

  it('rejects windows other than 1, 5 and 15 minutes', async () => {
    const { heat } = await open();
    expect(() => heat.setWindow(7 as 5)).toThrow(/window/);
  });
});
