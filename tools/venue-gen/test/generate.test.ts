import { departmentExtension } from '@indoorkit/hospital';
import { type RawCollection, validateImdf } from '@indoorkit/imdf';
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
    const result = validateImdf(archive, [departmentExtension]);
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
    const files = [
      'venue',
      'building',
      'level',
      'unit',
      'opening',
      'fixture',
      'amenity',
      'department',
    ] as const;
    const ids = files.flatMap(
      (f) => (archive[f] as RawCollection | undefined)?.features.map((x) => x.id) ?? [],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('departments', () => {
  const departments = archive.department.features;
  const owner = new Map<string, string>();
  for (const d of departments) for (const id of d.properties.unit_ids as string[]) owner.set(id, d.id);
  const levelOf = new Map(archive.unit.features.map((u) => [u.id, u.properties.level_id as string]));
  const byCode = (code: string) => departments.find((d) => d.properties.code === code)!;

  it('puts every named room in exactly one department', () => {
    const rooms = archive.unit.features.filter((u) => ['room', 'lobby'].includes(u.properties.category));
    for (const room of rooms) expect(owner.has(room.id), room.properties.name.en).toBe(true);
    const listed = departments.flatMap((d) => d.properties.unit_ids as string[]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('leaves corridors, elevators, stairs and restrooms as public areas', () => {
    const service = archive.unit.features.filter((u) => !['room', 'lobby'].includes(u.properties.category));
    expect(service.length).toBeGreaterThan(0);
    for (const unit of service) expect(owner.has(unit.id)).toBe(false);
  });

  it('gives every department several units and names in three languages', () => {
    expect(departments.length).toBeGreaterThanOrEqual(8);
    for (const d of departments) {
      expect((d.properties.unit_ids as string[]).length).toBeGreaterThanOrEqual(3);
      for (const lang of ['ja', 'en', 'zh']) expect(d.properties.name[lang]).toBeTruthy();
    }
    expect(new Set(departments.map((d) => d.properties.code)).size).toBe(departments.length);
  });

  it('lets some departments span several floors', () => {
    const floors = (code: string) =>
      new Set((byCode(code).properties.unit_ids as string[]).map((id) => levelOf.get(id))).size;
    expect(floors('internal')).toBeGreaterThan(1);
    expect(floors('surgery')).toBeGreaterThan(1);
  });

  it('gives the ICU department every ICU room', () => {
    const icuRooms = archive.unit.features.filter((u) => u.properties.name?.en === 'ICU').map((u) => u.id);
    expect(icuRooms).toHaveLength(3);
    for (const id of icuRooms) expect(owner.get(id)).toBe(byCode('icu').id);
  });
});

describe('map labels', () => {
  const names = (lang: 'ja' | 'en' | 'zh') =>
    new Set(archive.unit.features.map((u) => u.properties.name?.[lang]).filter(Boolean));
  const departmentNames = (lang: 'ja' | 'en' | 'zh') =>
    new Set(archive.department.features.map((d) => d.properties.name[lang]));

  it('names single patient rooms as rooms, not wards', () => {
    const en = [...names('en')];
    expect(en.filter((n) => /^Ward /.test(n))).toEqual([]);
    expect(en.filter((n) => /^Patient room \d{3}$/.test(n))).toHaveLength(11);
  });

  it('uses the reviewed room and department names', () => {
    for (const n of ['Billing desk', 'Information desk', 'ENT (Ear, Nose and Throat)', 'Consultation room']) {
      expect(names('en'), n).toContain(n);
    }
    for (const n of ['Nursing station', 'Rehabilitation room', 'Conference room', 'Sterile supply room']) {
      expect(names('en'), n).toContain(n);
    }
    for (const n of ['Doctors’ office', 'Storage room', 'Hospital director’s office'])
      expect(names('en'), n).toContain(n);
    for (const n of ['接待处', '检验室', '消毒供应室']) expect(names('zh'), n).toContain(n);
    expect(names('ja')).toContain('耳鼻咽喉科');
    expect(departmentNames('ja')).toContain('外来部門');
    expect(departmentNames('en')).toContain('Medical technical services');
    expect(departmentNames('en')).toContain('Nursing department');
  });
});
