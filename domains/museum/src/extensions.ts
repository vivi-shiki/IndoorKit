import {
  collection,
  defineImdfExtension,
  feature,
  type LabelMap,
  labels,
  type RawCollection,
  uuid,
  type VenueModel,
} from '@indoorkit/imdf';
import { z } from 'zod';

/**
 * 博物馆的五个 IMDF 扩展文件：
 * - museum-space.json：展区（常设展、企划展）和馆方关心的每个房间（用途、是否公开、定员、出入口）；
 * - museum-case.json：展示柜（柜本身是房间里的小区块）；
 * - museum-object.json：藏品（材质敏感度、文化财指定、状态、所在展示柜或库房）；
 * - museum-device.json：传感器、计数相机、信标、RFID 读写器的位置和监测对象；
 * - museum-route.json：警卫巡逻路线和来馆者导览路线（跨楼层的点序列）。
 */

/** 对光和湿度的敏感程度：纸本和染织最敏感，金属和石材最不敏感 */
export const SENSITIVITIES = ['high', 'medium', 'low'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export const ROOM_KINDS = [
  'gallery',
  'special',
  'storage',
  'fumigation',
  'loading',
  'office',
  'lobby',
  'shop',
  'cafe',
  'lounge',
  'core',
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

/** public：来馆者可以进入；staff：只有职员（库房、办公室） */
export const ACCESS = ['public', 'staff'] as const;
export type Access = (typeof ACCESS)[number];

export const EXHIBITION_KINDS = ['permanent', 'special'] as const;
export type ExhibitionKind = (typeof EXHIBITION_KINDS)[number];

/** 壁柜、独立柜、单品柜 */
export const CASE_KINDS = ['wall', 'freestanding', 'single'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];

export const MATERIALS = [
  'paper',
  'textile',
  'painting',
  'lacquer',
  'wood',
  'ceramic',
  'metal',
  'stone',
] as const;
export type Material = (typeof MATERIALS)[number];

export const OBJECT_STATUSES = ['display', 'storage', 'loan', 'conservation'] as const;
export type ObjectStatus = (typeof OBJECT_STATUSES)[number];

export const DEVICE_KINDS = [
  'climate',
  'light',
  'co2',
  'counter',
  'beacon',
  'motion',
  'door',
  'vibration',
  'proximity',
  'rfid',
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const ROUTE_KINDS = ['patrol', 'tour'] as const;
export type RouteKind = (typeof ROUTE_KINDS)[number];

const coord = z.tuple([z.number(), z.number()]);
const point = z.object({ type: z.literal('Point'), coordinates: coord });

export const exhibitionFeature = feature('museum_exhibition', z.null(), {
  code: z.string().min(1),
  name: labels,
  kind: z.enum(EXHIBITION_KINDS),
});

export const roomFeature = feature('museum_room', z.null(), {
  unit_id: uuid,
  code: z.string().min(1),
  kind: z.enum(ROOM_KINDS),
  access: z.enum(ACCESS),
  /** 展示室的定员；没有定员的房间为 null */
  capacity: z.number().int().positive().nullable(),
  exhibition: z.string().nullable(),
  /** 门口（房间一侧）和门外走廊上的点，来馆者和警卫都从这里进出 */
  door: coord,
  hall: coord,
});

export const caseFeature = feature('museum_case', z.null(), {
  unit_id: uuid,
  code: z.string().min(1),
  room_id: uuid,
  kind: z.enum(CASE_KINDS),
  /** 气密展示柜：柜内湿度比展示室稳定 */
  sealed: z.boolean(),
});

export const objectFeature = feature('museum_object', z.null(), {
  code: z.string().min(1),
  title: labels,
  artist: labels,
  period: labels,
  material: z.enum(MATERIALS),
  /** 重要文化财（虚构）：一年里能公开的天数有上限 */
  designated: z.boolean(),
  status: z.enum(OBJECT_STATUSES),
  /** 所在的展示柜或库房的区块；借出中为 null */
  location: uuid.nullable(),
  /** 同一系列的藏品可以互相替换展出 */
  series: z.string().nullable(),
});

export const deviceFeature = feature('museum_device', point, {
  code: z.string().min(1),
  kind: z.enum(DEVICE_KINDS),
  level_id: uuid,
  /** 监测的房间或展示柜 */
  unit_id: uuid,
});

export const routeFeature = feature('museum_route', z.null(), {
  code: z.string().min(1),
  kind: z.enum(ROUTE_KINDS),
  name: labels,
  /** 导览的参考时间；巡逻为一圈的时间 */
  minutes: z.number().positive(),
  path: z.array(z.object({ level_id: uuid, coord })).min(2),
  /** 路线上停留的地方：导览是展示室，巡逻是检查点（带编号） */
  stops: z.array(z.object({ unit_id: uuid, index: z.number().int().nonnegative(), code: z.string() })),
});

export interface ExhibitionModel {
  id: string;
  code: string;
  name: LabelMap;
  kind: ExhibitionKind;
}

export interface RoomModel {
  id: string;
  unitId: string;
  code: string;
  kind: RoomKind;
  access: Access;
  capacity: number | null;
  exhibition: string | null;
  door: [number, number];
  hall: [number, number];
}

export interface CaseModel {
  unitId: string;
  code: string;
  roomId: string;
  kind: CaseKind;
  sealed: boolean;
}

export interface ObjectModel {
  id: string;
  code: string;
  title: LabelMap;
  artist: LabelMap;
  period: LabelMap;
  material: Material;
  designated: boolean;
  status: ObjectStatus;
  location: string | null;
  series: string | null;
}

export interface DeviceModel {
  id: string;
  code: string;
  kind: DeviceKind;
  levelId: string;
  unitId: string;
  coord: [number, number];
}

export interface RoutePoint {
  levelId: string;
  coord: [number, number];
}

export interface RouteModel {
  id: string;
  code: string;
  kind: RouteKind;
  name: LabelMap;
  minutes: number;
  path: RoutePoint[];
  stops: { unitId: string; index: number; code: string }[];
}

type Issue = { path: string; message: string };
type Raw = RawCollection['features'][number];

const unitIds = (archive: { unit: RawCollection }) => new Set(archive.unit.features.map((u) => u.id));

const spaceFile = collection(z.union([exhibitionFeature, roomFeature]));
const isRoom = (f: Raw) => f.feature_type === 'museum_room';

export const museumSpaceExtension = defineImdfExtension({
  file: 'museum-space',
  schema: spaceFile,
  check(space, archive) {
    const units = unitIds(archive);
    const exhibitions = new Set(space.features.filter((f) => !isRoom(f)).map((f) => f.properties.code));
    const issues: Issue[] = [];
    const seen = new Set<string>();
    for (const f of space.features.filter(isRoom)) {
      const p = f.properties;
      if (!units.has(p.unit_id)) issues.push({ path: f.id, message: `unknown unit ${p.unit_id}` });
      if (seen.has(p.unit_id)) issues.push({ path: f.id, message: `unit ${p.unit_id} is listed twice` });
      seen.add(p.unit_id);
      if (p.exhibition !== null && !exhibitions.has(p.exhibition))
        issues.push({ path: f.id, message: `unknown exhibition ${p.exhibition}` });
    }
    return issues;
  },
  build: (space): { exhibitions: ExhibitionModel[]; rooms: RoomModel[] } => ({
    exhibitions: space.features
      .filter((f) => !isRoom(f))
      .map((f) => ({ id: f.id, code: f.properties.code, name: f.properties.name, kind: f.properties.kind })),
    rooms: space.features.filter(isRoom).map((f) => {
      const p = f.properties;
      return {
        id: f.id,
        unitId: p.unit_id,
        code: p.code,
        kind: p.kind,
        access: p.access,
        capacity: p.capacity,
        exhibition: p.exhibition,
        door: p.door,
        hall: p.hall,
      };
    }),
  }),
});

export const museumCaseExtension = defineImdfExtension({
  file: 'museum-case',
  schema: collection(caseFeature),
  check(cases, archive) {
    const units = new Map(archive.unit.features.map((u) => [u.id, u]));
    const issues: Issue[] = [];
    for (const f of cases.features) {
      const p = f.properties;
      const unit = units.get(p.unit_id);
      const room = units.get(p.room_id);
      if (!unit) issues.push({ path: f.id, message: `unknown unit ${p.unit_id}` });
      if (!room) issues.push({ path: f.id, message: `unknown room ${p.room_id}` });
      if (unit && room && unit.properties.level_id !== room.properties.level_id)
        issues.push({ path: f.id, message: 'a case must be on the floor of its room' });
    }
    return issues;
  },
  build: (cases): CaseModel[] =>
    cases.features.map((f) => ({
      unitId: f.properties.unit_id,
      code: f.properties.code,
      roomId: f.properties.room_id,
      kind: f.properties.kind,
      sealed: f.properties.sealed,
    })),
});

export const museumObjectExtension = defineImdfExtension({
  file: 'museum-object',
  schema: collection(objectFeature),
  check(objects, archive) {
    const units = unitIds(archive);
    const issues: Issue[] = [];
    const codes = new Set<string>();
    for (const f of objects.features) {
      const p = f.properties;
      if (codes.has(p.code)) issues.push({ path: f.id, message: `duplicate object code ${p.code}` });
      codes.add(p.code);
      if (p.location === null && p.status !== 'loan')
        issues.push({ path: f.id, message: 'only an object on loan may have no location' });
      if (p.location !== null && !units.has(p.location))
        issues.push({ path: f.id, message: `unknown location ${p.location}` });
    }
    return issues;
  },
  build: (objects): ObjectModel[] =>
    objects.features.map((f) => {
      const p = f.properties;
      return {
        id: f.id,
        code: p.code,
        title: p.title,
        artist: p.artist,
        period: p.period,
        material: p.material,
        designated: p.designated,
        status: p.status,
        location: p.location,
        series: p.series,
      };
    }),
});

export const museumDeviceExtension = defineImdfExtension({
  file: 'museum-device',
  schema: collection(deviceFeature),
  check(devices, archive) {
    const levels = new Set(archive.level.features.map((l) => l.id));
    const units = unitIds(archive);
    const issues: Issue[] = [];
    for (const d of devices.features) {
      if (!levels.has(d.properties.level_id))
        issues.push({ path: d.id, message: `unknown level ${d.properties.level_id}` });
      if (!units.has(d.properties.unit_id))
        issues.push({ path: d.id, message: `unknown unit ${d.properties.unit_id}` });
    }
    return issues;
  },
  build: (devices): DeviceModel[] =>
    devices.features.map((d) => ({
      id: d.id,
      code: d.properties.code,
      kind: d.properties.kind,
      levelId: d.properties.level_id,
      unitId: d.properties.unit_id,
      coord: (d.geometry as GeoJSON.Point).coordinates as [number, number],
    })),
});

export const museumRouteExtension = defineImdfExtension({
  file: 'museum-route',
  schema: collection(routeFeature),
  check(routes, archive) {
    const levels = new Set(archive.level.features.map((l) => l.id));
    const units = unitIds(archive);
    const issues: Issue[] = [];
    for (const r of routes.features) {
      const p = r.properties;
      for (const point of p.path as { level_id: string }[])
        if (!levels.has(point.level_id))
          issues.push({ path: r.id, message: `unknown level ${point.level_id}` });
      for (const stop of p.stops as { unit_id: string; index: number }[]) {
        if (!units.has(stop.unit_id)) issues.push({ path: r.id, message: `unknown unit ${stop.unit_id}` });
        if (stop.index >= p.path.length)
          issues.push({ path: r.id, message: `stop index ${stop.index} is off the path` });
      }
    }
    return issues;
  },
  build: (routes): RouteModel[] =>
    routes.features.map((r) => {
      const p = r.properties;
      return {
        id: r.id,
        code: p.code,
        kind: p.kind,
        name: p.name,
        minutes: p.minutes,
        path: (p.path as { level_id: string; coord: [number, number] }[]).map((x) => ({
          levelId: x.level_id,
          coord: x.coord,
        })),
        stops: (p.stops as { unit_id: string; index: number; code: string }[]).map((s) => ({
          unitId: s.unit_id,
          index: s.index,
          code: s.code,
        })),
      };
    }),
});

export const museumExtensions = [
  museumSpaceExtension,
  museumCaseExtension,
  museumObjectExtension,
  museumDeviceExtension,
  museumRouteExtension,
] as const;

/** 带五个博物馆扩展的场馆 */
export type MuseumVenue = VenueModel<{
  'museum-space': { exhibitions: ExhibitionModel[]; rooms: RoomModel[] };
  'museum-case': CaseModel[];
  'museum-object': ObjectModel[];
  'museum-device': DeviceModel[];
  'museum-route': RouteModel[];
}>;
