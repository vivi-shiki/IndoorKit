import { describe, expect, it } from 'vitest';
import { floorPlugin, zonePlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

const zones = [
  { id: 'west', unitIds: [IDS.room] },
  { id: 'east', unitIds: [IDS.hall] },
];

describe('zonePlugin', () => {
  it('draws the units of every zone with their zone id', async () => {
    const { fake } = await openMap([floorPlugin, zonePlugin({ zones })]);
    const features = featureCollection(fake, 'indoor-zones').features;
    expect(features.map((f) => [f.properties!.unit_id, f.properties!.zone_id])).toEqual([
      [IDS.room, 'west'],
      [IDS.hall, 'east'],
    ]);
    expect(fake.layerIds()).toEqual(expect.arrayContaining(['indoor-zones', 'indoor-zone-outlines']));
  });

  it('colours zones from the palette it is given', async () => {
    const { fake } = await openMap([floorPlugin, zonePlugin({ zones, palette: ['#111111', '#222222'] })]);
    const layer = fake.getLayer('indoor-zones') as { paint: Record<string, unknown> };
    expect(layer.paint['fill-color']).toEqual([
      'match',
      ['get', 'zone_id'],
      'west',
      '#111111',
      'east',
      '#222222',
      '#94a3b8',
    ]);
  });

  it('shows, hides and highlights zones', async () => {
    const { map, fake } = await openMap([floorPlugin, zonePlugin({ zones })]);
    const api = map.plugins.zone;
    expect(api.visible()).toBe(true);
    api.setVisible(false);
    expect(fake.getLayoutProperty('indoor-zones', 'visibility')).toBe('none');
    api.setVisible(true);
    expect(fake.getLayoutProperty('indoor-zones', 'visibility')).toBe('visible');
    api.highlight('west');
    expect(api.highlighted()).toBe('west');
    expect(() => api.highlight('nope')).toThrow(/unknown zone/);
    api.highlight(null);
    expect(api.highlighted()).toBeNull();
  });

  it('rejects zones with units the venue does not have', async () => {
    await expect(
      openMap([floorPlugin, zonePlugin({ zones: [{ id: 'x', unitIds: ['nope'] }] })]),
    ).rejects.toThrow(/unknown unit/);
  });

  it('releases its layers on destroy', async () => {
    const { map, fake } = await openMap([floorPlugin, zonePlugin({ zones })]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
