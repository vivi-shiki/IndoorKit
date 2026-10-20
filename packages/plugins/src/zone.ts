import { definePlugin } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { floorOverlay } from './overlay';

/** 一组区块，物理范围是这些区块的并集（如部门、租户、片区） */
export interface ZoneInput {
  id: string;
  unitIds: readonly string[];
}

export interface ZoneApi {
  setVisible(visible: boolean): void;
  visible(): boolean;
  /** 高亮一个区域，其他区域变淡；null 取消 */
  highlight(zoneId: string | null): void;
  highlighted(): string | null;
}

/** 低饱和的分类色，只用于区域范围的淡色填充，不和状态色冲突 */
const PALETTE = [
  '#60a5fa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#2dd4bf',
  '#fb923c',
  '#94a3b8',
  '#4ade80',
  '#c084fc',
  '#38bdf8',
];
const FALLBACK = '#94a3b8';
const LAYERS = ['indoor-zones', 'indoor-zone-outlines'];

/** 区域范围：每个区域的区块按区域着色，可显示、隐藏和高亮 */
export function zonePlugin(options: { zones: readonly ZoneInput[]; palette?: readonly string[] }) {
  const palette = options.palette ?? PALETTE;
  return definePlugin({
    name: 'zone',
    deps: ['floor'],
    setup(ctx): ZoneApi {
      const units = new Map(ctx.venue.features.units.features.map((u) => [u.properties.id, u]));
      const zoneIds = new Set(options.zones.map((z) => z.id));
      // match 至少要有一组分支；没有区域时用固定颜色
      const color =
        options.zones.length > 0
          ? [
              'match',
              ['get', 'zone_id'],
              ...options.zones.flatMap((z, i) => [z.id, palette[i % palette.length]]),
              FALLBACK,
            ]
          : FALLBACK;
      const overlay = floorOverlay(ctx, 'indoor-zones', [
        {
          id: 'indoor-zones',
          type: 'fill',
          layout: { visibility: 'visible' },
          paint: { 'fill-color': color as unknown as string, 'fill-opacity': 0.22 },
        },
        {
          id: 'indoor-zone-outlines',
          type: 'line',
          layout: { visibility: 'visible' },
          paint: { 'line-color': color as unknown as string, 'line-width': 1.5, 'line-opacity': 0.8 },
        },
      ]);
      const features: Feature[] = options.zones.flatMap((zone) =>
        zone.unitIds.map((unitId): Feature => {
          const unit = units.get(unitId);
          if (!unit) throw new Error(`zone "${zone.id}" has an unknown unit "${unitId}"`);
          return {
            type: 'Feature',
            geometry: unit.geometry,
            properties: { id: unitId, unit_id: unitId, zone_id: zone.id, level_id: unit.properties.level_id },
          };
        }),
      );
      overlay.setData(features);

      let shown = true;
      let highlighted: string | null = null;
      const applyHighlight = () => {
        const dim = (on: number, off: number) =>
          highlighted ? ['case', ['==', ['get', 'zone_id'], highlighted], on, off] : on;
        ctx.map.setPaintProperty('indoor-zones', 'fill-opacity', dim(0.4, 0.06));
        ctx.map.setPaintProperty('indoor-zone-outlines', 'line-width', dim(3, 1));
      };
      return {
        setVisible(visible) {
          shown = visible;
          for (const id of LAYERS) ctx.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        },
        visible: () => shown,
        highlight(id) {
          if (id !== null && !zoneIds.has(id)) throw new Error(`unknown zone "${id}"`);
          highlighted = id;
          applyHighlight();
        },
        highlighted: () => highlighted,
      };
    },
  });
}
