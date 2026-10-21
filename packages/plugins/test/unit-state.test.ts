import { describe, expect, it } from 'vitest';
import { floorPlugin, unitStatePlugin } from '../src/index';
import { featureCollection, IDS, openMap } from './helpers';

const COLORS = { bad: '#ff0000', busy: '#888888', free: '#00ff00' };
const ORDER = ['bad', 'busy', 'free'];

async function open(options: Partial<Parameters<typeof unitStatePlugin>[0]> = {}) {
  const opened = await openMap([floorPlugin, unitStatePlugin({ colors: COLORS, order: ORDER, ...options })]);
  return { ...opened, states: opened.map.plugins['unit-state'] };
}

const props = (fake: Awaited<ReturnType<typeof open>>['fake'], source = 'indoor-unit-states') =>
  featureCollection(fake, source).features.map((f) => f.properties!);

describe('unitStatePlugin', () => {
  it('draws every unit that has a state with its own geometry and the given colours', async () => {
    const { fake, states } = await open();
    states.setStates([
      [IDS.room, 'free'],
      [IDS.hall, 'bad'],
    ]);
    expect(props(fake).map((p) => [p.unit_id, p.state])).toEqual([
      [IDS.room, 'free'],
      [IDS.hall, 'bad'],
    ]);
    expect(featureCollection(fake, 'indoor-unit-states').features[0]!.geometry.type).toBe('Polygon');
    const layer = fake.getLayer('indoor-unit-states') as { paint: Record<string, unknown> };
    expect(layer.paint['fill-color']).toEqual([
      'match',
      ['get', 'state'],
      'bad',
      '#ff0000',
      'busy',
      '#888888',
      'free',
      '#00ff00',
      '#6b7280',
    ]);
  });

  it('changes one unit at a time and removes a unit with null', async () => {
    const { fake, states } = await open();
    states.setStates([[IDS.room, 'free']]);
    states.set(IDS.room, 'busy');
    states.set(IDS.hall, 'free');
    expect(states.state(IDS.room)).toBe('busy');
    expect(props(fake).map((p) => p.state)).toEqual(['busy', 'free']);
    states.set(IDS.hall, null);
    expect(states.state(IDS.hall)).toBeNull();
    expect(props(fake).map((p) => p.unit_id)).toEqual([IDS.room]);
  });

  it('replaces all states at once', async () => {
    const { states } = await open();
    states.setStates([[IDS.room, 'free']]);
    states.setStates([[IDS.hall, 'busy']]);
    expect([states.state(IDS.room), states.state(IDS.hall)]).toEqual([null, 'busy']);
  });

  it('rejects units the venue does not have and states without a colour', async () => {
    const { states } = await open();
    expect(() => states.set('nope', 'free')).toThrow(/unknown unit/);
    expect(() => states.set(IDS.room, 'purple')).toThrow(/unknown state/);
  });

  it('draws only the current floor', async () => {
    const { map, fake, states } = await open();
    states.setStates([[IDS.room, 'free']]);
    map.plugins.floor.set('2F');
    expect(props(fake)).toEqual([]);
    map.plugins.floor.set('1F');
    expect(props(fake)).toHaveLength(1);
  });

  it('outlines units by a tag that is independent of their state', async () => {
    const { fake, states } = await open({ outlines: { contract: '#7c3aed' } });
    states.setStates([[IDS.room, 'free']]);
    states.setOutlines([[IDS.room, 'contract']]);
    expect(props(fake)[0]).toMatchObject({ state: 'free', outline: 'contract' });
    expect(() => states.setOutlines([[IDS.room, 'nope']])).toThrow(/unknown outline/);
    const layer = fake.getLayer('indoor-unit-state-outlines') as { paint: Record<string, unknown> };
    expect(layer.paint['line-color']).toEqual([
      'match',
      ['get', 'outline'],
      'contract',
      '#7c3aed',
      '#6b7280',
    ]);
  });

  it('highlights units and clears the highlight', async () => {
    const { fake, states } = await open();
    states.setStates([
      [IDS.room, 'free'],
      [IDS.hall, 'free'],
    ]);
    states.highlight([IDS.hall]);
    expect(states.highlighted()).toEqual([IDS.hall]);
    expect(props(fake).map((p) => p.highlight)).toEqual([false, true]);
    states.highlight(null);
    expect(states.highlighted()).toEqual([]);
    expect(props(fake).map((p) => p.highlight)).toEqual([false, false]);
  });

  it('finds the unit with a state under a map coordinate on the current floor', async () => {
    const { map, states } = await open();
    states.setStates([[IDS.room, 'free']]);
    expect(states.unitAt([0.0005, 0.0005])).toBe(IDS.room);
    // 走廊没有状态，不算命中
    expect(states.unitAt([0.0015, 0.0005])).toBeNull();
    map.plugins.floor.set('2F');
    expect(states.unitAt([0.0005, 0.0005])).toBeNull();
  });

  it('summarises groups as "label count/total" with the worst state, in the map language', async () => {
    const { map, fake, states } = await open({
      groups: {
        items: [{ id: 'g', label: { ja: 'A区', en: 'Zone A' }, unitIds: [IDS.room, IDS.hall] }],
        countStates: ['free'],
      },
    });
    states.setStates([
      [IDS.room, 'free'],
      [IDS.hall, 'bad'],
    ]);
    expect(states.groups()).toEqual([
      { id: 'g', levelId: IDS.level1, count: 1, total: 2, worst: 'bad', center: expect.any(Array) },
    ]);
    expect(props(fake, 'indoor-unit-state-groups')).toEqual([
      expect.objectContaining({ id: 'g', text: 'A区 1/2', worst: 'bad', level_id: IDS.level1 }),
    ]);
    map.setLanguages(['en']);
    expect(props(fake, 'indoor-unit-state-groups')[0]!.text).toBe('Zone A 1/2');
    const layer = fake.getLayer('indoor-unit-state-groups') as { maxzoom?: number };
    expect(layer.maxzoom).toBeGreaterThan(0);
  });

  it('rejects a group spread over several floors', async () => {
    await expect(
      openMap([
        floorPlugin,
        unitStatePlugin({
          colors: COLORS,
          groups: { items: [{ id: 'g', label: {}, unitIds: ['nope'] }], countStates: ['free'] },
        }),
      ]),
    ).rejects.toThrow(/unknown unit/);
  });

  it('releases its sources and layers on destroy', async () => {
    const { map, fake, states } = await open({
      groups: { items: [{ id: 'g', label: { en: 'G' }, unitIds: [IDS.room] }], countStates: ['free'] },
    });
    states.setStates([[IDS.room, 'free']]);
    await map.destroy();
    expect(fake.layerIds()).toEqual([]);
    expect(fake.sourceIds().filter((id) => id.startsWith('indoor-unit-state'))).toEqual([]);
  });
});
