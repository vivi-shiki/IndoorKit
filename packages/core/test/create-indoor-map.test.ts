import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it, vi } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import { createIndoorMap, definePlugin } from '../src/index';
import { type FakeMap, fakeMapFactory } from '../src/testing';

const venue = buildVenueModel(makeArchive());

function setup(plugins: Parameters<typeof createIndoorMap>[0]['plugins'] = []) {
  let fake: FakeMap | undefined;
  const mapFactory = fakeMapFactory((m) => {
    fake = m;
  });
  return { mapFactory, plugins, getFake: () => fake! };
}

describe('createIndoorMap', () => {
  it('runs the lifecycle in order and finishes with destroy', async () => {
    const phases: string[] = [];
    const { mapFactory } = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory,
      on: { lifecycle: (e) => phases.push(e.phase) },
    });
    expect(phases).toEqual(['init', 'load', 'ready']);
    await map.destroy();
    expect(phases).toEqual(['init', 'load', 'ready', 'destroy']);
  });

  it('adds indoor sources and layers to the map', async () => {
    const s = setup();
    const map = await createIndoorMap({ container: 'map', venue, mapFactory: s.mapFactory });
    const fake = s.getFake();
    expect(map.indoorLayerIds.length).toBeGreaterThan(0);
    for (const id of map.indoorLayerIds) expect(fake.getLayer(id)).toBeDefined();
    expect(map.indoorLayerIds).toEqual(
      expect.arrayContaining(['indoor-units', 'indoor-walls', 'indoor-openings']),
    );
  });

  it('exposes typed plugin APIs and lets plugins use their dependencies', async () => {
    const counter = definePlugin({
      name: 'counter',
      setup: () => {
        let n = 0;
        return { inc: () => ++n };
      },
    });
    const doubler = definePlugin({
      name: 'doubler',
      deps: ['counter'],
      setup: (ctx) => {
        const c = ctx.get<{ inc(): number }>('counter');
        return {
          incTwice: () => {
            c.inc();
            return c.inc();
          },
        };
      },
    });
    const s = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory: s.mapFactory,
      plugins: [doubler, counter] as const,
    });
    expect(map.plugins.doubler.incTwice()).toBe(2);
    expect(map.plugins.counter.inc()).toBe(3);
  });

  it('releases everything a plugin tracked, then removes the map', async () => {
    const order: string[] = [];
    const layered = definePlugin({
      name: 'layered',
      setup: (ctx) => {
        ctx.trackSource('test-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        ctx.trackLayer({ id: 'test-layer', type: 'circle', source: 'test-src' });
        ctx.map.on('click', () => {});
        ctx.track('custom', () => order.push('custom'));
        return {};
      },
    });
    const s = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory: s.mapFactory,
      plugins: [layered],
    });
    const fake = s.getFake();
    expect(fake.getLayer('test-layer')).toBeDefined();
    expect(map.resources.size).toBeGreaterThan(0);

    fake.onRemove = () => order.push('map.remove');
    await map.destroy();
    expect(order).toEqual(['custom', 'map.remove']);
    expect(map.resources.size).toBe(0);
    expect(fake.layerIds()).toEqual([]);
    expect(fake.sourceIds()).toEqual([]);
    expect(map.destroyed).toBe(true);
  });

  it('removes map listeners registered through ctx.onMap', async () => {
    const plugin = definePlugin({
      name: 'clicky',
      setup: (ctx) => {
        ctx.onMap('dblclick', () => {});
        return {};
      },
    });
    const s = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory: s.mapFactory,
      plugins: [plugin],
    });
    const fake = s.getFake();
    expect(fake.listenerCount('dblclick')).toBe(1);
    await map.destroy();
    expect(fake.listenerCount('dblclick')).toBe(0);
  });

  it('stops delivering core events to plugin handlers after destroy', async () => {
    const handler = vi.fn();
    const plugin = definePlugin({
      name: 'listener',
      setup: (ctx) => {
        ctx.on('floor:change', handler);
        return {};
      },
    });
    const s = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory: s.mapFactory,
      plugins: [plugin],
    });
    map.events.emit('floor:change', { levelId: 'x', previous: null });
    expect(handler).toHaveBeenCalledTimes(1);
    await map.destroy();
    map.events.emit('floor:change', { levelId: 'y', previous: 'x' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('can be destroyed twice', async () => {
    const s = setup();
    const map = await createIndoorMap({ container: 'map', venue, mapFactory: s.mapFactory });
    await map.destroy();
    await expect(map.destroy()).resolves.toBeUndefined();
  });

  it('releases everything and then throws when a resource fails to release', async () => {
    const failure = new Error('dispose failed');
    const plugin = definePlugin({
      name: 'broken',
      setup: (ctx) => {
        ctx.track(
          1,
          () => {
            throw failure;
          },
          'bad',
        );
        ctx.onMap('click', () => {});
        return {};
      },
    });
    const s = setup();
    const map = await createIndoorMap({
      container: 'map',
      venue,
      mapFactory: s.mapFactory,
      plugins: [plugin],
    });
    const fake = s.getFake();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const error = await map.destroy().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    // The failure must not stop the rest of the release
    expect(map.destroyed).toBe(true);
    expect(map.resources.size).toBe(0);
    expect(fake.removed).toBe(true);
    expect(fake.listenerCount('click')).toBe(0);
    expect(fake.layerIds()).toEqual([]);
    expect(fake.sourceIds()).toEqual([]);
  });

  it('cleans up when a plugin fails during setup', async () => {
    const bad = definePlugin({
      name: 'bad',
      setup: () => {
        throw new Error('setup failed');
      },
    });
    const s = setup();
    await expect(
      createIndoorMap({ container: 'map', venue, mapFactory: s.mapFactory, plugins: [bad] }),
    ).rejects.toThrow('setup failed');
    const fake = s.getFake();
    expect(fake.removed).toBe(true);
    expect(fake.layerIds()).toEqual([]);
  });
});
