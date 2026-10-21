import type { DeviceKind } from '@indoorkit/parking';
import {
  floorPlugin,
  type MarkerApi,
  markerPlugin,
  polygonPlugin,
  popupPlugin,
  type UnitStateApi,
  unitStatePlugin,
} from '@indoorkit/plugins';
import { BAY_STATES } from './adapters/live';
import type { LiveSnapshot, ParkingContext } from './adapters/venue';
import { pt } from './i18n';
import { DEVICE_COLORS, SIGN_COLORS, STATE_COLORS, TYPE_OUTLINES } from './presentation/colors';

/**
 * 几个页面共用的车位图层：按状态着色、按用途描边、缩小时按区汇总空闲数，
 * 加上余位显示屏和可开关的设备标记。
 */
export function bayPlugins(ctx: ParkingContext) {
  return [
    floorPlugin,
    unitStatePlugin({
      colors: STATE_COLORS,
      order: BAY_STATES,
      outlines: TYPE_OUTLINES,
      groups: {
        items: ctx.parking.zones.map((z) => ({ id: z.id, label: z.name, unitIds: z.bayIds })),
        countStates: ['free'],
        maxZoom: 18.5,
      },
    }),
    markerPlugin,
    popupPlugin,
    polygonPlugin,
  ] as const;
}

/** 每个车位的用途描边 */
export function bayOutlines(ctx: ParkingContext): [string, string][] {
  return ctx.parking.bays.filter((b) => b.type !== 'standard').map((b) => [b.id, b.type]);
}

export interface SignReading {
  code: string;
  free: number;
  full: boolean;
}

/**
 * 余位显示屏显示的空闲数：各层的屏显示本层，入口的屏显示整座停车楼；
 * 月租车位不对外开放，不计入。
 */
export function signReadings(ctx: ParkingContext, live: LiveSnapshot): SignReading[] {
  const { parking } = ctx;
  const freeOn = (levelIds: readonly string[]) =>
    parking.bays.filter(
      (b) => levelIds.includes(b.levelId) && b.type !== 'monthly' && live.states.get(b.id) === 'free',
    ).length;
  return parking.devicesOf('display').map((d) => {
    const free = d.code === 'DISP-ENT' ? freeOn(parking.garageLevels) : freeOn([d.levelId]);
    return { code: d.code, free, full: free === 0 };
  });
}

const signLabel = (s: SignReading) => (s.full ? pt('sign.full') : pt('sign.free', { count: s.free }));

/** 显示屏标记：第一次调用时加上，之后只改文字和颜色 */
export function syncSigns(ctx: ParkingContext, marker: MarkerApi, live: LiveSnapshot, added: Set<string>) {
  const readings = signReadings(ctx, live);
  for (const s of readings) {
    const device = ctx.parking.deviceByCode(s.code);
    const id = `sign:${s.code}`;
    const color = s.full ? SIGN_COLORS.full : SIGN_COLORS.free;
    if (added.has(id)) marker.update(id, { label: signLabel(s), color });
    else {
      marker.add({ id, coord: device.coord, floor: device.levelId, label: signLabel(s), color });
      added.add(id);
    }
  }
  return readings;
}

/** 可以在满空地图上开关的设备图层 */
export const DEVICE_LAYERS = [
  'bay-sensor',
  'ai-camera',
  'charger',
  'co-sensor',
] as const satisfies readonly DeviceKind[];

/** 打开或关闭一类设备的标记 */
export function setDeviceLayer(ctx: ParkingContext, marker: MarkerApi, kind: DeviceKind, on: boolean) {
  for (const d of ctx.parking.devicesOf(kind)) {
    const id = `device:${d.code}`;
    if (on) marker.add({ id, coord: d.coord, floor: d.levelId, color: DEVICE_COLORS[kind] });
    else marker.remove(id);
  }
}

/** AI 摄像头覆盖的车位范围（外包矩形），画在地图上 */
export function cameraCoverage(ctx: ParkingContext) {
  return ctx.parking.devicesOf('ai-camera').map((d) => {
    const units = ctx.venue.features.units.features.filter((u) => d.unitIds.includes(String(u.id)));
    const points = units.flatMap(
      (u) => (u.geometry.type === 'Polygon' ? u.geometry.coordinates : u.geometry.coordinates[0]!)[0]!,
    );
    const xs = points.map((p) => p[0]!);
    const ys = points.map((p) => p[1]!);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return {
      id: `coverage:${d.code}`,
      floor: d.levelId,
      color: DEVICE_COLORS['ai-camera'],
      coordinates: [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ] as [number, number][],
    };
  });
}

/** 把一次快照画到车位图层上 */
export function paintBays(unitState: UnitStateApi, live: LiveSnapshot) {
  unitState.setStates(live.states);
}
