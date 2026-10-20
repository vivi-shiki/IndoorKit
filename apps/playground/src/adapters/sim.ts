import type { VenueModel } from '@indoorkit/imdf';
import { createWorkerProvider } from '@indoorkit/rtls-simulator';
import { stats } from '../testing/hooks';

export const SIM_INTERVAL_MS = 1000;
/** 人员相关页面用同一个种子，同一个编号就是同一个人 */
export const PEOPLE_SEED = 'playground';

/** 在 Worker 里运行定位模拟；终止时更新全局 Worker 计数 */
export function createSimProvider(
  venue: VenueModel,
  options: { people: number; assets?: number; seed: string },
) {
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
  return createWorkerProvider(tracked, venue, {
    seed: options.seed,
    tags: options.people,
    assets: options.assets ?? 0,
    intervalMs: SIM_INTERVAL_MS,
  });
}

/** 演示数据来自模拟器：名册和整段模拟只在这里接入，页面不直接认识数据源 */
export { createRoster, createSimulation } from '@indoorkit/rtls-simulator';
