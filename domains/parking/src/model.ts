import type { LabelMap, VenueModel } from '@indoorkit/imdf';
import type {
  BayType,
  Detection,
  DeviceKind,
  DeviceModel,
  GatewayModel,
  LaneModel,
  ParkingVenue,
  Site,
  ZoneKind,
  ZoneModel,
} from './extensions';

export interface Bay {
  /** 车位对应的 IMDF unit id */
  id: string;
  /** 如 1F-A01 */
  code: string;
  zoneId: string;
  levelId: string;
  type: BayType;
  detection: Detection;
  /** 车位外包矩形的中心 */
  center: [number, number];
  /** 在区里的序号，相邻序号的车位相邻 */
  index: number;
}

export interface Zone {
  id: string;
  /** 如 1F-A */
  code: string;
  name: LabelMap;
  kind: ZoneKind;
  site: Site;
  levelId: string;
  bayIds: string[];
}

export type Device = DeviceModel;

/** 车种：普通车、大型车（含工程车）、电动车 */
export type VehicleClass = 'standard' | 'large' | 'ev';

/** 车辆的契约：计时、月租（可固定车位）、预约、法人手配 */
export type Contract =
  | { kind: 'hourly' }
  | { kind: 'monthly'; id: string; bayId?: string }
  | { kind: 'reservation'; id: string }
  | { kind: 'fleet'; id: string; company: string };

export interface Vehicle {
  /** 虚构车牌，如 品川 300 あ 12-34 */
  plate: string;
  vehicleClass: VehicleClass;
  /** 有无障碍停车许可 */
  permit: boolean;
  contract: Contract;
}

export interface Parking {
  readonly venue: VenueModel;
  /** 按区的顺序 */
  readonly bays: readonly Bay[];
  readonly zones: readonly Zone[];
  readonly devices: readonly Device[];
  readonly lanes: readonly LaneModel[];
  readonly gateways: readonly GatewayModel[];
  /** 立体停车场的楼层，从低到高 */
  readonly garageLevels: readonly string[];
  readonly surfaceLevels: readonly string[];
  bay(id: string): Bay;
  bayByCode(code: string): Bay;
  zone(id: string): Zone;
  zoneByCode(code: string): Zone;
  device(id: string): Device;
  deviceByCode(code: string): Device;
  devicesOf(kind: DeviceKind): Device[];
  /** 覆盖这个车位的设备（传感器、相机、车位锁、充电桩） */
  devicesOfBay(bayId: string): Device[];
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

/** 停车场的车位、区、设备和车道；场馆必须用 parkingExtensions 读取 */
export function createParking(venue: VenueModel): Parking {
  const ext = (venue as ParkingVenue).extensions;
  const zoneModels = ext['parking-zone'] as ZoneModel[] | undefined;
  const devices = ext['parking-device'] as DeviceModel[] | undefined;
  const network = ext['parking-lane'];
  if (!zoneModels || !devices || !network)
    throw new Error('the venue was loaded without the parking extensions');

  const units = new Map(venue.features.units.features.map((u) => [u.properties.id, u]));
  const bays: Bay[] = [];
  const zones: Zone[] = zoneModels.map((z) => {
    const zoneBays = z.bays.map((b, index): Bay => {
      const unit = lookup(units, b.unitId, 'unit');
      return {
        id: b.unitId,
        code: b.code,
        zoneId: z.id,
        levelId: unit.properties.level_id,
        type: b.type,
        detection: b.detection,
        center: centerOf(unit.geometry),
        index,
      };
    });
    bays.push(...zoneBays);
    return {
      id: z.id,
      code: z.code,
      name: z.name,
      kind: z.kind,
      site: z.site,
      levelId: zoneBays[0]!.levelId,
      bayIds: zoneBays.map((b) => b.id),
    };
  });

  const bayById = new Map(bays.map((b) => [b.id, b]));
  const bayByCode = new Map(bays.map((b) => [b.code, b]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const zoneByCode = new Map(zones.map((z) => [z.code, z]));
  const deviceById = new Map(devices.map((d) => [d.id, d]));
  const deviceByCode = new Map(devices.map((d) => [d.code, d]));
  const byBay = new Map<string, Device[]>();
  for (const d of devices) for (const u of d.unitIds) byBay.set(u, [...(byBay.get(u) ?? []), d]);

  const ordinal = new Map(venue.levels.map((l) => [l.id, l.ordinal]));
  const levelsOf = (site: Site) =>
    [...new Set(zones.filter((z) => z.site === site).map((z) => z.levelId))].sort(
      (a, b) => ordinal.get(a)! - ordinal.get(b)!,
    );

  return {
    venue,
    bays,
    zones,
    devices,
    lanes: network.lanes,
    gateways: network.gateways,
    garageLevels: levelsOf('garage'),
    surfaceLevels: levelsOf('surface'),
    bay: (id) => lookup(bayById, id, 'bay'),
    bayByCode: (code) => lookup(bayByCode, code, 'bay'),
    zone: (id) => lookup(zoneById, id, 'zone'),
    zoneByCode: (code) => lookup(zoneByCode, code, 'zone'),
    device: (id) => lookup(deviceById, id, 'device'),
    deviceByCode: (code) => lookup(deviceByCode, code, 'device'),
    devicesOf: (kind) => devices.filter((d) => d.kind === kind),
    devicesOfBay: (bayId) => byBay.get(bayId) ?? [],
  };
}

/** 车牌默认打码：最后两位数字换成 * */
export function maskPlate(plate: string): string {
  return plate.replace(/[0-9・]{1,2}$/, (tail) => '*'.repeat(tail.length));
}
