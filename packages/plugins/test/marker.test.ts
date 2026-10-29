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
  it('picks the closest marker when hit areas overlap', async () => {
    const { map, fake } = await open();
    map.plugins.marker.replaceAll([
      { id: 'far', coord: [0, 0] },
      { id: 'near', coord: [0.0001, 0] },
    ]);
    expect(map.plugins.marker.pick(fake.project([0.0001, 0]))).toBe('near');
    await map.destroy();
  });

  it('replaces a complete business layer atomically and keeps floor filtering', async () => {
    const { map, fake } = await open();
    const markers = map.plugins.marker;
    markers.replaceAll([
      { id: 'device', floor: '1F', coord: [0, 0], label: 'Monitor' },
      { id: 'upstairs', floor: '2F', coord: [0, 0], label: 'Nurse' },
    ]);
    expect(markers.count()).toBe(2);
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['device']);
    markers.replaceAll([{ id: 'person', floor: '1F', coord: [0.001, 0], label: 'Nurse' }]);
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['person']);
    expect(markers.count()).toBe(1);
    expect(() => markers.replaceAll([{ id: 'bad', floor: '9F', coord: [0, 0] }])).toThrow(/unknown floor/);
    expect(markerData(fake).features.map((f) => f.properties!.id)).toEqual(['person']);
    await map.destroy();
    expect(map.resources.size).toBe(0);
  });

  it('hides both marker layers without discarding the business data', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', coord: [0, 0] });
    map.plugins.marker.setVisible(false);
    expect(map.plugins.marker.rendered()).toEqual([]);
    expect(map.plugins.marker.pick({ x: 0, y: 0 })).toBeNull();
    for (const id of ['indoor-markers', 'indoor-marker-labels'])
      expect((fake.getLayer(id) as { layout: { visibility: string } }).layout.visibility).toBe('none');
    expect(map.plugins.marker.count()).toBe(1);
    map.plugins.marker.setVisible(true);
    expect(map.plugins.marker.rendered()).toEqual(['a']);
    expect((fake.getLayer('indoor-markers') as { layout: { visibility: string } }).layout.visibility).toBe(
      'visible',
    );
    await map.destroy();
  });

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

  it('colours each marker and updates its label, colour and place', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', coord: [0, 0], label: '12' });
    map.plugins.marker.add({ id: 'b', coord: [0, 0], label: '0', color: '#b91c1c' });
    expect(markerData(fake).features.map((f) => f.properties!.color)).toEqual(['#e5484d', '#b91c1c']);
    const layer = fake.getLayer('indoor-markers') as { paint: Record<string, unknown> };
    expect(layer.paint['circle-color']).toEqual(['get', 'color']);
    map.plugins.marker.update('a', { label: '11', color: '#15803d', coord: [0.001, 0] });
    expect(markerData(fake).features[0]).toMatchObject({
      geometry: { coordinates: [0.001, 0] },
      properties: { label: '11', color: '#15803d' },
    });
    expect(() => map.plugins.marker.update('nope', { label: 'x' })).toThrow(/unknown marker/);
  });

  it('removes its source and layer on destroy', async () => {
    const { map, fake } = await open();
    map.plugins.marker.add({ id: 'a', coord: [0, 0] });
    await map.destroy();
    expect(fake.getSource('indoor-markers')).toBeUndefined();
    expect(fake.getLayer('indoor-markers')).toBeUndefined();
  });
});
