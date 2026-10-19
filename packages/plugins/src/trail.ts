import { definePlugin } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { distanceMeters, floorOverlay } from './overlay';
import { interpolatePosition, type Sample } from './position-stream';

export interface Stop {
  start: number;
  end: number;
  durationMs: number;
  levelId: string;
  /** 停留期间中间那个样本的位置：开头常是刚从走廊走进来的一步 */
  coord: [number, number];
}

/** 停留点：连续若干样本都在第一个样本 radius 米内、同一楼层，且持续不少于 minMs */
export function detectStops(
  samples: readonly Sample[],
  options: { radiusMeters: number; minMs: number },
): Stop[] {
  const stops: Stop[] = [];
  let i = 0;
  while (i < samples.length) {
    const first = samples[i]!;
    let j = i;
    while (
      j + 1 < samples.length &&
      samples[j + 1]!.levelId === first.levelId &&
      distanceMeters(first.coord, samples[j + 1]!.coord) <= options.radiusMeters
    )
      j++;
    const end = samples[j]!.time;
    if (j > i && end - first.time >= options.minMs) {
      stops.push({
        start: first.time,
        end,
        durationMs: end - first.time,
        levelId: first.levelId,
        coord: samples[Math.ceil((i + j) / 2)]!.coord,
      });
      i = j + 1;
    } else i++;
  }
  return stops;
}

export interface TrailApi {
  set(samples: readonly Sample[]): void;
  clear(): void;
  /** 把播放头移到某一时刻，超出范围时取边界 */
  seek(time: number): void;
  time(): number;
  range(): [number, number];
  /** 播放头位置；没有轨迹时为 null */
  position(): { coord: [number, number]; levelId: string } | null;
  stops(): readonly Stop[];
}

/** 历史轨迹回放：整条轨迹、已播放部分、停留点和播放头，按当前楼层显示 */
export function trailPlugin(options: { stopRadiusMeters: number; stopMinMs: number }) {
  return definePlugin({
    name: 'trail',
    deps: ['floor'],
    setup(ctx): TrailApi {
      const path = floorOverlay(ctx, 'indoor-trail-path', [
        {
          id: 'indoor-trail-path',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#94a3b8', 'line-width': 3, 'line-dasharray': [2, 1] },
        },
      ]);
      const played = floorOverlay(ctx, 'indoor-trail-played', [
        {
          id: 'indoor-trail-played',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#f59e0b', 'line-width': 4 },
        },
      ]);
      const stopsLayer = floorOverlay(ctx, 'indoor-trail-stops', [
        {
          id: 'indoor-trail-stops',
          type: 'circle',
          paint: {
            'circle-color': '#0ea5e9',
            'circle-opacity': 0.5,
            'circle-radius': ['interpolate', ['linear'], ['get', 'minutes'], 0, 6, 10, 16],
            'circle-stroke-color': '#0369a1',
            'circle-stroke-width': 1,
          },
        },
      ]);
      const head = floorOverlay(ctx, 'indoor-trail-head', [
        {
          id: 'indoor-trail-head',
          type: 'circle',
          paint: {
            'circle-color': '#dc2626',
            'circle-radius': 7,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        },
      ]);

      let samples: readonly Sample[] = [];
      let stops: Stop[] = [];
      let now = 0;

      /** 按楼层连续的样本切成几段线 */
      const segments = (list: readonly { coord: [number, number]; levelId: string }[]): Feature[] => {
        const out: Feature[] = [];
        let run: { coord: [number, number]; levelId: string }[] = [];
        const flush = () => {
          if (run.length > 1)
            out.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: run.map((s) => s.coord) },
              properties: { level_id: run[0]!.levelId },
            });
        };
        for (const s of list) {
          if (run.length > 0 && run[0]!.levelId !== s.levelId) {
            flush();
            run = [];
          }
          run.push(s);
        }
        flush();
        return out;
      };

      const at = (t: number) => {
        const k = samples.findIndex((s) => s.time > t);
        if (k === 0) return { coord: samples[0]!.coord, levelId: samples[0]!.levelId };
        if (k < 0) return { coord: samples.at(-1)!.coord, levelId: samples.at(-1)!.levelId };
        return interpolatePosition(samples[k - 1]!, samples[k]!, t);
      };

      const draw = () => {
        if (samples.length === 0) {
          for (const o of [path, played, stopsLayer, head]) o.setData([]);
          return;
        }
        const p = at(now);
        played.setData(segments([...samples.filter((s) => s.time <= now), p]));
        head.setData([
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: p.coord },
            properties: { level_id: p.levelId },
          },
        ]);
      };

      return {
        set(next) {
          samples = [...next].sort((a, b) => a.time - b.time);
          stops = detectStops(samples, { radiusMeters: options.stopRadiusMeters, minMs: options.stopMinMs });
          now = samples[0]?.time ?? 0;
          path.setData(segments(samples));
          stopsLayer.setData(
            stops.map((s) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: s.coord },
              properties: { level_id: s.levelId, minutes: s.durationMs / 60_000 },
            })),
          );
          draw();
        },
        clear() {
          samples = [];
          stops = [];
          draw();
        },
        seek(t) {
          if (samples.length === 0) throw new Error('no trail to seek');
          now = Math.min(Math.max(t, samples[0]!.time), samples.at(-1)!.time);
          draw();
        },
        time: () => now,
        range: () => (samples.length ? [samples[0]!.time, samples.at(-1)!.time] : [0, 0]),
        position: () => (samples.length ? at(now) : null),
        stops: () => stops,
      };
    },
  });
}
