import { buildVenueModel } from '@indoorkit/imdf';
import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../imdf/test/fixture';
import { buildFloors } from '../src/twin/floors';

const METRES_PER_DEGREE = 111_319.49;

function range(geometry: BufferGeometry, axis: 0 | 1 | 2) {
  const values = geometry.attributes.position!.array;
  let min = Infinity;
  let max = -Infinity;
  for (let i = axis; i < values.length; i += 3) {
    min = Math.min(min, values[i]!);
    max = Math.max(max, values[i]!);
  }
  return [min, max] as const;
}

describe('indoor floors generated in Three.js from IMDF', () => {
  const venue = buildVenueModel(makeArchive());
  const floors = buildFloors(venue, { origin: [0, 0], floorHeight: 4, wallHeight: 2.4 });

  it('creates one group per level, raised by ordinal × floor height', () => {
    expect([...floors.keys()].sort()).toEqual([IDS.level1, IDS.level2].sort());
    // 夹具里 level1 是 0 层（有房间和墙），level2 是 1 层
    expect(floors.get(IDS.level1)!.elevation).toBe(0);
    expect(floors.get(IDS.level2)!.elevation).toBe(4);
    expect(floors.get(IDS.level2)!.ordinal).toBe(1);
  });

  it('batches unit floors by category so the theme can colour them', () => {
    const level = floors.get(IDS.level1)!;
    expect([...level.units.keys()].sort()).toEqual(['room', 'walkway']);
    const room = level.units.get('room')!;
    const [yMin, yMax] = range(room, 1);
    expect(yMin).toBeGreaterThan(0);
    expect(yMax).toBeLessThan(0.5);
    // 本地米制坐标：+X 向东，+Z 向南
    const [xMin, xMax] = range(room, 0);
    expect(xMin).toBeCloseTo(0, 0);
    expect(xMax).toBeCloseTo(0.001 * METRES_PER_DEGREE, -1);
    const [zMin, zMax] = range(room, 2);
    expect(zMax).toBeLessThanOrEqual(0.5);
    expect(zMin).toBeCloseTo(-0.001 * METRES_PER_DEGREE, -1);
    expect(floors.get(IDS.level2)!.units.size).toBe(0);
  });

  it('extrudes wall fixtures from the level up to the wall height', () => {
    const walls = floors.get(IDS.level1)!.walls!;
    expect(walls.index ? walls.index.count : walls.attributes.position!.count).toBeGreaterThan(0);
    const [yMin, yMax] = range(walls, 1);
    expect(yMin).toBeCloseTo(0, 3);
    expect(yMax).toBeCloseTo(2.4, 3);
    expect(floors.get(IDS.level2)!.walls).toBeNull();
  });
});
