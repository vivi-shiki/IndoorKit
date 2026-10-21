import { buildVenueModel } from '@indoorkit/imdf';
import { createParking, parkingExtensions } from '@indoorkit/parking';
import type { PositionBatch } from '@indoorkit/rtls';
import { generateParking, MINATO_PARKING } from '@indoorkit/venue-gen';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createParkingDay, createParkingFeed } from '../src/index';

const H = 3600_000;
const parking = createParking(buildVenueModel(generateParking(MINATO_PARKING), parkingExtensions));
const sim = createParkingDay(parking, { seed: 'demo' });

describe('createParkingFeed', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports the driving vehicles every interval at the simulated time', async () => {
    let real = 0;
    const feed = createParkingFeed(sim, { startAt: 12 * H, intervalMs: 1000, now: () => real });
    const batches: PositionBatch[] = [];
    feed.subscribe((b) => batches.push(b));
    await feed.start();
    real = 1000;
    vi.advanceTimersByTime(1000);
    real = 2000;
    vi.advanceTimersByTime(1000);
    expect(batches.map((b) => b.time)).toEqual([12 * H + 1000, 12 * H + 2000]);
    expect(batches[0]!.positions).toEqual(
      sim.movingAt(12 * H + 1000).map((m) => ({ id: m.id, levelId: m.levelId, coord: m.coord })),
    );
    feed.dispose();
  });

  it('runs faster at a higher speed without jumping back', async () => {
    let real = 0;
    const feed = createParkingFeed(sim, { startAt: 12 * H, intervalMs: 1000, now: () => real });
    await feed.start();
    real = 1000;
    expect(feed.time()).toBe(12 * H + 1000);
    feed.setSpeed(60);
    real = 2000;
    expect(feed.time()).toBe(12 * H + 1000 + 60_000);
    expect(feed.speed()).toBe(60);
    feed.dispose();
  });

  it('stops reporting after dispose', async () => {
    const feed = createParkingFeed(sim, { startAt: 12 * H, intervalMs: 1000, now: () => 0 });
    const listener = vi.fn();
    feed.subscribe(listener);
    await feed.start();
    feed.dispose();
    vi.advanceTimersByTime(5000);
    expect(listener).not.toHaveBeenCalled();
  });
});
