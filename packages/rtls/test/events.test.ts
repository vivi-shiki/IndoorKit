import { createIndoorMap, definePlugin } from '@indoorkit/core';
import { fakeMapFactory } from '@indoorkit/core/testing';
import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import type { PositionBatch } from '../src/index';
import { createManualProvider } from '../src/testing';

describe('@indoorkit/rtls', () => {
  it('adds positions:update to the core events', async () => {
    const seen: PositionBatch[] = [];
    const listener = definePlugin({
      name: 'listener',
      setup(ctx) {
        ctx.on('positions:update', (b) => seen.push(b));
      },
    });
    const map = await createIndoorMap({
      container: 'map',
      venue: buildVenueModel(makeArchive()),
      mapFactory: fakeMapFactory(),
      plugins: [listener],
    });
    const batch: PositionBatch = { time: 1, positions: [{ id: 'a', levelId: 'l', coord: [0, 0], status: 'x' }] };
    map.events.emit('positions:update', batch);
    expect(seen).toEqual([batch]);
  });

  it('provides a manual data provider for tests', () => {
    const provider = createManualProvider();
    const got: PositionBatch[] = [];
    provider.start();
    provider.subscribe((b) => got.push(b));
    provider.emit({ time: 0, positions: [] });
    expect(got).toHaveLength(1);
    provider.dispose();
    expect(() => provider.start()).toThrow(/disposed/);
  });
});
