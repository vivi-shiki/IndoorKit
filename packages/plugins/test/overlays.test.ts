// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { floorPlugin, linePlugin, polygonPlugin, popupPlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

const ring: [number, number][] = [
  [0, 0],
  [0.001, 0],
  [0.001, 0.001],
  [0, 0],
];

describe('polygonPlugin', () => {
  it('adds polygons on a floor, filters them by floor and removes them', async () => {
    const { map, fake } = await openMap([floorPlugin, polygonPlugin]);
    map.plugins.polygon.add({ id: 'p', floor: '2F', coordinates: ring, label: 'ICU' });
    const feature = featureCollection(fake, 'indoor-polygons').features[0]!;
    expect(feature.properties).toMatchObject({ id: 'p', level_id: IDS.level2, label: 'ICU' });
    expect(fake.getFilter('indoor-polygons')).toEqual(['==', ['get', 'level_id'], IDS.level1]);
    map.plugins.floor.set('2F');
    expect(fake.getFilter('indoor-polygons')).toEqual(['==', ['get', 'level_id'], IDS.level2]);
    expect(map.plugins.polygon.remove('p')).toBe(true);
    expect(map.plugins.polygon.count()).toBe(0);
  });
});

describe('linePlugin', () => {
  it('adds and removes lines', async () => {
    const { map, fake } = await openMap([floorPlugin, linePlugin]);
    map.plugins.line.add({
      id: 'l',
      coordinates: [
        [0, 0],
        [0.001, 0.001],
      ],
    });
    expect(featureCollection(fake, 'indoor-lines').features[0]!.properties).toMatchObject({
      id: 'l',
      level_id: IDS.level1,
    });
    expect(() => map.plugins.line.add({ id: 'bad', coordinates: [[0, 0]] })).toThrow(/at least two/);
    map.plugins.line.remove('l');
    expect(map.plugins.line.count()).toBe(0);
  });
});

describe('popupPlugin', () => {
  it('shows text in the map container and follows the map when it moves', async () => {
    const { map, fake } = await openMap([floorPlugin, popupPlugin]);
    map.plugins.popup.open({ id: 'alert', coord: [0.001, 0.002], text: '<b>ICU</b> 进入' });
    const el = fake.getContainer().querySelector<HTMLElement>('[data-popup-id="alert"]')!;
    expect(el.textContent).toBe('<b>ICU</b> 进入');
    const before = el.style.transform;
    fake.setProjectionOffset(50, 20);
    fake.fire('move');
    expect(el.style.transform).not.toBe(before);
  });

  it('closes popups and removes them all on destroy', async () => {
    const { map, fake } = await openMap([floorPlugin, popupPlugin]);
    map.plugins.popup.open({ id: 'a', coord: [0, 0], text: 'a' });
    map.plugins.popup.open({ id: 'b', coord: [0, 0], text: 'b' });
    expect(map.plugins.popup.close('a')).toBe(true);
    expect(map.plugins.popup.list()).toEqual(['b']);
    const container = fake.getContainer();
    await map.destroy();
    expect(container.querySelectorAll('[data-popup-id]')).toHaveLength(0);
    expect(fake.listenerCount('move')).toBe(0);
  });
});
