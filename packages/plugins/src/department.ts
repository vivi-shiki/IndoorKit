import { definePlugin } from '@indoorkit/core';
import type { Feature } from 'geojson';
import { floorOverlay } from './overlay';

export interface DepartmentApi {
  setVisible(visible: boolean): void;
  visible(): boolean;
  /** 高亮一个科室，其他科室变淡；null 取消 */
  highlight(departmentId: string | null): void;
  highlighted(): string | null;
}

/** 低饱和的分类色，只用于科室范围的淡色填充，不和状态色冲突 */
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

/** 科室范围：每个科室的区块按科室着色，可显示、隐藏和高亮 */
export const departmentPlugin = definePlugin({
  name: 'department',
  deps: ['floor'],
  setup(ctx): DepartmentApi {
    const departments = ctx.venue.departments;
    // match 至少要有一组分支；没有科室时用固定颜色
    const color =
      departments.length > 0
        ? [
            'match',
            ['get', 'department_id'],
            ...departments.flatMap((d, i) => [d.id, PALETTE[i % PALETTE.length]]),
            '#94a3b8',
          ]
        : '#94a3b8';
    const LAYERS = ['indoor-departments', 'indoor-department-outlines'];
    const overlay = floorOverlay(ctx, 'indoor-departments', [
      {
        id: 'indoor-departments',
        type: 'fill',
        layout: { visibility: 'visible' },
        paint: { 'fill-color': color as unknown as string, 'fill-opacity': 0.22 },
      },
      {
        id: 'indoor-department-outlines',
        type: 'line',
        layout: { visibility: 'visible' },
        paint: { 'line-color': color as unknown as string, 'line-width': 1.5, 'line-opacity': 0.8 },
      },
    ]);
    const features: Feature[] = ctx.venue.features.units.features
      .filter((u) => u.properties.department_id)
      .map((u) => ({
        type: 'Feature',
        geometry: u.geometry,
        properties: {
          id: u.properties.id,
          unit_id: u.properties.id,
          department_id: u.properties.department_id,
          level_id: u.properties.level_id,
        },
      }));
    overlay.setData(features);

    let shown = true;
    let highlighted: string | null = null;
    const applyHighlight = () => {
      const dim = (on: number, off: number) =>
        highlighted ? ['case', ['==', ['get', 'department_id'], highlighted], on, off] : on;
      ctx.map.setPaintProperty('indoor-departments', 'fill-opacity', dim(0.4, 0.06));
      ctx.map.setPaintProperty('indoor-department-outlines', 'line-width', dim(3, 1));
    };
    return {
      setVisible(visible) {
        shown = visible;
        for (const id of LAYERS) ctx.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      },
      visible: () => shown,
      highlight(id) {
        if (id !== null && !departments.some((d) => d.id === id))
          throw new Error(`unknown department "${id}"`);
        highlighted = id;
        applyHighlight();
      },
      highlighted: () => highlighted,
    };
  },
});
