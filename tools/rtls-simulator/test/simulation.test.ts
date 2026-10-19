import type { TagPosition } from '@indoorkit/core';
import { buildVenueModel, type VenueModel } from '@indoorkit/imdf';
import { generateVenue, SAKURA_HOSPITAL } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { createSimulation } from '../src/index';

const venue: VenueModel = buildVenueModel(generateVenue(SAKURA_HOSPITAL));

type Box = [number, number, number, number];
const boxOf = (geometry: GeoJSON.Geometry): Box => {
  const ring = (geometry as GeoJSON.Polygon).coordinates[0]!;
  const xs = ring.map((p) => p[0]!);
  const ys = ring.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const EPS = 1e-9;
const within = ([x0, y0, x1, y1]: Box, [x, y]: [number, number]) =>
  x >= x0 - EPS && x <= x1 + EPS && y >= y0 - EPS && y <= y1 + EPS;
const strictlyWithin = ([x0, y0, x1, y1]: Box, [x, y]: [number, number]) =>
  x > x0 + EPS && x < x1 - EPS && y > y0 + EPS && y < y1 - EPS;

const units = venue.features.units.features.map((u) => ({
  level: u.properties.level_id,
  category: u.properties.category,
  box: boxOf(u.geometry),
}));
const walls = venue.features.fixtures.features.map((w) => ({
  level: w.properties.level_id,
  box: boxOf(w.geometry),
}));
const unitAt = (p: TagPosition) => units.filter((u) => u.level === p.levelId && within(u.box, p.coord));

function run(seed: string, tags: number, steps: number, dtMs: number) {
  const sim = createSimulation(venue, { seed, tags });
  const frames: TagPosition[][] = [sim.positions()];
  for (let i = 0; i < steps; i++) frames.push(sim.step(dtMs));
  return frames;
}

describe('createSimulation', () => {
  it('creates the requested number of tags with unique ids', () => {
    const [first] = run('a', 50, 0, 1000);
    expect(first).toHaveLength(50);
    expect(new Set(first!.map((p) => p.id)).size).toBe(50);
  });

  it('is deterministic for a seed and differs between seeds', () => {
    expect(run('same', 30, 120, 1000)).toEqual(run('same', 30, 120, 1000));
    expect(run('one', 30, 60, 1000).at(-1)).not.toEqual(run('two', 30, 60, 1000).at(-1));
  });

  it('advances its clock by each step', () => {
    const sim = createSimulation(venue, { seed: 'clock', tags: 1 });
    sim.step(1000);
    sim.step(500);
    expect(sim.time).toBe(1500);
  });

  it('keeps every tag inside a unit of its floor and never inside a wall', () => {
    // 按楼层分组并只在最后断言一次：逐点 expect 会让这条测试接近 5 秒超时
    const byLevel = <T extends { level: string }>(items: T[]) => {
      const map = new Map<string, T[]>();
      for (const item of items) map.set(item.level, [...(map.get(item.level) ?? []), item]);
      return map;
    };
    const wallsByLevel = byLevel(walls);
    const unitsByLevel = byLevel(units);
    const problems: string[] = [];
    for (const frame of run('walls', 80, 600, 250)) {
      for (const p of frame) {
        if (!unitsByLevel.get(p.levelId)?.some((u) => within(u.box, p.coord))) {
          problems.push(`${p.id} at ${p.coord} is outside every unit`);
        }
        if (wallsByLevel.get(p.levelId)?.some((w) => strictlyWithin(w.box, p.coord))) {
          problems.push(`${p.id} at ${p.coord} is inside a wall`);
        }
      }
    }
    expect(problems.slice(0, 5)).toEqual([]);
  });

  it('moves tags, and moves them between floors only through elevators or stairs', () => {
    const frames = run('floors', 120, 1200, 500);
    let floorChanges = 0;
    let moved = 0;
    for (let i = 1; i < frames.length; i++) {
      for (let k = 0; k < frames[i]!.length; k++) {
        const before = frames[i - 1]![k]!;
        const after = frames[i]![k]!;
        if (before.coord[0] !== after.coord[0] || before.coord[1] !== after.coord[1]) moved++;
        if (before.levelId === after.levelId) continue;
        floorChanges++;
        const vertical = (p: TagPosition) =>
          unitAt(p).some((u) => u.category === 'elevator' || u.category === 'stairs');
        expect(vertical(before) && vertical(after)).toBe(true);
      }
    }
    expect(moved).toBeGreaterThan(0);
    expect(floorChanges).toBeGreaterThan(0);
  });

  it('spreads tags over more than one floor', () => {
    const last = run('spread', 200, 1200, 500).at(-1)!;
    expect(new Set(last.map((p) => p.levelId)).size).toBeGreaterThan(1);
  });
});
