import { validateImdf } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { generateVenue, SAKURA_HOSPITAL } from '../src/index';

type Ring = number[][];
const bbox = (ring: Ring) => {
  const xs = ring.map((p) => p[0]!);
  const ys = ring.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};
const outer = (f: { geometry: unknown }) => (f.geometry as GeoJSON.Polygon).coordinates[0] as Ring;
/** 楼层轮廓可能由多栋楼和连廊组成 */
const outlines = (f: { geometry: unknown }) => {
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polygons.map((p) => bbox(p[0] as Ring));
};
const EPS = 1e-9;

const archive = generateVenue(SAKURA_HOSPITAL);
const levels = archive.level.features;
const unitsOn = (levelId: string) => archive.unit.features.filter((u) => u.properties.level_id === levelId);

describe('generateVenue', () => {
  it('produces an archive that passes IMDF validation', () => {
    const result = validateImdf(archive);
    if (!result.ok) throw new Error(JSON.stringify(result.issues.slice(0, 5)));
    expect(result.ok).toBe(true);
  });

  it('creates three buildings with five floors, one level per floor shared by every building', () => {
    expect(archive.building.features).toHaveLength(3);
    const sorted = [...levels].sort((a, b) => a.properties.ordinal - b.properties.ordinal);
    expect(sorted.map((l) => l.properties.ordinal)).toEqual([0, 1, 2, 3, 4]);
    expect(sorted.map((l) => l.properties.short_name.en)).toEqual(['1F', '2F', '3F', '4F', '5F']);
    const buildingIds = archive.building.features.map((b) => b.id).sort();
    for (const level of levels) expect([...level.properties.building_ids].sort()).toEqual(buildingIds);
  });

  it('connects neighbouring buildings with a walkway bridge on every floor', () => {
    for (const level of levels) {
      const walkways = unitsOn(level.id).filter((u) => u.properties.category === 'walkway');
      // 每栋一条走廊 + 相邻两栋之间一条连廊
      expect(walkways).toHaveLength(3 + 2);
      const boxes = walkways.map((w) => bbox(outer(w))).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < boxes.length; i++) {
        // 从西到东首尾相接，人可以沿走廊走遍三栋楼
        expect(Math.abs(boxes[i]![0] - boxes[i - 1]![2])).toBeLessThan(EPS);
      }
    }
  });

  it('gives every floor a corridor, rooms, an elevator, stairs and a restroom', () => {
    for (const level of levels) {
      const categories = new Set(unitsOn(level.id).map((u) => u.properties.category));
      for (const c of ['walkway', 'room', 'elevator', 'stairs', 'restroom'])
        expect(categories.has(c)).toBe(true);
    }
  });

  it('places every unit inside its level outline', () => {
    for (const level of levels) {
      const parts = outlines(level);
      for (const unit of unitsOn(level.id)) {
        const [x0, y0, x1, y1] = bbox(outer(unit));
        const inside = parts.some(
          ([lx0, ly0, lx1, ly1]) => x0 >= lx0 - EPS && y0 >= ly0 - EPS && x1 <= lx1 + EPS && y1 <= ly1 + EPS,
        );
        expect(inside).toBe(true);
      }
    }
  });

  it('does not let units overlap', () => {
    for (const level of levels) {
      const boxes = unitsOn(level.id).map((u) => bbox(outer(u)));
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!;
          const b = boxes[j]!;
          const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
          const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
          expect(w <= EPS || h <= EPS).toBe(true);
        }
      }
    }
  });

  it('gives every enclosed unit one door on its boundary facing the corridor', () => {
    for (const level of levels) {
      const doors = archive.opening.features.filter((o) => o.properties.level_id === level.id);
      const enclosed = unitsOn(level.id).filter((u) => u.properties.category !== 'walkway');
      for (const unit of enclosed) {
        const [x0, y0, x1, y1] = bbox(outer(unit));
        const mine = doors.filter((d) => {
          const [[ax, ay], [bx, by]] = (d.geometry as GeoJSON.LineString).coordinates as [number[], number[]];
          const mx = (ax! + bx!) / 2;
          const my = (ay! + by!) / 2;
          const onEdge =
            (Math.abs(my - y0) < EPS || Math.abs(my - y1) < EPS) && mx > x0 - EPS && mx < x1 + EPS;
          return onEdge;
        });
        expect(mine.length).toBe(1);
      }
    }
  });

  it('builds walls that never cover a door', () => {
    for (const level of levels) {
      const walls = archive.fixture!.features.filter(
        (f) => f.properties.level_id === level.id && f.properties.category === 'wall',
      );
      expect(walls.length).toBeGreaterThan(0);
      const doors = archive.opening.features.filter((o) => o.properties.level_id === level.id);
      for (const door of doors) {
        const [[ax, ay], [bx, by]] = (door.geometry as GeoJSON.LineString).coordinates as [
          number[],
          number[],
        ];
        const mx = (ax! + bx!) / 2;
        const my = (ay! + by!) / 2;
        for (const wall of walls) {
          const [x0, y0, x1, y1] = bbox(outer(wall));
          const inside = mx > x0 + EPS && mx < x1 - EPS && my > y0 + EPS && my < y1 - EPS;
          expect(inside).toBe(false);
        }
      }
    }
  });

  it('names rooms in Japanese and English', () => {
    const rooms = archive.unit.features.filter((u) => u.properties.category === 'room');
    for (const room of rooms) {
      expect(room.properties.name.ja).toBeTruthy();
      expect(room.properties.name.en).toBeTruthy();
    }
  });

  it('centers the venue on the requested origin', () => {
    const [lng, lat] = archive.venue.features[0]!.properties.display_point.coordinates;
    expect(lng).toBeCloseTo(SAKURA_HOSPITAL.origin[0], 4);
    expect(lat).toBeCloseTo(SAKURA_HOSPITAL.origin[1], 4);
  });

  it('is deterministic for the same seed and differs for another seed', () => {
    expect(generateVenue(SAKURA_HOSPITAL)).toEqual(archive);
    const other = generateVenue({ ...SAKURA_HOSPITAL, seed: 'other' });
    expect(other.venue.features[0]!.id).not.toBe(archive.venue.features[0]!.id);
  });

  it('uses unique ids across the archive', () => {
    const files = ['venue', 'building', 'level', 'unit', 'opening', 'fixture', 'amenity'] as const;
    const ids = files.flatMap((f) => archive[f]?.features.map((x) => x.id) ?? []);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
