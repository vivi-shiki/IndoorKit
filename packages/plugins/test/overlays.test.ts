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
    // 只把当前楼层的要素交给地图；图层本身不带楼层过滤
    expect(featureCollection(fake, 'indoor-polygons').features).toEqual([]);
    expect(fake.getFilter('indoor-polygons')).toBeUndefined();
    map.plugins.floor.set('2F');
    const feature = featureCollection(fake, 'indoor-polygons').features[0]!;
    expect(feature.properties).toMatchObject({ id: 'p', level_id: IDS.level2, label: 'ICU' });
    expect(fake.getFilter('indoor-polygons')).toBeUndefined();
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

describe('floor overlay updates', () => {
  // 真实地图在上一次 setData 的瓦片还没切完时再次 setData，同一瓦片的两次解析会交错，
  // queryRenderedFeatures 随后会读到不配套的数据并抛出 "feature index out of bounds"
  it('sends the next data only after the previous update has loaded, keeping the latest', async () => {
    const { map, fake } = await openMap([floorPlugin, polygonPlugin]);
    fake.holdSourceLoads = true;
    const sent = fake.sourceUpdates('indoor-polygons');

    map.plugins.polygon.add({ id: 'a', floor: '1F', coordinates: ring });
    map.plugins.polygon.add({ id: 'b', floor: '1F', coordinates: ring });
    map.plugins.polygon.add({ id: 'c', floor: '1F', coordinates: ring });
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent + 1);
    expect(featureCollection(fake, 'indoor-polygons').features.map((f) => f.properties!.id)).toEqual(['a']);

    // 另一个 source 加载完不放行
    fake.fire('sourcedata', { type: 'sourcedata', sourceId: 'indoor-other' });
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent + 1);

    fake.finishSourceLoad('indoor-polygons');
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent + 2);
    expect(featureCollection(fake, 'indoor-polygons').features.map((f) => f.properties!.id)).toEqual([
      'a',
      'b',
      'c',
    ]);

    // 没有新数据时加载完就停下
    fake.finishSourceLoad('indoor-polygons');
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent + 2);
  });

  // 换楼层如果改图层过滤条件，MapLibre 会在下一帧重新解析瓦片，绕开上面的排队；
  // 所以楼层也在数据里过滤，换楼层就是一次排队的 setData
  it('queues a floor switch like any other update', async () => {
    const { map, fake } = await openMap([floorPlugin, polygonPlugin]);
    map.plugins.polygon.add({ id: 'one', floor: '1F', coordinates: ring });
    map.plugins.polygon.add({ id: 'two', floor: '2F', coordinates: ring });
    fake.holdSourceLoads = true;
    map.plugins.polygon.add({ id: 'one-b', floor: '1F', coordinates: ring });
    const sent = fake.sourceUpdates('indoor-polygons');

    map.plugins.floor.set('2F');
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent);
    fake.finishSourceLoad('indoor-polygons');
    expect(featureCollection(fake, 'indoor-polygons').features.map((f) => f.properties!.id)).toEqual(['two']);
  });

  it('sends right away when nothing is loading', async () => {
    const { map, fake } = await openMap([floorPlugin, polygonPlugin]);
    const sent = fake.sourceUpdates('indoor-polygons');
    map.plugins.polygon.add({ id: 'a', floor: '1F', coordinates: ring });
    map.plugins.polygon.add({ id: 'b', floor: '1F', coordinates: ring });
    expect(fake.sourceUpdates('indoor-polygons')).toBe(sent + 2);
  });
});
