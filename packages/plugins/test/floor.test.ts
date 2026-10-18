import { createIndoorMap } from '@indoorkit/core';
import { type FakeMap, fakeMapFactory } from '@indoorkit/core/testing';
import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../imdf/test/fixture';
import { floorPlugin } from '../src/index';

async function open() {
  let fake!: FakeMap;
  const map = await createIndoorMap({
    container: 'map',
    venue: buildVenueModel(makeArchive()),
    mapFactory: fakeMapFactory((m) => {
      fake = m;
    }),
    plugins: [floorPlugin],
  });
  return { map, fake };
}

const levelFilter = (id: string) => ['==', ['get', 'level_id'], id];

describe('floorPlugin', () => {
  it('lists levels by ordinal', async () => {
    const { map } = await open();
    expect(map.plugins.floor.list().map((l) => l.shortName.en)).toEqual(['1F', '2F']);
  });

  it('starts on the ground floor and filters every floor layer to it', async () => {
    const { map, fake } = await open();
    expect(map.plugins.floor.current().id).toBe(IDS.level1);
    for (const id of map.indoorLayerIds.filter((l) => l !== 'indoor-levels-outline')) {
      expect(fake.getFilter(id)).toEqual(levelFilter(IDS.level1));
    }
  });

  it('switches floor by short name and emits floor:change', async () => {
    const { map, fake } = await open();
    const events: unknown[] = [];
    map.events.on('floor:change', (e) => events.push(e));
    map.plugins.floor.set('2F');
    expect(map.plugins.floor.current().id).toBe(IDS.level2);
    expect(fake.getFilter('indoor-units')).toEqual(levelFilter(IDS.level2));
    expect(events).toEqual([{ levelId: IDS.level2, previous: IDS.level1 }]);
  });

  it('accepts a level id', async () => {
    const { map } = await open();
    map.plugins.floor.set(IDS.level2);
    expect(map.plugins.floor.current().id).toBe(IDS.level2);
  });

  it('does not emit when setting the current floor again', async () => {
    const { map } = await open();
    let count = 0;
    map.events.on('floor:change', () => count++);
    map.plugins.floor.set('1F');
    expect(count).toBe(0);
  });

  it('throws on an unknown floor', async () => {
    const { map } = await open();
    expect(() => map.plugins.floor.set('9F')).toThrow(/unknown floor/);
  });
});
