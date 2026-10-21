import { buildVenueModel } from '@indoorkit/imdf';
import { createMuseum, museumExtensions } from '@indoorkit/museum';
import type { PositionBatch } from '@indoorkit/rtls';
import { generateMuseum, MINATO_MUSEUM } from '@indoorkit/venue-gen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMuseumDay, createMuseumFeed } from '../src/index';

const H = 3600_000;
const museum = createMuseum(buildVenueModel(generateMuseum(MINATO_MUSEUM), museumExtensions));
const day = createMuseumDay(museum, { seed: 'minato' });

describe('createMuseumFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports the tagged visitors every interval at the clock time', async () => {
    let now = 14 * H;
    const feed = createMuseumFeed(day, { time: () => now, intervalMs: 1000 });
    const batches: PositionBatch[] = [];
    feed.subscribe((b) => batches.push(b));
    await feed.start();
    vi.advanceTimersByTime(1000);
    now += 60_000;
    vi.advanceTimersByTime(1000);
    expect(batches.map((b) => b.time)).toEqual([14 * H, 14 * H + 60_000]);
    expect(batches[0]!.positions).toEqual(
      day.taggedAt(14 * H).map((p) => ({ id: p.id, levelId: p.levelId, coord: p.coord })),
    );
    feed.dispose();
  });

  it('stops reporting after dispose', async () => {
    const feed = createMuseumFeed(day, { time: () => 14 * H, intervalMs: 1000 });
    const listener = vi.fn();
    feed.subscribe(listener);
    await feed.start();
    feed.dispose();
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
  });
});
