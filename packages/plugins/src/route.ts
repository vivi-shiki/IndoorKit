import { definePlugin } from '@indoorkit/core';
import type { LevelModel } from '@indoorkit/imdf';
import type { Feature } from 'geojson';
import { distanceMeters, floorOverlay } from './overlay';

export interface RoutePointInput {
  /** 楼层 id 或简称 */
  floor: string;
  coord: [number, number];
}

export interface RouteApi {
  /** 替换路线；相邻两点楼层不同的地方是换层点 */
  set(points: readonly RoutePointInput[]): void;
  clear(): void;
  /** 路线经过的楼层 id，按经过的先后，不重复相邻 */
  levels(): string[];
  /** 平面上的总长度（米），换层处不计高度 */
  length(): number;
}

const short = (level: LevelModel) => level.shortName.en ?? Object.values(level.shortName)[0] ?? level.id;

/**
 * 跨楼层路线：每层画自己那一段，起点、终点和换层点画成圆点，换层点标出要去（或来自）的楼层。
 * 路线怎么算由调用方决定，插件只负责显示。
 */
export function routePlugin(options: { color?: string } = {}) {
  const color = options.color ?? '#2563eb';
  return definePlugin({
    name: 'route',
    deps: ['floor'],
    setup(ctx): RouteApi {
      const lines = floorOverlay(ctx, 'indoor-route', [
        {
          id: 'indoor-route',
          type: 'line',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': 5, 'line-opacity': 0.9 },
        },
      ]);
      const points = floorOverlay(ctx, 'indoor-route-points', [
        {
          id: 'indoor-route-points',
          type: 'circle',
          paint: {
            'circle-radius': ['match', ['get', 'kind'], 'transition', 9, 7] as unknown as number,
            'circle-color': ['match', ['get', 'kind'], 'end', '#dc2626', color] as unknown as string,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        },
        {
          id: 'indoor-route-labels',
          type: 'symbol',
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
            'text-offset': [0, 1.4],
            'text-anchor': 'top',
            'text-allow-overlap': true,
          },
          paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
        },
      ]);

      let route: { level: LevelModel; coord: [number, number] }[] = [];
      const draw = () => {
        const segments: Feature[] = [];
        const marks: Feature[] = [];
        const mark = (kind: string, level: LevelModel, coord: [number, number], label = '') =>
          marks.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: { id: `${kind}-${marks.length}`, kind, label, level_id: level.id },
          });
        let run: [number, number][] = [];
        route.forEach((p, i) => {
          run.push(p.coord);
          const next = route[i + 1];
          if (next && next.level.id === p.level.id) return;
          if (run.length >= 2) {
            segments.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: run },
              properties: { id: `segment-${segments.length}`, level_id: p.level.id },
            });
          }
          run = [];
          if (next) {
            const arrow = (from: LevelModel, to: LevelModel) =>
              `${to.ordinal >= from.ordinal ? '↑' : '↓'} ${short(to)}`;
            mark('transition', p.level, p.coord, arrow(p.level, next.level));
            mark('transition', next.level, next.coord, arrow(next.level, p.level));
          }
        });
        if (route.length > 0) {
          const first = route[0]!;
          const last = route.at(-1)!;
          marks.unshift({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: first.coord },
            properties: { id: 'start', kind: 'start', label: '', level_id: first.level.id },
          });
          mark('end', last.level, last.coord);
        }
        lines.setData(segments);
        points.setData(marks);
      };

      return {
        set(input) {
          if (input.length < 2) throw new Error('a route needs at least two points');
          route = input.map((p) => ({ level: lines.floor.resolve(p.floor), coord: p.coord }));
          draw();
        },
        clear() {
          route = [];
          draw();
        },
        levels: () => route.map((p) => p.level.id).filter((id, i, all) => id !== all[i - 1]),
        length: () =>
          route.reduce((sum, p, i) => (i === 0 ? 0 : sum + distanceMeters(route[i - 1]!.coord, p.coord)), 0),
      };
    },
  });
}
