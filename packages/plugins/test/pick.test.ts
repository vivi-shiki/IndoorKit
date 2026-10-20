import { createManualProvider } from '@indoorkit/rtls/testing';
import { describe, expect, it } from 'vitest';
import { floorPlugin, positionStreamPlugin, unitClusterPlugin } from '../src/index';
import { batch, IDS, openMap, tag } from './helpers';

/** FakeMap 的投影：x = 经度 × 1e5，y = −纬度 × 1e5 */
const ROOM: [number, number] = [0.0005, 0.0005];
const ROOM_PX = { x: 50, y: -50 };

async function stream() {
  const provider = createManualProvider();
  const opened = await openMap([
    floorPlugin,
    positionStreamPlugin({
      provider,
      intervalMs: 1000,
      clock: () => 0,
      frame: () => () => {},
      decorate: (id) => ({ group: id.toUpperCase() }),
    }),
  ]);
  provider.emit(batch(0, [tag('a', IDS.level1, ROOM)]));
  const api = opened.map.plugins['position-stream'];
  api.render(0);
  return { ...opened, api };
}

describe('position stream picking', () => {
  it('picks the tag drawn within a radius of a pixel', async () => {
    const { api } = await stream();
    expect(api.pick({ x: ROOM_PX.x + 3, y: ROOM_PX.y - 4 }, 10)).toBe('a');
    expect(api.pick({ x: ROOM_PX.x + 30, y: ROOM_PX.y }, 10)).toBeNull();
  });

  it('lists the tags drawn on the map with their properties', async () => {
    const { api } = await stream();
    expect(api.rendered()).toEqual([
      { id: 'a', coord: ROOM, properties: { group: 'A', id: 'a', level_id: IDS.level1 } },
    ]);
  });

  it('hides the tags without dropping them', async () => {
    const { api, fake } = await stream();
    api.setVisible(false);
    expect(api.visibleOnMap()).toBe(false);
    expect(fake.getLayoutProperty('indoor-positions', 'visibility')).toBe('none');
    expect(api.rendered()).toEqual([]);
    expect(api.pick(ROOM_PX, 10)).toBeNull();
    expect(api.count()).toBe(1);
    api.setVisible(true);
    expect(api.rendered()).toHaveLength(1);
  });

  it('can start hidden', async () => {
    const { fake } = await openMap([
      floorPlugin,
      positionStreamPlugin({
        provider: createManualProvider(),
        intervalMs: 1000,
        frame: () => () => {},
        visible: false,
      }),
    ]);
    expect(fake.getLayoutProperty('indoor-positions', 'visibility')).toBe('none');
  });
});

describe('unit cluster picking', () => {
  async function clusters() {
    const opened = await openMap([
      floorPlugin,
      unitClusterPlugin({ statusOrder: ['x'], statusColors: { x: '#000000' } }),
    ]);
    opened.map.events.emit(
      'positions:update',
      batch(0, [tag('a', IDS.level1, ROOM), tag('b', IDS.level1, ROOM)]),
    );
    return { ...opened, api: opened.map.plugins['unit-cluster'] };
  }

  it('picks the unit of the cluster near a pixel', async () => {
    const { api } = await clusters();
    expect(api.pick(ROOM_PX, 12)).toBe(IDS.room);
    expect(api.pick({ x: 500, y: 500 }, 12)).toBeNull();
  });

  it('lists the units drawn, from whichever layer the zoom shows', async () => {
    const { api, fake } = await clusters();
    expect(api.rendered()).toEqual([IDS.room]);
    fake.setZoom(21);
    expect(api.rendered()).toEqual([IDS.room]);
    expect(api.pick(ROOM_PX, 12)).toBe(IDS.room);
  });
});
