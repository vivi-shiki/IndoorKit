import {
  ASSET_TYPES,
  DAY_START_MS,
  dayTime,
  departmentExtension,
  departmentsOf,
  MOBILE_ASSET_TYPES,
  ROLES,
  statusAt,
  statusSummary,
} from '@indoorkit/hospital';
import { buildVenueModel } from '@indoorkit/imdf';
import type { TagPosition } from '@indoorkit/rtls';
import { generateVenue, SAKURA_HOSPITAL } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import * as simulator from '../src/index';
import { createRoster, createSimulation } from '../src/index';

const venue = buildVenueModel(generateVenue(SAKURA_HOSPITAL), [departmentExtension]);
const departments = departmentsOf(venue);
const DAY = 24 * 3600_000;
const deptByCode = (code: string) => departments.find((d) => d.code === code)!;

type Box = [number, number, number, number];
const boxOf = (geometry: GeoJSON.Geometry): Box => {
  const ring = (geometry as GeoJSON.Polygon).coordinates[0]!;
  const xs = ring.map((p) => p[0]!);
  const ys = ring.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const owner = new Map<string, string>();
for (const d of departments) for (const id of d.unitIds) owner.set(id, d.id);
const units = venue.features.units.features.map((u) => ({
  id: u.properties.id,
  level: u.properties.level_id,
  box: boxOf(u.geometry),
}));
/** 位置所在科室；公共区域为 null */
const departmentAt = (p: TagPosition) => {
  const [x, y] = p.coord;
  const unit = units.find(
    (u) => u.level === p.levelId && x > u.box[0] && x < u.box[2] && y > u.box[1] && y < u.box[3],
  );
  return unit ? (owner.get(unit.id) ?? null) : null;
};

describe('simulator exports', () => {
  it('generates data only and leaves the hospital model to @indoorkit/hospital', () => {
    for (const name of [
      'ROLES',
      'ASSET_TYPES',
      'ASSET_STATUSES',
      'statusAt',
      'statusSummary',
      'sosActive',
      'dayTime',
    ])
      expect(simulator).not.toHaveProperty(name);
  });
});

describe('createRoster', () => {
  const roster = createRoster(venue, { people: 400, assets: 200 });

  it('is deterministic and keeps the same identities for a smaller population', () => {
    expect(createRoster(venue, { people: 400, assets: 200 })).toEqual(roster);
    const small = createRoster(venue, { people: 50, assets: 20 });
    expect(small.people).toEqual(roster.people.slice(0, 50));
    expect(small.assets).toEqual(roster.assets.slice(0, 20));
  });

  it('puts every person and every asset in a department', () => {
    const ids = new Set(departments.map((d) => d.id));
    for (const p of roster.people) expect(ids.has(p.departmentId)).toBe(true);
    for (const a of roster.assets) expect(ids.has(a.departmentId)).toBe(true);
    expect(new Set(roster.people.map((p) => p.id)).size).toBe(400);
    expect(new Set(roster.assets.map((a) => a.id)).size).toBe(200);
  });

  it('uses every role and every asset type, with names and codes', () => {
    expect(new Set(roster.people.map((p) => p.role))).toEqual(new Set(ROLES));
    expect(new Set(roster.assets.map((a) => a.type))).toEqual(new Set(ASSET_TYPES));
    for (const p of roster.people) {
      expect(p.kind).toBe('person');
      for (const lang of ['ja', 'en', 'zh']) expect(p.name[lang]).toBeTruthy();
    }
    for (const a of roster.assets) {
      expect(a.kind).toBe('asset');
      expect(a.code).toMatch(/^[A-Z]{2,3}-\d{4}$/);
      expect(a.battery).toBeGreaterThanOrEqual(0);
      expect(a.battery).toBeLessThanOrEqual(100);
    }
  });

  it('lets visitors visit wards only and puts security staff in administration', () => {
    const wards = new Set(['internal', 'surgery', 'icu', 'rehab'].map((c) => deptByCode(c).id));
    for (const v of roster.people.filter((p) => p.role === 'visitor'))
      expect(wards.has(v.departmentId)).toBe(true);
    for (const s of roster.people.filter((p) => p.role === 'security'))
      expect(s.departmentId).toBe(deptByCode('admin').id);
  });

  it('gives every asset a status schedule covering the whole day', () => {
    for (const a of roster.assets) {
      expect(a.schedule[0]!.from).toBe(0);
      expect(a.schedule.at(-1)!.to).toBe(DAY);
      for (let i = 1; i < a.schedule.length; i++) {
        expect(a.schedule[i]!.from).toBe(a.schedule[i - 1]!.to);
        expect(a.schedule[i]!.status).not.toBe(a.schedule[i - 1]!.status);
      }
    }
    const statuses = new Set(roster.assets.flatMap((a) => a.schedule.map((s) => s.status)));
    expect(statuses).toEqual(new Set(['running', 'idle', 'offline', 'maintenance']));
  });

  it('summarises the current status, since when, and the running time so far today', () => {
    const asset = roster.assets[0]!;
    const t = DAY_START_MS + 30 * 60_000;
    const current = asset.schedule.find((s) => s.from <= t && t < s.to)!;
    const runMs = asset.schedule
      .filter((s) => s.status === 'running')
      .reduce((sum, s) => sum + Math.max(0, Math.min(s.to, t) - s.from), 0);
    expect(statusAt(asset, t)).toBe(current.status);
    expect(statusSummary(asset, t)).toEqual({ status: current.status, since: current.from, runMs });
  });

  it('starts the demo clock at nine in the morning', () => {
    expect(DAY_START_MS).toBe(9 * 3600_000);
    expect(dayTime(1000)).toBe(DAY_START_MS + 1000);
  });
});

describe('simulation with departments and assets', () => {
  const run = (people: number, assets: number, steps: number, dtMs: number) => {
    const sim = createSimulation(venue, { seed: 'dept', tags: people, assets });
    const frames: TagPosition[][] = [sim.positions()];
    for (let i = 0; i < steps; i++) frames.push(sim.step(dtMs));
    return frames;
  };
  const roster = createRoster(venue, { people: 150, assets: 80 });
  const frames = run(150, 80, 300, 2000);

  it('reports people first, then assets, by their roster ids', () => {
    expect(frames[0]!.map((p) => p.id)).toEqual([...roster.people, ...roster.assets].map((x) => x.id));
  });

  it('reports each asset with the status of its schedule', () => {
    const sim = createSimulation(venue, { seed: 'status', tags: 0, assets: 80 });
    for (let i = 0; i < 30; i++) {
      const positions = sim.step(60_000);
      for (const p of positions) {
        const asset = roster.assets.find((a) => a.id === p.id)!;
        expect(p.status).toBe(statusAt(asset, dayTime(sim.time)));
      }
    }
  });

  it('starts assets in their department and never moves fixed equipment', () => {
    const mobile = new Set<string>(MOBILE_ASSET_TYPES);
    const fixed = roster.assets.filter((a) => !mobile.has(a.type)).map((a) => a.id);
    const first = new Map(frames[0]!.map((p) => [p.id, p]));
    for (const id of fixed) {
      const asset = roster.assets.find((a) => a.id === id)!;
      expect(departmentAt(first.get(id)!)).toBe(asset.departmentId);
    }
    for (const frame of frames) {
      for (const p of frame) {
        if (!fixed.includes(p.id)) continue;
        expect(p.coord).toEqual(first.get(p.id)!.coord);
      }
    }
  });

  it('keeps doctors, nurses and patients mostly inside their own department', () => {
    const home = new Map(roster.people.map((p) => [p.id, p]));
    let inside = 0;
    let total = 0;
    for (const frame of frames) {
      for (const p of frame) {
        const person = home.get(p.id);
        if (!person || !['doctor', 'nurse', 'patient'].includes(person.role)) continue;
        total++;
        if (departmentAt(p) === person.departmentId) inside++;
      }
    }
    expect(inside / total).toBeGreaterThan(0.5);
  });

  it('sends some people and some mobile assets outside their department', () => {
    const dept = new Map([...roster.people, ...roster.assets].map((x) => [x.id, x.departmentId]));
    const away = new Set<string>();
    for (const frame of frames) {
      for (const p of frame) {
        const at = departmentAt(p);
        if (at !== null && at !== dept.get(p.id)) away.add(p.id);
      }
    }
    expect([...away].some((id) => id.startsWith('P'))).toBe(true);
    expect([...away].some((id) => id.startsWith('A'))).toBe(true);
  });

  it('raises at least one call for help in the first ten minutes', () => {
    const sos = frames.flat().filter((p) => p.status === 'sos');
    expect(sos.length).toBeGreaterThan(0);
    expect(sos.every((p) => p.id.startsWith('P'))).toBe(true);
  });
});
