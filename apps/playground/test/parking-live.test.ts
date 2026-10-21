import { buildVenueModel } from '@indoorkit/imdf';
import { createBookings, createParking, parkingExtensions } from '@indoorkit/parking';
import { createParkingDay } from '@indoorkit/parking-simulator';
import { generateParking, MINATO_PARKING } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { createAlarmStore } from '../src/parking/adapters/alarms';
import { createSimClock, parseClockParam } from '../src/parking/adapters/clock';
import {
  alertBays,
  BAY_STATES,
  bayStates,
  detectorsDown,
  freeByLevel,
  reservedBays,
} from '../src/parking/adapters/live';

const H = 3600_000;
const venue = buildVenueModel(generateParking(MINATO_PARKING), parkingExtensions);
const parking = createParking(venue);
const day = createParkingDay(parking, { seed: 'minato' });
const bayId = (code: string) => parking.bayByCode(code).id;

function statesAt(t: number, extra: { alerts?: Set<string>; reserved?: Set<string> } = {}) {
  return bayStates({
    parking,
    parked: day.parkedAt(t),
    detectorsDown: detectorsDown(parking, day.deviceReadings(t)),
    reserved: extra.reserved ?? reservedBays(parking, day.reservations, createBookings(parking), t),
    alerts: extra.alerts ?? new Set(),
  });
}

describe('space states', () => {
  it('gives every space exactly one state', () => {
    const states = statesAt(14 * H);
    expect(states.size).toBe(parking.bays.length);
    for (const s of states.values()) expect(BAY_STATES).toContain(s);
  });

  it('marks parked spaces occupied and the rest available', () => {
    const t = 9 * H;
    const states = statesAt(t, { reserved: new Set() });
    const parked = new Set(day.parkedAt(t).map((p) => p.bayId));
    const down = detectorsDown(parking, day.deviceReadings(t));
    for (const bay of parking.bays) {
      if (down.has(bay.id)) continue;
      expect(states.get(bay.id), bay.code).toBe(parked.has(bay.id) ? 'occupied' : 'free');
    }
  });

  it('cannot tell whether a space is taken while its sensor or camera is offline', () => {
    // 3F-C07 的传感器 10:20–11:40 离线；P2-B 的 AI 摄像头 13:10–13:40 离线
    expect(statesAt(11 * H).get(bayId('3F-C07'))).toBe('unknown');
    expect(statesAt(12 * H).get(bayId('3F-C07'))).not.toBe('unknown');
    const p2b = parking.zoneByCode('P2-B').bayIds;
    expect(p2b.every((id) => statesAt(13.5 * H).get(id) === 'unknown')).toBe(true);
  });

  it('shows empty reserved spaces and spaces that need attention', () => {
    const t = 14 * H;
    const parked = day.parkedAt(t);
    const taken = parked[0]!.bayId;
    const empty = parking.bays.find(
      (b) => !parked.some((p) => p.bayId === b.id) && b.detection === 'sensor',
    )!;
    const states = statesAt(t, { alerts: new Set([taken]), reserved: new Set([empty.id, taken]) });
    expect(states.get(taken)).toBe('alert');
    expect(states.get(empty.id)).toBe('reserved');
  });

  it('counts reservations from the simulation and the bookings made on the page', () => {
    const bookings = createBookings(parking);
    const sim = day.reservations[1]!;
    expect(reservedBays(parking, day.reservations, bookings, sim.from + 1)).toContain(sim.bayId);
    // 预约开始前 30 分钟起保留车位
    expect(reservedBays(parking, day.reservations, bookings, sim.from - 20 * 60_000)).toContain(sim.bayId);
    expect(reservedBays(parking, day.reservations, bookings, sim.to + 1)).not.toContain(sim.bayId);
    const occ = { now: 15 * H, occupied: new Set(day.parkedAt(15 * H).map((p) => p.bayId)) };
    const r = bookings.reserve({ from: 16 * H, to: 17 * H, vehicle: 'standard' }, occ);
    expect(reservedBays(parking, day.reservations, bookings, 16.5 * H)).toContain(r.bayId);
  });

  it('adds up the free spaces of each level', () => {
    const states = statesAt(14 * H);
    const free = freeByLevel(parking, states);
    const total = [...states.values()].filter((s) => s === 'free').length;
    expect([...free.values()].reduce((a, b) => a + b, 0)).toBe(total);
    expect([...free.keys()].sort()).toEqual(venue.levels.map((l) => l.id).sort());
  });
});

describe('alarm store', () => {
  it('raises all three tiers by the afternoon and keeps the handling state', () => {
    const store = createAlarmStore(parking, day);
    store.update(14 * H);
    const tiers = new Set(store.all().map((a) => a.tier));
    expect([...tiers].sort()).toEqual(['contract', 'device', 'time']);
    const first = store.all()[0]!;
    expect(store.state(first.id)).toBe('open');
    store.setState(first.id, 'acknowledged');
    expect(store.state(first.id)).toBe('acknowledged');
    const before = store.all().length;
    store.update(14.5 * H);
    expect(store.all().length).toBeGreaterThanOrEqual(before);
    expect(store.state(first.id)).toBe('acknowledged');
  });

  it('starts again when the clock goes back', () => {
    const store = createAlarmStore(parking, day);
    store.update(15 * H);
    const late = store.all().length;
    store.update(8 * H);
    expect(store.all().length).toBeLessThan(late);
    expect(store.all().every((a) => a.time <= 8 * H)).toBe(true);
  });

  it('marks a space as needing attention while the offending vehicle is still there', () => {
    const store = createAlarmStore(parking, day);
    const t = 14 * H;
    store.update(t);
    const parked = day.parkedAt(t);
    const bays = alertBays(store, parked);
    const contract = store
      .all()
      .find(
        (a) =>
          a.tier === 'contract' && parked.some((p) => p.bayId === a.bayId && p.vehicle.plate === a.plate),
      );
    expect(contract).toBeDefined();
    expect(bays).toContain(contract!.bayId);
    store.setState(contract!.id, 'resolved');
    expect(alertBays(store, parked)).not.toContain(contract!.bayId);
  });
});

describe('simulation clock', () => {
  it('reads the start time from ?t=HH:MM and defaults to 14:00', () => {
    expect(parseClockParam(null)).toBe(14 * H);
    expect(parseClockParam('09:30')).toBe(9.5 * H);
    expect(parseClockParam('25:00')).toBe(14 * H);
    expect(parseClockParam('nonsense')).toBe(14 * H);
  });

  it('runs at the chosen speed and keeps its time when the speed changes', () => {
    let real = 0;
    const clock = createSimClock({ start: 10 * H, now: () => real });
    real = 1000;
    expect(clock.time()).toBe(10 * H + 1000);
    clock.setSpeed(60);
    real = 2000;
    expect(clock.time()).toBe(10 * H + 1000 + 60_000);
    clock.set(12 * H);
    expect(clock.time()).toBe(12 * H);
  });
});
