import { definePlugin } from '@indoorkit/core';
import {
  type Alarm,
  type AlarmSubject,
  createAlarmEngine,
  createHospital,
  type DepartmentRule,
  type FenceRule,
} from '@indoorkit/hospital';
import { createVenueIndex, type FloorApi, type PolygonInput, type ShapeApi } from '@indoorkit/plugins';
import type { PositionBatch } from '@indoorkit/rtls';

declare module '@indoorkit/core' {
  interface IndoorEvents {
    'alarm:raise': Alarm;
  }
}

export type FenceInput = Omit<FenceRule, 'levelId'> & {
  /** 楼层 id 或简称；省略时使用当前楼层 */
  floor?: string;
  /** 围栏在地图上的颜色 */
  color?: string;
};

export interface AlarmApi {
  addFence(input: FenceInput): string;
  removeFence(id: string): boolean;
  fences(): readonly FenceRule[];
  /** 打开地图以来产生的全部报警，按时间先后 */
  alarms(): readonly Alarm[];
  check(batch: PositionBatch): Alarm[];
}

/**
 * 把医院的两层报警接到地图上：每次位置上报交给报警引擎检查，报警作为 alarm:raise 事件广播；
 * 自定义围栏用 SDK 的 polygon 插件画出。
 */
export function hospitalAlarmPlugin(options: {
  subjects: Iterable<AlarmSubject>;
  departmentRules: readonly DepartmentRule[];
}) {
  return definePlugin({
    name: 'alarm',
    deps: ['floor', 'polygon'],
    setup(ctx): AlarmApi {
      const floor = ctx.get<FloorApi>('floor');
      const polygons = ctx.get<ShapeApi<PolygonInput>>('polygon');
      const engine = createAlarmEngine({
        hospital: createHospital(ctx.venue, createVenueIndex(ctx.venue)),
        subjects: options.subjects,
        departmentRules: options.departmentRules,
      });
      const raised: Alarm[] = [];
      const check = (batch: PositionBatch) => {
        const alarms = engine.check(batch);
        for (const a of alarms) {
          raised.push(a);
          ctx.events.emit('alarm:raise', a);
        }
        return alarms;
      };
      ctx.on('positions:update', check);
      return {
        addFence({ floor: ref, color, ...input }) {
          const level = ref ? floor.resolve(ref) : floor.current();
          engine.addFence({ ...input, levelId: level.id });
          polygons.add({
            id: input.id,
            coordinates: input.coordinates,
            floor: level.id,
            label: input.label,
            color,
          });
          return input.id;
        },
        removeFence(id) {
          if (!engine.removeFence(id)) return false;
          polygons.remove(id);
          return true;
        },
        fences: engine.fences,
        alarms: () => raised,
        check,
      };
    },
  });
}
