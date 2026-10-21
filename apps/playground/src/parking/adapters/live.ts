import type { Bookings, DeviceReading, ParkedVehicle, Parking, ReservationState } from '@indoorkit/parking';
import type { AlarmStore } from './alarms';

/** 车位在地图上的状态，按严重程度排列（缩小时区域标签取最严重的） */
export const BAY_STATES = ['alert', 'unknown', 'reserved', 'occupied', 'free'] as const;
export type BayState = (typeof BAY_STATES)[number];

/** 预约开始前这么久起保留车位 */
const HOLD_MS = 30 * 60_000;

/** 检测设备（车位传感器或 AI 摄像头）离线或故障、无法判断有没有车的车位 */
export function detectorsDown(parking: Parking, readings: readonly DeviceReading[]): Set<string> {
  const down = new Set<string>();
  for (const r of readings) {
    if (r.status !== 'offline' && r.status !== 'fault') continue;
    const device = parking.device(r.deviceId);
    if (device.kind !== 'bay-sensor' && device.kind !== 'ai-camera') continue;
    for (const id of device.unitIds) down.add(id);
  }
  return down;
}

/** t 时刻为预约、法人手配或活动包场保留的车位 */
export function reservedBays(
  parking: Parking,
  simReservations: readonly Pick<ReservationState, 'bayId' | 'from' | 'to'>[],
  bookings: Bookings,
  t: number,
): Set<string> {
  const held = (r: { from: number; to: number }) => r.from - HOLD_MS <= t && t < r.to;
  const out = new Set<string>();
  for (const r of [...simReservations, ...bookings.reservations()]) if (held(r)) out.add(r.bayId);
  for (const f of bookings.fleets()) if (held(f)) for (const id of f.bayIds) out.add(id);
  for (const e of bookings.events()) if (held(e)) for (const id of parking.zone(e.zoneId).bayIds) out.add(id);
  return out;
}

/** 有未解决的中、高级告警，而且引起告警的车还停在那里的车位 */
export function alertBays(store: AlarmStore, parked: readonly ParkedVehicle[]): Set<string> {
  const plates = new Map(parked.map((p) => [p.bayId, p.vehicle.plate]));
  const out = new Set<string>();
  for (const a of store.all()) {
    if (!a.bayId || a.level === 'low' || store.state(a.id) === 'resolved') continue;
    if (a.plate !== null && plates.get(a.bayId) === a.plate) out.add(a.bayId);
  }
  return out;
}

/** 每个车位的状态：检测不到 > 需要处理 > 有车 > 已保留 > 空闲 */
export function bayStates(input: {
  parking: Parking;
  parked: readonly ParkedVehicle[];
  detectorsDown: ReadonlySet<string>;
  reserved: ReadonlySet<string>;
  alerts: ReadonlySet<string>;
}): Map<string, BayState> {
  const occupied = new Set(input.parked.map((p) => p.bayId));
  const states = new Map<string, BayState>();
  for (const bay of input.parking.bays) {
    let state: BayState = 'free';
    if (input.detectorsDown.has(bay.id)) state = 'unknown';
    else if (input.alerts.has(bay.id)) state = 'alert';
    else if (occupied.has(bay.id)) state = 'occupied';
    else if (input.reserved.has(bay.id)) state = 'reserved';
    states.set(bay.id, state);
  }
  return states;
}

/** 每层的空闲车位数（含没有车位的楼层，为 0） */
export function freeByLevel(parking: Parking, states: ReadonlyMap<string, BayState>): Map<string, number> {
  const out = new Map(parking.venue.levels.map((l) => [l.id, 0]));
  for (const bay of parking.bays) {
    if (states.get(bay.id) === 'free') out.set(bay.levelId, (out.get(bay.levelId) ?? 0) + 1);
  }
  return out;
}
