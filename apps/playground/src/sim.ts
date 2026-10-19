import type { VenueModel } from '@indoorkit/imdf';
import { createWorkerProvider } from '@indoorkit/rtls-simulator';
import { stats } from './test-hooks';

export const SIM_INTERVAL_MS = 1000;

/** 在 Worker 里运行定位模拟；终止时更新全局 Worker 计数 */
export function createSimProvider(venue: VenueModel, tags: number, seed = 'playground') {
  const worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
  stats().activeWorkers++;
  let terminated = false;
  const tracked = Object.assign(worker, {
    terminate() {
      if (terminated) return;
      terminated = true;
      Worker.prototype.terminate.call(worker);
      stats().activeWorkers--;
    },
  });
  return createWorkerProvider(tracked, venue, { seed, tags, intervalMs: SIM_INTERVAL_MS });
}
