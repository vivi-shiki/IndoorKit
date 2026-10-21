import type { LabelMap, VenueModel } from '@indoorkit/imdf';
import type {
  CaseModel,
  DeviceKind,
  DeviceModel,
  ExhibitionModel,
  MuseumVenue,
  ObjectModel,
  RoomModel,
  RouteModel,
  RoutePoint,
  Sensitivity,
} from './extensions';
import { type ConservationStandard, MATERIAL_SENSITIVITY, STANDARDS, strictest } from './standards';

export interface Room extends RoomModel {
  levelId: string;
  name: LabelMap;
  /** 外包矩形的中心 */
  center: [number, number];
}

export interface Case extends CaseModel {
  levelId: string;
  center: [number, number];
}

export type MuseumObject = ObjectModel;
export type Device = DeviceModel;
export type Exhibition = ExhibitionModel;
export type Route = RouteModel;

export interface Museum {
  readonly venue: VenueModel;
  readonly exhibitions: readonly Exhibition[];
  /** 按扩展文件里的顺序 */
  readonly rooms: readonly Room[];
  readonly cases: readonly Case[];
  readonly objects: readonly MuseumObject[];
  readonly devices: readonly Device[];
  readonly routes: readonly Route[];
  /** 房间或展示柜（按区块 id） */
  room(unitId: string): Room;
  roomByCode(code: string): Room;
  case(unitId: string): Case;
  caseByCode(code: string): Case;
  isCase(unitId: string): boolean;
  object(id: string): MuseumObject;
  objectByCode(code: string): MuseumObject;
  device(id: string): Device;
  deviceByCode(code: string): Device;
  devicesOf(kind: DeviceKind): Device[];
  /** 监测这个房间或展示柜的设备 */
  devicesAt(unitId: string): Device[];
  route(code: string): Route;
  /** 展示柜所在的房间；房间返回自己 */
  roomOf(unitId: string): Room;
  casesIn(roomUnitId: string): Case[];
  /** 放在这个展示柜或库房里的藏品；房间也包括它的展示柜里的 */
  objectsAt(unitId: string): MuseumObject[];
  sensitivityOf(object: MuseumObject): Sensitivity;
  /** 房间或展示柜要遵守的标准：里面最敏感的藏品决定；空的按低敏感度 */
  standardOf(unitId: string): { sensitivity: Sensitivity; standard: ConservationStandard };
  /** 两个房间或展示柜之间的步行路线：出门、沿走廊、经楼梯或电梯换层、进门 */
  walkPath(fromUnit: string, toUnit: string): RoutePoint[];
}

const lookup = <T>(map: Map<string, T>, key: string, what: string) => {
  const value = map.get(key);
  if (!value) throw new Error(`unknown ${what} "${key}"`);
  return value;
};

function centerOf(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const points = rings.flatMap((r) => r[0]!);
  const xs = points.map((p) => p[0]!);
  const ys = points.map((p) => p[1]!);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** 博物馆的房间、展示柜、藏品、设备和路线；场馆必须用 museumExtensions 读取 */
export function createMuseum(venue: VenueModel): Museum {
  const ext = (venue as MuseumVenue).extensions;
  const space = ext['museum-space'];
  const caseModels = ext['museum-case'];
  const objects = ext['museum-object'];
  const devices = ext['museum-device'];
  const routes = ext['museum-route'];
  if (!space || !caseModels || !objects || !devices || !routes)
    throw new Error('the venue was loaded without the museum extensions');

  const units = new Map(venue.features.units.features.map((u) => [u.properties.id, u]));
  const unitOf = (id: string) => lookup(units, id, 'unit');
  const nameOf = (id: string): LabelMap => {
    const name: LabelMap = {};
    for (const [key, value] of Object.entries(unitOf(id).properties)) {
      if (key.startsWith('label_')) name[key.slice(6)] = value as string;
    }
    return name;
  };

  const rooms: Room[] = space.rooms.map((r) => {
    const unit = unitOf(r.unitId);
    return {
      ...r,
      levelId: unit.properties.level_id,
      name: nameOf(r.unitId),
      center: centerOf(unit.geometry),
    };
  });
  const cases: Case[] = caseModels.map((c) => {
    const unit = unitOf(c.unitId);
    return { ...c, levelId: unit.properties.level_id, center: centerOf(unit.geometry) };
  });

  const roomById = new Map(rooms.map((r) => [r.unitId, r]));
  const roomByCode = new Map(rooms.map((r) => [r.code, r]));
  const caseById = new Map(cases.map((c) => [c.unitId, c]));
  const caseByCode = new Map(cases.map((c) => [c.code, c]));
  const objectById = new Map(objects.map((o) => [o.id, o]));
  const objectByCode = new Map(objects.map((o) => [o.code, o]));
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const deviceByCode = new Map(devices.map((d) => [d.code, d]));
  const routeByCode = new Map(routes.map((r) => [r.code, r]));
  const casesByRoom = new Map<string, Case[]>();
  for (const c of cases) casesByRoom.set(c.roomId, [...(casesByRoom.get(c.roomId) ?? []), c]);
  const objectsByUnit = new Map<string, MuseumObject[]>();
  for (const o of objects) {
    if (o.location) objectsByUnit.set(o.location, [...(objectsByUnit.get(o.location) ?? []), o]);
  }
  const devicesByUnit = new Map<string, Device[]>();
  for (const d of devices) devicesByUnit.set(d.unitId, [...(devicesByUnit.get(d.unitId) ?? []), d]);
  const cores = new Map(rooms.filter((r) => r.kind === 'core').map((r) => [r.levelId, r]));

  const roomOf = (unitId: string) => {
    const c = caseById.get(unitId);
    return lookup(roomById, c ? c.roomId : unitId, 'room');
  };
  const objectsAt = (unitId: string) => {
    if (caseById.has(unitId)) return objectsByUnit.get(unitId) ?? [];
    lookup(roomById, unitId, 'room');
    return [
      ...(objectsByUnit.get(unitId) ?? []),
      ...(casesByRoom.get(unitId) ?? []).flatMap((c) => objectsByUnit.get(c.unitId) ?? []),
    ];
  };
  const sensitivityOf = (o: MuseumObject) => MATERIAL_SENSITIVITY[o.material];
  // 标准按藏品的初始位置定，不随换展变化；告警每分钟都要查，所以缓存
  const standards = new Map<string, { sensitivity: Sensitivity; standard: ConservationStandard }>();
  const centerOfUnit = (unitId: string) => caseById.get(unitId)?.center ?? roomOf(unitId).center;

  return {
    venue,
    exhibitions: space.exhibitions,
    rooms,
    cases,
    objects,
    devices,
    routes,
    room: (id) => lookup(roomById, id, 'room'),
    roomByCode: (code) => lookup(roomByCode, code, 'room'),
    case: (id) => lookup(caseById, id, 'case'),
    caseByCode: (code) => lookup(caseByCode, code, 'case'),
    isCase: (id) => caseById.has(id),
    object: (id) => lookup(objectById, id, 'object'),
    objectByCode: (code) => lookup(objectByCode, code, 'object'),
    device: (id) => lookup(deviceById, id, 'device'),
    deviceByCode: (code) => lookup(deviceByCode, code, 'device'),
    devicesOf: (kind) => devices.filter((d) => d.kind === kind),
    devicesAt: (unitId) => devicesByUnit.get(unitId) ?? [],
    route: (code) => lookup(routeByCode, code, 'route'),
    roomOf,
    casesIn: (roomUnitId) => casesByRoom.get(roomUnitId) ?? [],
    objectsAt,
    sensitivityOf,
    standardOf(unitId) {
      let hit = standards.get(unitId);
      if (!hit) {
        const sensitivity = strictest(objectsAt(unitId).map(sensitivityOf));
        hit = { sensitivity, standard: STANDARDS[sensitivity] };
        standards.set(unitId, hit);
      }
      return hit;
    },
    walkPath(fromUnit, toUnit) {
      const a = roomOf(fromUnit);
      const b = roomOf(toUnit);
      const out: RoutePoint[] = [{ levelId: a.levelId, coord: centerOfUnit(fromUnit) }];
      const add = (levelId: string, coord: [number, number]) => out.push({ levelId, coord });
      if (a.unitId !== b.unitId) {
        add(a.levelId, a.door);
        add(a.levelId, a.hall);
        if (a.levelId !== b.levelId) {
          const from = lookup(cores, a.levelId, 'stair core on level');
          const to = lookup(cores, b.levelId, 'stair core on level');
          add(a.levelId, from.hall);
          add(a.levelId, from.center);
          add(b.levelId, to.center);
          add(b.levelId, to.hall);
        }
        add(b.levelId, b.hall);
        add(b.levelId, b.door);
      }
      add(b.levelId, centerOfUnit(toUnit));
      return out;
    },
  };
}
