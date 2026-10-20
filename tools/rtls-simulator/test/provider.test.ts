import { departmentExtension } from '@indoorkit/hospital';
import { buildVenueModel } from '@indoorkit/imdf';
import type { PositionBatch } from '@indoorkit/rtls';
import { generateVenue, SAKURA_HOSPITAL } from '@indoorkit/venue-gen';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSimulationProvider, createWorkerProvider, exposeSimulation } from '../src/index';

const venue = buildVenueModel(generateVenue(SAKURA_HOSPITAL), [departmentExtension]);

describe('createSimulationProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits one batch per interval while started', async () => {
    vi.useFakeTimers();
    const provider = createSimulationProvider(venue, { seed: 'p', tags: 10, intervalMs: 1000 });
    const batches: PositionBatch[] = [];
    provider.subscribe((b) => batches.push(b));
    await provider.start();
    await vi.advanceTimersByTimeAsync(3000);
    expect(batches).toHaveLength(3);
    expect(batches.map((b) => b.positions.length)).toEqual([10, 10, 10]);
    expect(batches[1]!.time).toBeGreaterThan(batches[0]!.time);
    provider.dispose();
  });

  it('stops emitting after stop()', async () => {
    vi.useFakeTimers();
    const provider = createSimulationProvider(venue, { seed: 'p', tags: 5, intervalMs: 1000 });
    const listener = vi.fn();
    provider.subscribe(listener);
    await provider.start();
    await vi.advanceTimersByTimeAsync(1000);
    await provider.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('stops delivering to an unsubscribed listener', async () => {
    vi.useFakeTimers();
    const provider = createSimulationProvider(venue, { seed: 'p', tags: 5, intervalMs: 1000 });
    const listener = vi.fn();
    const off = provider.subscribe(listener);
    off();
    await provider.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(listener).not.toHaveBeenCalled();
    provider.dispose();
  });
});

describe('createWorkerProvider', () => {
  function workerPair() {
    const channel = new MessageChannel();
    const exposed = exposeSimulation(channel.port2);
    // 真实 Worker 终止时其中的定时器一起消失；这里手动停掉
    const terminate = vi.fn(() => {
      exposed.stop();
      channel.port1.close();
      channel.port2.close();
    });
    return { worker: Object.assign(channel.port1, { terminate }), terminate };
  }

  it('delivers simulated batches from the worker side', async () => {
    const { worker } = workerPair();
    const provider = createWorkerProvider(worker, venue, { seed: 'w', tags: 8, intervalMs: 20 });
    const batches: PositionBatch[] = [];
    const got = new Promise<void>((resolve) => {
      provider.subscribe((b) => {
        batches.push(b);
        if (batches.length === 2) resolve();
      });
    });
    await provider.start();
    await got;
    expect(batches[0]!.positions).toHaveLength(8);
    provider.dispose();
  });

  it('terminates the worker on dispose and emits nothing afterwards', async () => {
    const { worker, terminate } = workerPair();
    const provider = createWorkerProvider(worker, venue, { seed: 'w', tags: 4, intervalMs: 20 });
    const listener = vi.fn();
    provider.subscribe(listener);
    await provider.start();
    provider.dispose();
    expect(terminate).toHaveBeenCalledTimes(1);
    const calls = listener.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));
    expect(listener.mock.calls.length).toBe(calls);
  });
});
