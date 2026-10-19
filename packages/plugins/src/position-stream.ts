import { type DataProvider, definePlugin, type PositionBatch, type TagPosition } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { floorOverlay } from './overlay';

export interface Sample {
  coord: [number, number];
  levelId: string;
  time: number;
}

/** 两次上报之间线性插值；换层时直接跳到新楼层，不在楼层之间滑动 */
export function interpolatePosition(from: Sample, to: Sample, t: number): Omit<Sample, 'time'> {
  if (from.levelId !== to.levelId || to.time <= from.time) return { coord: to.coord, levelId: to.levelId };
  const f = Math.min(1, Math.max(0, (t - from.time) / (to.time - from.time)));
  return {
    coord: [
      from.coord[0] + (to.coord[0] - from.coord[0]) * f,
      from.coord[1] + (to.coord[1] - from.coord[1]) * f,
    ],
    levelId: to.levelId,
  };
}

export interface PositionStreamOptions {
  provider: DataProvider;
  /** 数据源的上报间隔，也是插值时长 */
  intervalMs: number;
  /** 超过这个时间没有上报的标签不再显示，默认 3 个间隔 */
  staleAfterMs?: number;
  /** 保留多长时间的轨迹，默认 10 分钟 */
  historyMs?: number;
  /** 当前时间（毫秒），默认 performance.now */
  clock?: () => number;
  /** 自动渲染的最短间隔，默认 50 ms（约 20 fps）；每次渲染都会重新切片数据，不必每帧都做 */
  renderIntervalMs?: number;
  /** 逐帧调度，默认 requestAnimationFrame；没有时不自动渲染 */
  frame?: (callback: () => void) => () => void;
}

export interface PositionStreamApi {
  /** 在给定时刻渲染插值后的位置 */
  render(now: number): void;
  count(): number;
  /** 最近一次渲染出的当前楼层标签 */
  visible(): readonly TagPosition[];
  history(id: string): readonly Sample[];
  replay(id: string): void;
  clearReplay(): void;
  replaying(): string | null;
}

const defaultFrame = (callback: () => void) => {
  if (typeof requestAnimationFrame !== 'function') return undefined;
  let handle = 0;
  const loop = () => {
    callback();
    handle = requestAnimationFrame(loop);
  };
  handle = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(handle);
};

export function positionStreamPlugin(options: PositionStreamOptions) {
  const { provider, intervalMs } = options;
  const staleAfterMs = options.staleAfterMs ?? intervalMs * 3;
  const historyMs = options.historyMs ?? 10 * 60_000;
  const clock = options.clock ?? (() => performance.now());

  return definePlugin({
    name: 'position-stream',
    deps: ['floor'],
    async setup(ctx): Promise<PositionStreamApi> {
      const dots = floorOverlay(ctx, 'indoor-positions', [
        {
          id: 'indoor-positions',
          type: 'circle',
          paint: {
            'circle-radius': 4,
            'circle-color': '#2563eb',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1,
          },
        },
      ]);
      const trail = floorOverlay(ctx, 'indoor-trail', [
        { id: 'indoor-trail', type: 'line', paint: { 'line-color': '#f59e0b', 'line-width': 3 } },
      ]);

      const tags = new Map<string, { from: Sample; to: Sample; lastSeen: number }>();
      const histories = new Map<string, Sample[]>();
      let visible: TagPosition[] = [];
      let replaying: string | null = null;

      const drawTrail = () => {
        const samples = replaying ? (histories.get(replaying) ?? []) : [];
        const last = samples.at(-1);
        trail.setData(
          last && samples.length > 1
            ? [
                {
                  type: 'Feature',
                  geometry: { type: 'LineString', coordinates: samples.map((s) => s.coord) },
                  properties: { id: replaying, level_id: last.levelId },
                },
              ]
            : [],
        );
      };

      const receive = (batch: PositionBatch) => {
        const now = clock();
        for (const p of batch.positions) {
          const known = tags.get(p.id);
          const current = known ? interpolatePosition(known.from, known.to, now) : p;
          tags.set(p.id, {
            from: { coord: current.coord, levelId: current.levelId, time: now },
            to: { coord: p.coord, levelId: p.levelId, time: now + intervalMs },
            lastSeen: now,
          });
          const history = histories.get(p.id) ?? [];
          history.push({ coord: p.coord, levelId: p.levelId, time: batch.time });
          while (history.length > 0 && history[0]!.time < batch.time - historyMs) history.shift();
          histories.set(p.id, history);
        }
        if (replaying) drawTrail();
        ctx.events.emit('positions:update', batch);
      };

      const render = (now: number) => {
        const levelId = dots.floor.current().id;
        const features: Feature[] = [];
        visible = [];
        for (const [id, tag] of tags) {
          if (now - tag.lastSeen > staleAfterMs) continue;
          const p = interpolatePosition(tag.from, tag.to, now);
          if (p.levelId !== levelId) continue;
          visible.push({ id, levelId: p.levelId, coord: p.coord });
          features.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: p.coord },
            properties: { id, level_id: p.levelId },
          });
        }
        dots.setData(features);
      };

      ctx.track(provider.subscribe(receive), (off) => off(), 'provider:subscribe');
      // 最后登记的最先释放：先停数据源，再释放订阅和图层
      ctx.track(provider, (p) => p.dispose(), 'provider');
      await provider.start();

      const frame = options.frame ?? defaultFrame;
      const renderInterval = options.renderIntervalMs ?? 50;
      let lastRender = -Infinity;
      const cancel = frame(() => {
        const now = clock();
        if (now - lastRender < renderInterval) return;
        lastRender = now;
        render(now);
      });
      if (cancel) ctx.track(cancel, (c) => c(), 'frame');

      return {
        render,
        count: () => tags.size,
        visible: () => visible,
        history: (id) => histories.get(id) ?? [],
        replay(id) {
          if (!histories.has(id)) throw new Error(`unknown tag "${id}"`);
          replaying = id;
          drawTrail();
        },
        clearReplay() {
          replaying = null;
          drawTrail();
        },
        replaying: () => replaying,
      };
    },
  });
}
