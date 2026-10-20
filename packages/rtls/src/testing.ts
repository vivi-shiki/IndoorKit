import type { DataProvider, PositionBatch } from './index';

/** 手动推送数据的 DataProvider，记录生命周期，便于测试 */
export function createManualProvider() {
  const listeners = new Set<(batch: PositionBatch) => void>();
  const state = { started: false, disposed: false };
  const provider: DataProvider & {
    readonly started: boolean;
    readonly disposed: boolean;
    emit(batch: PositionBatch): void;
    listenerCount(): number;
  } = {
    get started() {
      return state.started;
    },
    get disposed() {
      return state.disposed;
    },
    start() {
      if (state.disposed) throw new Error('provider is disposed');
      state.started = true;
    },
    stop() {
      state.started = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      state.started = false;
      state.disposed = true;
      listeners.clear();
    },
    emit(batch) {
      for (const l of [...listeners]) l(batch);
    },
    listenerCount: () => listeners.size,
  };
  return provider;
}
