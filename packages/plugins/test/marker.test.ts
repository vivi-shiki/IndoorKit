import { createIndoorMap } from '@indoorkit/core';
import { type FakeMap, fakeMapFactory } from '@indoorkit/core/testing';
import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../imdf/test/fixture';
import { floorPlugin, markerPlugin } from '../src/index';

async function open() {
  let fake!: FakeMap;
  const map = await createIndoorMap({
    container: 'map',
    venue: buildVenueModel(makeArchive()),
    mapFactory: fakeMapFactory((m) => {
      fake = m;
    }),
    plugins: [markerPlugin, floorPlugin],
  });
  return { map, fake };
}

const markerData = (fake: FakeMap) =>
  fake.getSourceData('indoor-markers') as GeoJSON.FeatureCollection<GeoJSON.Point>;

describe('markerPlugin', () => {
  it('adds a marker to the marker source', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'wheelchair-1', floor: '1F', coord: [0.0005, 0.0005], label: '車椅子' });
    const data = markerData(fake);
    expect(data.features).toHaveLength(1);
    expect(data.features[0]!.properties).toMatchObject({
      id: 'wheelchair-1',
      level_id: IDS.level1,
      label: '車椅子',
    });
    expect(map.plugins.marker.count()).toBe(1);
  });

  it('shows only markers on the current floor', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', floor: '1F', coord: [0, 0] });
    map.plugins.marker.add({ id: 'b', floor: '2F', coord: [0, 0] });
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['a']);
    map.plugins.floor.set('2F');
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['b']);
  });

  it('defaults to the current floor when none is given', async () => {
    const { map, fake } = await open();
    map.plugins.floor.set('2F');
    map.plugins.marker.add({ id: 'm', coord: [0, 0] });
    expect(markerData(fake).features[0]!.properties!.level_id).toBe(IDS.level2);
  });

  it('rejects duplicate ids and unknown floors', async () => {
    const { map } = await open();
    map.plugins.marker.add({ id: 'm', coord: [0, 0] });
    expect(() => map.plugins.marker.add({ id: 'm', coord: [0, 0] })).toThrow(/already exists/);
    expect(() => map.plugins.marker.add({ id: 'n', floor: '9F', coord: [0, 0] })).toThrow(/unknown floor/);
  });

  it('removes and clears markers', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', coord: [0, 0] });
    map.plugins.marker.add({ id: 'b', coord: [0, 0] });
    expect(map.plugins.marker.remove('a')).toBe(true);
    expect(map.plugins.marker.remove('a')).toBe(false);
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['b']);
    map.plugins.marker.clear();
    expect(map.plugins.marker.count()).toBe(0);
  });

  it('removes its source and layer on destroy', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', coord: [0, 0] });
    await map.destroy();
    expect(fake.getSource('indoor-markers')).toBeUndefined();
    expect(fake.getLayer('indoor-markers')).toBeUndefined();
  });
});
