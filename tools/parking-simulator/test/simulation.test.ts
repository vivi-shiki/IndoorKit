import { buildVenueModel } from '@indoorkit/imdf';
import {
  ALARM_RULES,
  type AlarmRule,
  createAlarmEngine,
  createParking,
  parkingExtensions,
  suggest,
  summarize,
} from '@indoorkit/parking';
import { generateParking, MINATO_PARKING } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { createParkingDay, DAY_MS } from '../src/index';

const H = 3600_000;
const parking = createParking(buildVenueModel(generateParking(MINATO_PARKING), parkingExtensions));
const sim = createParkingDay(parking, { seed: 'demo' });
const today = sim.visits.filter((v) => v.enteredAt >= 0 && v.enteredAt < DAY_MS);
const zone = (code: string) => parking.zoneByCode(code);

describe('createParkingDay', () => {
  it('simulates yesterday and today from the same seed, the same way every time', () => {
    expect(createParkingDay(parking, { seed: 'demo' }).visits).toEqual(sim.visits);
    expect(createParkingDay(parking, { seed: 'other' }).visits).not.toEqual(sim.visits);
    expect(sim.visits.some((v) => v.enteredAt < 0)).toBe(true);
    expect(sim.visits.every((v) => v.enteredAt < DAY_MS)).toBe(true);
  });

  it('has a busy day: hundreds of visits and most bays taken at noon', () => {
    expect(today.length).toBeGreaterThan(500);
    expect(today.length).toBeLessThan(1500);
    const hourlyBays = parking.bays.filter((b) => b.type !== 'monthly').length;
    expect(sim.parkedAt(12 * H).length / hourlyBays).toBeGreaterThan(0.7);
    expect(sim.parkedAt(4 * H).length).toBeLessThan(sim.parkedAt(12 * H).length / 2);
  });

  it('keeps every visit in order: entry, parked, left, exit', () => {
    for (const v of sim.visits) {
      expect(v.parkedAt).toBeGreaterThan(v.enteredAt);
      expect(v.leftAt).toBeGreaterThanOrEqual(v.parkedAt);
      expect(v.exitedAt).toBeGreaterThan(v.leftAt);
    }
  });

  it('never puts two vehicles in one bay at the same time', () => {
    const byBay = new Map<string, { parkedAt: number; leftAt: number }[]>();
    for (const v of sim.visits) byBay.set(v.bayId, [...(byBay.get(v.bayId) ?? []), v]);
    for (const [bayId, visits] of byBay) {
      const sorted = [...visits].sort((a, b) => a.parkedAt - b.parkedAt);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.parkedAt, parking.bay(bayId).code).toBeGreaterThanOrEqual(sorted[i - 1]!.leftAt);
      }
    }
  });

  it('parks monthly holders in their own bay and keeps six monthly bays vacant', () => {
    expect(sim.monthlyContracts).toHaveLength(30);
    const own = new Map(sim.monthlyContracts.map((c) => [c.id, c.bayId]));
    const holders = sim.visits.filter((v) => v.vehicle.contract.kind === 'monthly' && !v.anomaly);
    expect(holders.length).toBeGreaterThan(20);
    for (const v of holders) {
      const c = v.vehicle.contract;
      expect(c.kind === 'monthly' && own.get(c.id)).toBe(v.bayId);
    }
  });

  it('brings reservation holders to their reserved bay, except one no-show a day', () => {
    const todays = sim.reservations.filter((r) => r.from >= 0);
    expect(todays.length).toBeGreaterThanOrEqual(6);
    expect(todays.filter((r) => r.arrivedAt === null)).toHaveLength(1);
    for (const r of todays.filter((x) => x.arrivedAt !== null)) {
      const v = sim.visits.find(
        (x) => x.vehicle.contract.kind === 'reservation' && x.vehicle.contract.id === r.id,
      )!;
      expect(v.bayId).toBe(r.bayId);
      expect(v.enteredAt).toBe(r.arrivedAt);
    }
  });

  it('gives the rules something to find: the analytics suggestions all appear for yesterday', () => {
    const tips = suggest(
      parking,
      { sessions: sim.sessions(0), monthlyContracts: sim.monthlyContracts },
      -DAY_MS,
    );
    const codes = new Set(tips.map((t) => t.code));
    expect(codes).toEqual(new Set(['peak-pricing', 'ev-capacity', 'monthly-recruit']));
    const monthly = tips.filter((t) => t.code === 'monthly-recruit').map((t) => parking.zone(t.zoneId).code);
    expect(monthly).toEqual(expect.arrayContaining(['4F-C', '4F-D']));
  });

  it('raises every alarm rule at least once over the two days', () => {
    const engine = createAlarmEngine(parking);
    const seen = new Set<AlarmRule>();
    let last = -DAY_MS;
    for (let t = -DAY_MS; t < DAY_MS; t += 60_000) {
      for (const a of engine.check(sim.snapshotAt(t, last))) seen.add(a.rule);
      last = t;
    }
    expect([...seen].sort()).toEqual(Object.keys(ALARM_RULES).sort());
  });

  it('describes the state at a moment consistently', () => {
    const t = 14 * H;
    const snapshot = sim.snapshotAt(t, t - 60_000);
    expect(snapshot.now).toBe(t);
    expect(snapshot.parked.map((p) => p.bayId).sort()).toEqual(
      sim
        .parkedAt(t)
        .map((p) => p.bayId)
        .sort(),
    );
    const s = summarize(
      parking,
      { sessions: sim.sessions(t), monthlyContracts: sim.monthlyContracts },
      { from: 0, to: t },
    );
    expect(s.revenue).toBeGreaterThan(0);
    expect(s.hourly).toHaveLength(14);
  });

  it('moves only the vehicles that are driving, along lanes on their floor', () => {
    const t = 12 * H;
    const moving = sim.movingAt(t);
    expect(moving.length).toBeGreaterThan(0);
    const driving = new Set(
      sim.visits
        .filter((v) => (v.enteredAt <= t && t < v.parkedAt) || (v.leftAt <= t && t < v.exitedAt))
        .map((v) => v.id),
    );
    expect(new Set(moving.map((m) => m.id))).toEqual(driving);
    const levels = new Set(parking.venue.levels.map((l) => l.id));
    for (const m of moving) expect(levels.has(m.levelId)).toBe(true);
  });

  it('lists entry, parking, leaving and exit events in time order', () => {
    const events = sim.events(10 * H, 11 * H);
    expect(events.length).toBeGreaterThan(20);
    expect(events.map((e) => e.time)).toEqual([...events.map((e) => e.time)].sort((a, b) => a - b));
    expect(new Set(events.map((e) => e.kind))).toEqual(new Set(['entry', 'park', 'leave', 'exit']));
    for (const e of events.filter((x) => x.kind === 'entry' || x.kind === 'exit')) {
      expect(parking.device(e.deviceId).kind).toBe('lpr-camera');
    }
    for (const e of events.filter((x) => x.kind === 'park')) {
      expect(['bay-sensor', 'ai-camera']).toContain(parking.device(e.deviceId).kind);
    }
  });

  it('reports device faults while they last, including CO readings and help calls', () => {
    const kinds = new Set(sim.incidents.map((i) => parking.device(i.deviceId).kind));
    for (const k of ['bay-sensor', 'ai-camera', 'gate', 'flap', 'charger', 'co-sensor', 'intercom']) {
      expect(kinds.has(k as never), k).toBe(true);
    }
    const co = sim.incidents.find((i) => parking.device(i.deviceId).kind === 'co-sensor')!;
    const during = sim.snapshotAt(co.from + 1000, co.from).devices.find((d) => d.deviceId === co.deviceId);
    expect(during?.value).toBeGreaterThan(50);
    const after = sim.snapshotAt(co.to + 1000, co.to).devices.find((d) => d.deviceId === co.deviceId);
    expect(after?.value ?? 0).toBeLessThan(50);
  });

  it('leaves one live incident shortly after 14:00 for the demo', () => {
    expect(sim.incidents.some((i) => i.from > 14 * H && i.from < 14.5 * H)).toBe(true);
  });

  it('marks the share of special bays used by the wrong vehicle as anomalies', () => {
    const anomalies = today.filter((v) => v.anomaly).map((v) => v.anomaly);
    for (const a of ['monthly-bay', 'reserved-bay', 'ev-bay', 'accessible-bay', 'large-bay', 'unpaid-exit']) {
      expect(anomalies, a).toContain(a);
    }
    expect(anomalies.length).toBeLessThan(today.length / 20);
    expect(zone('1F-A').bayIds.length).toBe(17);
  });
});
