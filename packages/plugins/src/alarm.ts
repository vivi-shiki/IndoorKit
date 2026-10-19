import { definePlugin, type PositionBatch, type TagPosition } from '@indoorkit/core';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Polygon } from 'geojson';
import type { FloorApi } from './floor';
import type { PolygonInput, ShapeApi } from './shapes';
import { createVenueIndex, type VenueIndex } from './venue-index';

/** 报警针对的对象：人员或设备，在数据上一定属于一个科室 */
export interface AlarmSubject {
  id: string;
  kind: 'person' | 'asset';
  role?: string;
  type?: string;
  departmentId: string;
}

/** 规则作用于哪些对象；省略的条件不限制 */
export interface Selector {
  kinds?: AlarmSubject['kind'][];
  roles?: string[];
  types?: string[];
}

export type AlarmLevel = 'high' | 'medium' | 'low';

/** 第一层：科室范围规则 */
export interface DepartmentRule {
  id: string;
  selector: Selector;
  /** outside-own：不在本科室范围内（公共区域或其他科室）；enter-other：进入其他科室范围 */
  when: 'outside-own' | 'enter-other';
  /** outside-own 持续多久才报警，默认立即 */
  graceMs?: number;
  level: AlarmLevel;
}

/** 第二层：自定义围栏规则 */
export interface FenceRule {
  id: string;
  label: string;
  levelId: string;
  /** 闭合环 */
  coordinates: [number, number][];
  rule: 'forbid' | 'dwell' | 'leave';
  selector?: Selector;
  /** 这些科室的对象不受限制 */
  exemptDepartments?: string[];
  /** 只对这个科室的对象生效 */
  departmentId?: string;
  /** dwell：停留多久报警 */
  dwellMs?: number;
  level: AlarmLevel;
}

export interface Alarm {
  id: string;
  time: number;
  subjectId: string;
  layer: 'department' | 'fence' | 'status';
  kind: DepartmentRule['when'] | FenceRule['rule'] | 'offline' | 'sos';
  /** 规则 id；状态报警为 status */
  ruleId: string;
  level: AlarmLevel;
  levelId: string;
  coord: [number, number];
  /** 报警时所在区块和科室范围（公共区域为 null） */
  unitId: string | null;
  departmentId: string | null;
  fenceId?: string;
}

/** 状态报警：设备离线、人员一键求助 */
const STATUS_ALARMS: Record<
  string,
  { kind: Alarm['kind']; level: AlarmLevel; subject: AlarmSubject['kind'] }
> = {
  offline: { kind: 'offline', level: 'medium', subject: 'asset' },
  sos: { kind: 'sos', level: 'high', subject: 'person' },
};

export const matchesSelector = (s: AlarmSubject, sel: Selector | undefined) =>
  !sel ||
  ((!sel.kinds || sel.kinds.includes(s.kind)) &&
    (!sel.roles || (s.role !== undefined && sel.roles.includes(s.role))) &&
    (!sel.types || (s.type !== undefined && sel.types.includes(s.type))));

interface SubjectState {
  departmentId: string | null | undefined;
  outsideSince: number | null;
  outsideRaised: Set<string>;
  /** 围栏 id → 进入时间 */
  fences: Map<string, number>;
  dwellRaised: Set<string>;
  status: string | undefined;
}

export interface AlarmEngine {
  addFence(fence: FenceRule): void;
  removeFence(id: string): boolean;
  fences(): readonly FenceRule[];
  /** 检查一批位置；每个位置先判断科室范围，再判断自定义围栏，状态报警最后 */
  check(batch: PositionBatch): Alarm[];
}

export function createAlarmEngine(options: {
  index: VenueIndex;
  subjects: Iterable<AlarmSubject>;
  departmentRules: readonly DepartmentRule[];
}): AlarmEngine {
  const { index, departmentRules } = options;
  const subjects = new Map([...options.subjects].map((s) => [s.id, s]));
  const fences = new Map<string, FenceRule & { polygon: Polygon }>();
  const states = new Map<string, SubjectState>();
  let seq = 0;

  const fenceApplies = (s: AlarmSubject, f: FenceRule) =>
    matchesSelector(s, f.selector) &&
    !f.exemptDepartments?.includes(s.departmentId) &&
    (f.departmentId === undefined || f.departmentId === s.departmentId);

  const checkOne = (p: TagPosition, time: number, out: Alarm[]) => {
    const subject = subjects.get(p.id);
    if (!subject) return;
    const where = index.locate(p.levelId, p.coord);
    const departmentId = where?.departmentId ?? null;
    const raise = (a: Pick<Alarm, 'layer' | 'kind' | 'ruleId' | 'level'> & { fenceId?: string }) =>
      out.push({
        id: `alarm-${++seq}`,
        time,
        subjectId: p.id,
        levelId: p.levelId,
        coord: p.coord,
        unitId: where?.unitId ?? null,
        departmentId,
        ...a,
      });

    const state: SubjectState = states.get(p.id) ?? {
      departmentId: undefined,
      outsideSince: null,
      outsideRaised: new Set(),
      fences: new Map(),
      dwellRaised: new Set(),
      status: undefined,
    };
    const firstSight = !states.has(p.id);
    states.set(p.id, state);

    // 第一层：科室范围
    const outside = departmentId !== subject.departmentId;
    if (!outside) {
      state.outsideSince = null;
      state.outsideRaised.clear();
    } else state.outsideSince ??= time;
    const entered = departmentId !== null && departmentId !== state.departmentId;
    for (const rule of departmentRules) {
      if (!matchesSelector(subject, rule.selector)) continue;
      const base = { layer: 'department' as const, kind: rule.when, ruleId: rule.id, level: rule.level };
      if (rule.when === 'outside-own') {
        if (
          outside &&
          !state.outsideRaised.has(rule.id) &&
          time - state.outsideSince! >= (rule.graceMs ?? 0)
        ) {
          state.outsideRaised.add(rule.id);
          raise(base);
        }
      } else if (entered && departmentId !== subject.departmentId) raise(base);
    }
    state.departmentId = departmentId;

    // 第二层：自定义围栏
    for (const fence of fences.values()) {
      const inside = fence.levelId === p.levelId && booleanPointInPolygon(p.coord, fence.polygon);
      const since = state.fences.get(fence.id);
      const applies = fenceApplies(subject, fence);
      const base = {
        layer: 'fence' as const,
        kind: fence.rule,
        ruleId: fence.id,
        level: fence.level,
        fenceId: fence.id,
      };
      if (inside) {
        if (since === undefined) {
          state.fences.set(fence.id, time);
          if (applies && fence.rule === 'forbid') raise(base);
        }
        const enteredAt = state.fences.get(fence.id)!;
        if (
          applies &&
          fence.rule === 'dwell' &&
          !state.dwellRaised.has(fence.id) &&
          time - enteredAt >= (fence.dwellMs ?? 0)
        ) {
          state.dwellRaised.add(fence.id);
          raise(base);
        }
      } else if (since !== undefined) {
        state.fences.delete(fence.id);
        state.dwellRaised.delete(fence.id);
        if (applies && fence.rule === 'leave') raise(base);
      }
    }

    // 状态：只在状态变化时报警，第一次看到时不报
    const status = p.status;
    const spec = status ? STATUS_ALARMS[status] : undefined;
    if (!firstSight && status !== state.status && spec && spec.subject === subject.kind) {
      raise({ layer: 'status', kind: spec.kind, ruleId: 'status', level: spec.level });
    }
    state.status = status;
  };

  return {
    addFence(fence) {
      if (fences.has(fence.id)) throw new Error(`fence "${fence.id}" already exists`);
      const ring = fence.coordinates;
      const [first, last] = [ring[0], ring.at(-1)];
      if (ring.length < 4 || !first || !last || first[0] !== last[0] || first[1] !== last[1]) {
        throw new Error(`fence "${fence.id}" must be a closed ring of at least 4 points`);
      }
      fences.set(fence.id, { ...fence, polygon: { type: 'Polygon', coordinates: [ring] } });
    },
    removeFence(id) {
      if (!fences.delete(id)) return false;
      for (const state of states.values()) {
        state.fences.delete(id);
        state.dwellRaised.delete(id);
      }
      return true;
    },
    fences: () => [...fences.values()].map(({ polygon: _, ...f }) => f),
    check(batch) {
      const out: Alarm[] = [];
      for (const p of batch.positions) checkOne(p, batch.time, out);
      return out;
    },
  };
}

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

/** 两层报警：每次位置上报先看科室范围，再看自定义围栏；围栏用 polygon 插件画出 */
export function alarmPlugin(options: {
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
        index: createVenueIndex(ctx.venue),
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
