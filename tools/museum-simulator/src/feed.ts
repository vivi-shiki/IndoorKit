import type { DataProvider, PositionBatch } from '@indoorkit/rtls';
import type { MuseumDay } from './day';

export interface MuseumFeedOptions {
  /** 模拟时钟（毫秒，0 为今天 0 点），由页面的时钟提供 */
  time: () => number;
  /** 上报间隔（真实时间，毫秒） */
  intervalMs: number;
}

/** 携带标签的来馆者的实时位置：每个间隔上报一次，batch.time 是模拟时刻 */
export function createMuseumFeed(day: MuseumDay, options: MuseumFeedOptions): DataProvider {
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<(batch: PositionBatch) => void>();
  const emit = () => {
    const t = options.time();
    const batch: PositionBatch = {
      time: t,
      positions: day.taggedAt(t).map((p) => ({ id: p.id, levelId: p.levelId, coord: p.coord })),
    };
    for (const l of [...listeners]) l(batch);
  };
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
  };
  return {
    start() {
      if (timer !== undefined) return;
      timer = setInterval(emit, options.intervalMs);
    },
    stop,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      stop();
      listeners.clear();
    },
  };
}
