import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import { createIndoorMap, themes } from '../src/index';
import { type FakeMap, fakeMapFactory } from '../src/testing';

async function open() {
  let fake!: FakeMap;
  const map = await createIndoorMap({
    container: 'map',
    venue: buildVenueModel(makeArchive()),
    mapFactory: fakeMapFactory((m) => {
      fake = m;
    }),
  });
  return { map, fake };
}

describe('themes', () => {
  it('defines a dark theme with every color the light theme has', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
    expect(Object.keys(themes.dark.unitColors).sort()).toEqual(Object.keys(themes.light.unitColors).sort());
    expect(themes.dark.background).not.toBe(themes.light.background);
  });
});

describe('IndoorMap.setTheme', () => {
  it('starts with the light theme', async () => {
    const { map, fake } = await open();
    expect(map.theme.name).toBe('light');
    expect(fake.getPaintProperty('background', 'background-color')).toBe(themes.light.background);
  });

  it('recolors background, floor, units, walls and labels without recreating the map', async () => {
    const { map, fake } = await open();
    map.setTheme(themes.dark);
    expect(map.theme.name).toBe('dark');
    expect(fake.getPaintProperty('background', 'background-color')).toBe(themes.dark.background);
    expect(fake.getPaintProperty('indoor-floor', 'fill-color')).toBe(themes.dark.floor);
    expect(fake.getPaintProperty('indoor-walls', 'fill-extrusion-color')).toBe(themes.dark.wall);
    expect(fake.getPaintProperty('indoor-labels', 'text-color')).toBe(themes.dark.label);
    expect(JSON.stringify(fake.getPaintProperty('indoor-units', 'fill-extrusion-color'))).toContain(
      themes.dark.unitColors.room!,
    );
    expect(fake.removed).toBe(false);
  });

  it('emits theme:change', async () => {
    const { map } = await open();
    const seen: string[] = [];
    map.events.on('theme:change', (e) => seen.push(e.name));
    map.setTheme(themes.dark);
    expect(seen).toEqual(['dark']);
  });
});
