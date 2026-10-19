import { describe, expect, it } from 'vitest';
import { departmentPlugin, floorPlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

describe('departmentPlugin', () => {
  it('draws the units of every department with their department id', async () => {
    const { fake } = await openMap([floorPlugin, departmentPlugin]);
    const features = featureCollection(fake, 'indoor-departments').features;
    expect(features.map((f) => [f.properties!.unit_id, f.properties!.department_id])).toEqual([
      [IDS.room, IDS.department],
    ]);
    expect(fake.layerIds()).toEqual(
      expect.arrayContaining(['indoor-departments', 'indoor-department-outlines']),
    );
  });

  it('shows, hides and highlights departments', async () => {
    const { map, fake } = await openMap([floorPlugin, departmentPlugin]);
    const api = map.plugins.department;
    expect(api.visible()).toBe(true);
    api.setVisible(false);
    expect(fake.getLayoutProperty('indoor-departments', 'visibility')).toBe('none');
    api.setVisible(true);
    expect(fake.getLayoutProperty('indoor-departments', 'visibility')).toBe('visible');
    api.highlight(IDS.department);
    expect(api.highlighted()).toBe(IDS.department);
    expect(() => api.highlight('nope')).toThrow(/unknown department/);
    api.highlight(null);
    expect(api.highlighted()).toBeNull();
  });

  it('releases its layers on destroy', async () => {
    const { map, fake } = await openMap([floorPlugin, departmentPlugin]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
  });
});
