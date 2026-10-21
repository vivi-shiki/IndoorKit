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
 * 停车场的三个 IMDF 扩展文件：
 * - parking-zone.json：区（A～D 区、月租区等），每个区列出自己的车位和车位类型；
 * - parking-device.json：设备（车位传感器、相机、闸机、显示板、充电桩……）的位置和覆盖的车位；
 * - parking-lane.json：车道中心线和出入口，用来算行驶路线。
 */

export const BAY_TYPES = ['standard', 'monthly', 'ev', 'accessible', 'large'] as const;
export type BayType = (typeof BAY_TYPES)[number];

/** 车位怎么检测有没有车：每个车位一个传感器，或一台 AI 相机看一片车位 */
export const DETECTIONS = ['sensor', 'camera'] as const;
export type Detection = (typeof DETECTIONS)[number];

export const ZONE_KINDS = ['general', 'monthly', 'large'] as const;
export type ZoneKind = (typeof ZONE_KINDS)[number];

/** 立体停车场或平面停车场 */
export const SITES = ['garage', 'surface'] as const;
export type Site = (typeof SITES)[number];

export const DEVICE_KINDS = [
  'bay-sensor',
  'ai-camera',
  'lpr-camera',
  'gate',
  'flap',
  'display',
  'charger',
  'co-sensor',
  'intercom',
  'pay-station',
] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export const GATEWAY_ROLES = ['entry', 'exit', 'both'] as const;
export type GatewayRole = (typeof GATEWAY_ROLES)[number];

const point = z.object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) });
const line = z.object({
  type: z.literal('LineString'),
  coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const zoneFeature = feature('parking_zone', z.null(), {
  code: z.string().min(1),
  name: labels,
  kind: z.enum(ZONE_KINDS),
  site: z.enum(SITES),
  bays: z
    .array(
      z.object({
        unit_id: uuid,
        code: z.string().min(1),
        type: z.enum(BAY_TYPES),
        detection: z.enum(DETECTIONS),
      }),
    )
    .min(1),
});

export const deviceFeature = feature('parking_device', point, {
  code: z.string().min(1),
  kind: z.enum(DEVICE_KINDS),
  level_id: uuid,
  unit_ids: z.array(uuid),
});

export const laneFeature = feature('parking_lane', line, {
  from_level: uuid,
  to_level: uuid,
  oneway: z.boolean(),
});

export const gatewayFeature = feature('parking_gateway', point, {
  level_id: uuid,
  role: z.enum(GATEWAY_ROLES),
});

export interface ZoneModel {
  id: string;
  code: string;
  name: LabelMap;
  kind: ZoneKind;
  site: Site;
  bays: { unitId: string; code: string; type: BayType; detection: Detection }[];
}

export interface DeviceModel {
  id: string;
  code: string;
  kind: DeviceKind;
  levelId: string;
  coord: [number, number];
  /** 设备覆盖（检测、充电）的车位 */
  unitIds: string[];
}

export interface LaneModel {
  id: string;
  fromLevel: string;
  toLevel: string;
  oneway: boolean;
  coordinates: [number, number][];
}

export interface GatewayModel {
  id: string;
  levelId: string;
  role: GatewayRole;
  coord: [number, number];
}

type Issue = { path: string; message: string };

export const parkingZoneExtension = defineImdfExtension({
  file: 'parking-zone',
  schema: collection(zoneFeature),
  check(zones, archive) {
    const units = new Map(archive.unit.features.map((u) => [u.id, u]));
    const owner = new Map<string, string>();
    const codes = new Set<string>();
    const issues: Issue[] = [];
    for (const z of zones.features) {
      const levels = new Set<string>();
      for (const bay of z.properties.bays as { unit_id: string; code: string }[]) {
        const unit = units.get(bay.unit_id);
        if (!unit) issues.push({ path: z.id, message: `unknown unit ${bay.unit_id}` });
        else if (unit.properties.category !== 'parking')
          issues.push({ path: z.id, message: `unit ${bay.unit_id} is not a parking unit` });
        else levels.add(unit.properties.level_id);
        const previous = owner.get(bay.unit_id);
        if (previous) issues.push({ path: z.id, message: `bay ${bay.code} is already in zone ${previous}` });
        else owner.set(bay.unit_id, z.properties.code);
        if (codes.has(bay.code)) issues.push({ path: z.id, message: `duplicate bay code ${bay.code}` });
        codes.add(bay.code);
      }
      if (levels.size > 1) issues.push({ path: z.id, message: 'a zone must be on one floor' });
    }
    return issues;
  },
  build: (zones): ZoneModel[] =>
    zones.features.map((z) => ({
      id: z.id,
      code: z.properties.code,
      name: z.properties.name,
      kind: z.properties.kind,
      site: z.properties.site,
      bays: (
        z.properties.bays as { unit_id: string; code: string; type: BayType; detection: Detection }[]
      ).map((b) => ({ unitId: b.unit_id, code: b.code, type: b.type, detection: b.detection })),
    })),
});

export const parkingDeviceExtension = defineImdfExtension({
  file: 'parking-device',
  schema: collection(deviceFeature),
  check(devices, archive) {
    const levels = new Set(archive.level.features.map((l) => l.id));
    const units = new Set(archive.unit.features.map((u) => u.id));
    const issues: Issue[] = [];
    for (const d of devices.features) {
      if (!levels.has(d.properties.level_id))
        issues.push({ path: d.id, message: `unknown level ${d.properties.level_id}` });
      for (const id of d.properties.unit_ids as string[]) {
        if (!units.has(id)) issues.push({ path: d.id, message: `unknown unit ${id}` });
      }
    }
    return issues;
  },
  build: (devices): DeviceModel[] =>
    devices.features.map((d) => ({
      id: d.id,
      code: d.properties.code,
      kind: d.properties.kind,
      levelId: d.properties.level_id,
      coord: (d.geometry as GeoJSON.Point).coordinates as [number, number],
      unitIds: d.properties.unit_ids,
    })),
});

const laneFile = collection(z.union([laneFeature, gatewayFeature]));
const isLane = (f: RawCollection['features'][number]) => f.feature_type === 'parking_lane';
const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];

export const parkingLaneExtension = defineImdfExtension({
  file: 'parking-lane',
  schema: laneFile,
  check(lanes, archive) {
    const levels = new Set(archive.level.features.map((l) => l.id));
    const issues: Issue[] = [];
    const ends: { levelId: string; coord: number[] }[] = [];
    for (const f of lanes.features) {
      const props = f.properties;
      const refs = isLane(f) ? [props.from_level, props.to_level] : [props.level_id];
      for (const id of refs) if (!levels.has(id)) issues.push({ path: f.id, message: `unknown level ${id}` });
      if (isLane(f)) {
        const coords = (f.geometry as { coordinates: number[][] }).coordinates;
        ends.push(
          { levelId: props.from_level, coord: coords[0]! },
          { levelId: props.to_level, coord: coords.at(-1)! },
        );
      }
    }
    for (const f of lanes.features.filter((x) => !isLane(x))) {
      const coord = (f.geometry as { coordinates: number[] }).coordinates;
      if (!ends.some((e) => e.levelId === f.properties.level_id && same(e.coord, coord)))
        issues.push({ path: f.id, message: 'a gateway must be at a lane end' });
    }
    return issues;
  },
  build: (lanes): { lanes: LaneModel[]; gateways: GatewayModel[] } => ({
    lanes: lanes.features.filter(isLane).map((f) => ({
      id: f.id,
      fromLevel: f.properties.from_level,
      toLevel: f.properties.to_level,
      oneway: f.properties.oneway,
      coordinates: (f.geometry as GeoJSON.LineString).coordinates as [number, number][],
    })),
    gateways: lanes.features
      .filter((f) => !isLane(f))
      .map((f) => ({
        id: f.id,
        levelId: f.properties.level_id,
        role: f.properties.role,
        coord: (f.geometry as GeoJSON.Point).coordinates as [number, number],
      })),
  }),
});

export const parkingExtensions = [
  parkingZoneExtension,
  parkingDeviceExtension,
  parkingLaneExtension,
] as const;

/** 带三个停车场扩展的场馆 */
export type ParkingVenue = VenueModel<{
  'parking-zone': ZoneModel[];
  'parking-device': DeviceModel[];
  'parking-lane': { lanes: LaneModel[]; gateways: GatewayModel[] };
}>;
