import type { VenueModel } from '@indoorkit/imdf';
import type { DataProvider, PositionBatch } from '@indoorkit/rtls';
import * as Comlink from 'comlink';
import { createSimulation, type Simulation, type SimulationOptions } from './simulation';

export * from './roster';
export { createSimulation, type Simulation, type SimulationOptions } from './simulation';

export interface ProviderOptions extends SimulationOptions {
  /** 上报间隔（毫秒） */
  intervalMs: number;
}

type Listener = (batch: PositionBatch) => void;

/** 按固定间隔推进模拟并上报，供主线程和 Worker 两边共用 */
function createTicker(sim: Simulation, intervalMs: number, emit: Listener) {
  let timer: ReturnType<typeof setInterval> | undefined;
  return {
    start() {
      if (timer !== undefined) return;
      timer = setInterval(
        () => emit({ time: sim.time + intervalMs, positions: sim.step(intervalMs) }),
        intervalMs,
      );
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}

/** 在主线程运行的模拟数据源（测试或不支持 Worker 的环境用） */
export function createSimulationProvider(venue: VenueModel, options: ProviderOptions): DataProvider {
  const listeners = new Set<Listener>();
  const ticker = createTicker(createSimulation(venue, options), options.intervalMs, (batch) => {
    for (const l of [...listeners]) l(batch);
  });
  return {
    start: () => ticker.start(),
    stop: () => ticker.stop(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      ticker.stop();
      listeners.clear();
    },
  };
}

/** Worker 一侧通过 Comlink 暴露的接口 */
export interface SimulationWorkerApi {
  start(venue: VenueModel, options: ProviderOptions, onBatch: Listener): void;
  stop(): void;
}

/** 在 Worker 里调用：把模拟器暴露给主线程 */
export function exposeSimulation(endpoint: Comlink.Endpoint) {
  let ticker: ReturnType<typeof createTicker> | undefined;
  const api: SimulationWorkerApi = {
    start(venue, options, onBatch) {
      ticker?.stop();
      ticker = createTicker(createSimulation(venue, options), options.intervalMs, onBatch);
      ticker.start();
    },
    stop() {
      ticker?.stop();
    },
  };
  Comlink.expose(api, endpoint);
  return api;
}

export interface WorkerLike extends Comlink.Endpoint {
  terminate(): void;
}

/** 在 Worker 里运行模拟，主线程只接收上报；dispose 时终止 Worker */
export function createWorkerProvider(
  worker: WorkerLike,
  venue: VenueModel,
  options: ProviderOptions,
): DataProvider {
  const listeners = new Set<Listener>();
  const remote = Comlink.wrap<SimulationWorkerApi>(worker);
  let disposed = false;
  const onBatch = Comlink.proxy((batch: PositionBatch) => {
    if (disposed) return;
    for (const l of [...listeners]) l(batch);
  });
  const alive = () => {
    if (disposed) throw new Error('the worker provider is disposed');
  };
  return {
    async start() {
      alive();
      await remote.start(venue, options, onBatch);
    },
    async stop() {
      alive();
      await remote.stop();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      // 终止 Worker 即停止其中的定时器，不必等待 stop() 往返
      remote[Comlink.releaseProxy]();
      worker.terminate();
    },
  };
}
