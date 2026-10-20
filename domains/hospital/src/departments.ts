import {
  collection,
  defineImdfExtension,
  feature,
  type LabelMap,
  labels,
  uuid,
  type VenueModel,
} from '@indoorkit/imdf';
import { z } from 'zod';

/**
 * 科室：一组区块的集合。IMDF 的 unit 只能属于一层，而一个科室可以跨楼层，
 * 所以用 IMDF 之外的 department.json 列出科室包含的区块。
 */
export const departmentFeature = feature('department', z.null(), {
  code: z.string().min(1),
  name: labels,
  unit_ids: z.array(uuid).min(1),
});

export interface DepartmentModel {
  id: string;
  /** 稳定的英文代码，如 internal、icu */
  code: string;
  name: LabelMap;
  unitIds: string[];
}

export const departmentExtension = defineImdfExtension({
  file: 'department',
  schema: collection(departmentFeature),
  check(departments, archive) {
    const unitIds = new Set(archive.unit.features.map((u) => u.id));
    const owners = new Map<string, string>();
    const issues: { path: string; message: string }[] = [];
    for (const d of departments.features) {
      for (const id of (d.properties.unit_ids as string[] | undefined) ?? []) {
        if (!unitIds.has(id)) issues.push({ path: d.id, message: `unknown unit ${id}` });
        const owner = owners.get(id);
        if (owner) issues.push({ path: d.id, message: `unit ${id} already belongs to ${owner}` });
        else owners.set(id, d.id);
      }
    }
    return issues;
  },
  build: (departments): DepartmentModel[] =>
    departments.features.map((d) => ({
      id: d.id,
      code: d.properties.code as string,
      name: d.properties.name as LabelMap,
      unitIds: d.properties.unit_ids as string[],
    })),
});

/** 带科室扩展的场馆 */
export type HospitalVenue = VenueModel<{ department: DepartmentModel[] }>;

/** 场馆里的科室；场馆必须用 departmentExtension 读取 */
export function departmentsOf(venue: VenueModel): DepartmentModel[] {
  const departments = venue.extensions.department as DepartmentModel[] | undefined;
  if (!departments) throw new Error('the venue was loaded without the department extension');
  return departments;
}

/** 医院的位置：所在区块，以及区块所属科室（公共区域为 null） */
export interface HospitalLocation {
  unitId: string;
  departmentId: string | null;
}

export interface Hospital {
  readonly departments: readonly DepartmentModel[];
  department(id: string): DepartmentModel;
  departmentByCode(code: string): DepartmentModel;
  departmentOfUnit(unitId: string): string | null;
  /** 科室覆盖的楼层，按楼层从低到高 */
  departmentLevels(id: string): string[];
  /** 点所在的区块和科室；不在任何区块里时为 null */
  locate(levelId: string, coord: [number, number]): HospitalLocation | null;
  /** 科室范围，交给地图的区域插件显示 */
  zones(): { id: string; unitIds: string[] }[];
}

/** 由场馆和区块查询（如 SDK 的 createVenueIndex）组成医院的科室查询 */
export function createHospital(
  venue: VenueModel,
  units: { locate(levelId: string, coord: [number, number]): { unitId: string } | null },
): Hospital {
  const departments = departmentsOf(venue);
  const byId = new Map(departments.map((d) => [d.id, d]));
  const byCode = new Map(departments.map((d) => [d.code, d]));
  const ofUnit = new Map(departments.flatMap((d) => d.unitIds.map((u) => [u, d.id] as const)));
  const levelOfUnit = new Map(
    venue.features.units.features.map((u) => [u.properties.id, u.properties.level_id]),
  );
  const ordinal = new Map(venue.levels.map((l) => [l.id, l.ordinal]));
  const get = <T>(map: Map<string, T>, key: string) => {
    const value = map.get(key);
    if (!value) throw new Error(`unknown department "${key}"`);
    return value;
  };
  return {
    departments,
    department: (id) => get(byId, id),
    departmentByCode: (code) => get(byCode, code),
    departmentOfUnit: (unitId) => ofUnit.get(unitId) ?? null,
    departmentLevels(id) {
      const levels = new Set(get(byId, id).unitIds.flatMap((u) => levelOfUnit.get(u) ?? []));
      return [...levels].sort((a, b) => (ordinal.get(a) ?? 0) - (ordinal.get(b) ?? 0));
    },
    locate(levelId, coord) {
      const where = units.locate(levelId, coord);
      return where && { unitId: where.unitId, departmentId: ofUnit.get(where.unitId) ?? null };
    },
    zones: () => departments.map((d) => ({ id: d.id, unitIds: [...d.unitIds] })),
  };
}
