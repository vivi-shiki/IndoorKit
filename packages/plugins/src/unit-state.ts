import { definePlugin } from '@indoorkit/core';
import { type LabelMap, pickLabel } from '@indoorkit/imdf';
import type { Feature } from 'geojson';
import { floorOverlay } from './overlay';
import { createVenueIndex } from './venue-index';

/** 一组区块的汇总标签：缩小时显示「名称 数量/总数」 */
export interface UnitStateGroupInput {
  id: string;
  label: LabelMap;
  /** 同一层的区块 */
  unitIds: readonly string[];
}

export interface UnitStateGroup {
  id: string;
  levelId: string;
  center: [number, number];
  /** 处于 countStates 之一的区块数 */
  count: number;
  total: number;
  /** 组内按 order 最靠前（最严重）的状态；组内没有状态时为 null */
  worst: string | null;
}

export interface UnitStateOptions {
  /** 状态 → 填充色 */
  colors: Record<string, string>;
  /** 状态从严重到轻微，决定分组标签的颜色；默认按 colors 的顺序 */
  order?: readonly string[];
  /** 标记 → 描边色；标记和状态互相独立（如区块的用途） */
  outlines?: Record<string, string>;
  groups?: {
    items: readonly UnitStateGroupInput[];
    /** 计入「数量」的状态 */
    countStates: readonly string[];
    /** 这个缩放级别以下显示分组标签，默认 19 */
    maxZoom?: number;
  };
}

export interface UnitStateApi {
  /** 替换全部区块的状态 */
  setStates(states: Iterable<readonly [unitId: string, state: string]>): void;
  /** 改一个区块的状态；null 表示不再着色 */
  set(unitId: string, state: string | null): void;
  state(unitId: string): string | null;
  /** 替换全部区块的描边标记 */
  setOutlines(tags: Iterable<readonly [unitId: string, tag: string]>): void;
  /** 加粗描边这些区块；null 取消 */
  highlight(unitIds: readonly string[] | null): void;
  highlighted(): string[];
  /** 当前楼层这个坐标所在的、有状态的区块 */
  unitAt(coord: [number, number]): string | null;
  /** 全部分组的汇总（任何楼层） */
  groups(): readonly UnitStateGroup[];
}

const GRAY = '#6b7280';

const match = (property: string, colors: Record<string, string>) =>
  ['match', ['get', property], ...Object.entries(colors).flat(), GRAY] as unknown as string;

/**
 * 按区块着色：每个区块一个状态，颜色由调用方给出。状态频繁变化时只更新数据，不重建图层。
 * 可选的分组在缩小时把一组区块汇总成一个标签。
 */
export function unitStatePlugin(options: UnitStateOptions) {
  const order = options.order ?? Object.keys(options.colors);
  const rank = (state: string) => {
    const i = order.indexOf(state);
    return i < 0 ? order.length : i;
  };
  const outlineColors = options.outlines ?? {};
  const groupInputs = options.groups?.items ?? [];
  const countStates = new Set(options.groups?.countStates ?? []);
  const maxZoom = options.groups?.maxZoom ?? 19;

  return definePlugin({
    name: 'unit-state',
    deps: ['floor'],
    setup(ctx): UnitStateApi {
      const index = createVenueIndex(ctx.venue);
      const order = new Map(ctx.venue.features.units.features.map((u, i) => [u.properties.id, i]));
      const units = floorOverlay(ctx, 'indoor-unit-states', [
        {
          id: 'indoor-unit-states',
          type: 'fill',
          paint: { 'fill-color': match('state', options.colors), 'fill-opacity': 0.8 },
        },
        {
          id: 'indoor-unit-state-outlines',
          type: 'line',
          paint: {
            'line-color': match('outline', outlineColors),
            'line-width': 2,
            'line-opacity': ['case', ['==', ['get', 'outline'], ''], 0, 1] as unknown as number,
          },
        },
        {
          id: 'indoor-unit-state-highlight',
          type: 'line',
          paint: {
            'line-color': '#111827',
            'line-width': 4,
            'line-opacity': ['case', ['get', 'highlight'], 1, 0] as unknown as number,
          },
        },
      ]);
      const labels = floorOverlay(ctx, 'indoor-unit-state-groups', [
        {
          id: 'indoor-unit-state-groups',
          type: 'symbol',
          maxzoom: maxZoom,
          layout: {
            'text-field': ['get', 'text'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 13,
            // 相邻两区的标签靠得太近时只显示一个，放大后各自出现
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': match('worst', options.colors),
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        },
      ]);

      const groupPlaces = groupInputs.map((g) => {
        const members = g.unitIds.map((id) => index.unit(id));
        const levelId = members[0]?.levelId;
        if (!levelId || members.some((u) => u.levelId !== levelId)) {
          throw new Error(`group "${g.id}" must have units on exactly one floor`);
        }
        const center: [number, number] = [
          members.reduce((s, u) => s + u.center[0], 0) / members.length,
          members.reduce((s, u) => s + u.center[1], 0) / members.length,
        ];
        return { input: g, levelId, center };
      });

      const states = new Map<string, string>();
      let outlines = new Map<string, string>();
      let highlighted = new Set<string>();
      let summary: UnitStateGroup[] = [];

      const draw = () => {
        units.setData(
          [...states]
            .sort(([a], [b]) => order.get(a)! - order.get(b)!)
            .map(([unitId, state]): Feature => {
              const unit = index.unit(unitId);
              return {
                type: 'Feature',
                geometry: unit.geometry,
                properties: {
                  id: unitId,
                  unit_id: unitId,
                  level_id: unit.levelId,
                  state,
                  outline: outlines.get(unitId) ?? '',
                  highlight: highlighted.has(unitId),
                },
              };
            }),
        );
        summary = groupPlaces.map(({ input, levelId, center }) => {
          const present = input.unitIds.flatMap((id) => states.get(id) ?? []);
          return {
            id: input.id,
            levelId,
            center,
            count: present.filter((s) => countStates.has(s)).length,
            total: input.unitIds.length,
            worst: [...present].sort((a, b) => rank(a) - rank(b))[0] ?? null,
          };
        });
        labels.setData(
          summary.map((g, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: g.center },
            properties: {
              id: g.id,
              level_id: g.levelId,
              worst: g.worst ?? '',
              text: `${pickLabel(groupPlaces[i]!.input.label, ctx.languages) ?? g.id} ${g.count}/${g.total}`,
            },
          })),
        );
      };
      ctx.on('language:change', draw);

      const check = (unitId: string, state: string) => {
        index.unit(unitId);
        if (!(state in options.colors)) throw new Error(`unknown state "${state}"`);
      };

      return {
        setStates(next) {
          const entries = [...next];
          for (const [unitId, state] of entries) check(unitId, state);
          states.clear();
          for (const [unitId, state] of entries) states.set(unitId, state);
          draw();
        },
        set(unitId, state) {
          if (state === null) {
            index.unit(unitId);
            states.delete(unitId);
          } else {
            check(unitId, state);
            states.set(unitId, state);
          }
          draw();
        },
        state: (unitId) => states.get(unitId) ?? null,
        setOutlines(tags) {
          const entries = [...tags];
          for (const [unitId, tag] of entries) {
            index.unit(unitId);
            if (!(tag in outlineColors)) throw new Error(`unknown outline "${tag}"`);
          }
          outlines = new Map(entries);
          draw();
        },
        highlight(ids) {
          for (const id of ids ?? []) index.unit(id);
          highlighted = new Set(ids ?? []);
          draw();
        },
        highlighted: () => [...highlighted],
        unitAt(coord) {
          const where = index.locate(units.floor.current().id, coord);
          return where && states.has(where.unitId) ? where.unitId : null;
        },
        groups: () => summary,
      };
    },
  });
}
