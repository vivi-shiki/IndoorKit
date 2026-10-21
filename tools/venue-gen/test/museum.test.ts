import { buildVenueModel, validateImdf } from '@indoorkit/imdf';
import { createMuseum, museumExtensions } from '@indoorkit/museum';
import { describe, expect, it } from 'vitest';
import { generateMuseum, MINATO_MUSEUM } from '../src/index';

const archive = generateMuseum(MINATO_MUSEUM);
const venue = buildVenueModel(archive, museumExtensions);
const museum = createMuseum(venue);
const short = (levelId: string) => venue.levels.find((l) => l.id === levelId)!.shortName.en;
const unitGeometry = (id: string) =>
  venue.features.units.features.find((u) => u.properties.id === id)!.geometry;
/** 生成的区块都是矩形：看点是否在外包矩形里（边上不算） */
const booleanPointInPolygon = (p: [number, number], g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => {
  const ring = (g.type === 'Polygon' ? g.coordinates : g.coordinates[0]!)[0]!;
  const xs = ring.map((c) => c[0]!);
  const ys = ring.map((c) => c[1]!);
  return p[0] > Math.min(...xs) && p[0] < Math.max(...xs) && p[1] > Math.min(...ys) && p[1] < Math.max(...ys);
};
const near = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
const galleries = museum.rooms.filter((r) => r.kind === 'gallery' || r.kind === 'special');

describe('generateMuseum', () => {
  it('produces an archive that passes IMDF and museum-extension validation', () => {
    const result = validateImdf(archive, museumExtensions);
    if (!result.ok) throw new Error(JSON.stringify(result.issues.slice(0, 5)));
    expect(result.ok).toBe(true);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(generateMuseum(MINATO_MUSEUM))).toBe(JSON.stringify(archive));
  });

  it('names the fictional venue in three languages', () => {
    expect(venue.name).toEqual({
      ja: 'みなと市立美術博物館',
      en: 'Minato City Museum of Art and History',
      zh: '港市立美术博物馆',
    });
  });

  it('has a basement for storage and three floors open to visitors', () => {
    expect(venue.levels.map((l) => l.shortName.en)).toEqual(['B1', '1F', '2F', '3F']);
    const b1 = venue.levels[0]!.id;
    expect(
      museum.rooms.filter((r) => r.levelId === b1 && r.kind !== 'core').every((r) => r.access === 'staff'),
    ).toBe(true);
    expect(museum.roomByCode('OFFICE').access).toBe('staff');
  });

  it('has eleven galleries, about sixty display cases and the agreed exhibitions', () => {
    expect(galleries.map((r) => r.code)).toEqual([
      'SP1',
      'SP2',
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6',
      'G7',
      'G8',
      'G9',
    ]);
    expect(museum.cases.length).toBe(59);
    expect(museum.exhibitions.map((e) => e.code)).toEqual(['SPECIAL', 'ART', 'ARCH', 'JAPAN']);
    expect(galleries.filter((r) => r.exhibition === 'JAPAN').map((r) => short(r.levelId))).toEqual([
      '3F',
      '3F',
      '3F',
      '3F',
    ]);
    for (const g of galleries) expect(g.capacity).toBeGreaterThan(0);
  });

  it('keeps every case inside its room and clear of the room centre and the door', () => {
    for (const c of museum.cases) {
      const room = museum.room(c.roomId);
      expect(booleanPointInPolygon(c.center, unitGeometry(room.unitId)), c.code).toBe(true);
      const caseShape = unitGeometry(c.unitId);
      expect(booleanPointInPolygon(room.center, caseShape), c.code).toBe(false);
      expect(booleanPointInPolygon(room.door, caseShape), c.code).toBe(false);
    }
  });

  it('puts paper and textiles on 3F, high sensitivity cases there and designated objects', () => {
    expect(museum.standardOf(museum.roomByCode('G6').unitId).sensitivity).toBe('high');
    expect(museum.standardOf(museum.roomByCode('G1').unitId).sensitivity).toBe('medium');
    expect(museum.standardOf(museum.roomByCode('G5').unitId).sensitivity).toBe('low');
    expect(museum.objects.filter((o) => o.designated)).toHaveLength(3);
    expect(museum.objects.length).toBeGreaterThan(150);
    const byStatus = (s: string) => museum.objects.filter((o) => o.status === s).length;
    expect(byStatus('display')).toBeGreaterThan(100);
    expect(byStatus('storage')).toBeGreaterThan(20);
    expect(byStatus('loan')).toBe(2);
    expect(byStatus('conservation')).toBe(2);
  });

  it('keeps a stored replacement for the ukiyo-e and Japanese painting series', () => {
    const shown = museum.objectsAt(museum.roomByCode('G9').unitId);
    expect(shown.every((o) => o.series === 'minato-100')).toBe(true);
    const stored = museum.objects.filter((o) => o.status === 'storage' && o.series === 'minato-100');
    expect(stored.length).toBeGreaterThan(5);
    expect(museum.roomOf(stored[0]!.location!).code).toBe('ST-B');
  });

  it('monitors every gallery and case, and counts visitors at every gallery door and the entrance', () => {
    for (const g of galleries) {
      const kinds = museum.devicesAt(g.unitId).map((d) => d.kind);
      for (const k of ['climate', 'light', 'co2', 'motion', 'counter', 'rfid', 'beacon'])
        expect(kinds, `${g.code} ${k}`).toContain(k);
    }
    for (const c of museum.cases) {
      const kinds = museum.devicesAt(c.unitId).map((d) => d.kind);
      expect(kinds, c.code).toEqual(expect.arrayContaining(['climate', 'door', 'vibration']));
    }
    expect(museum.devicesAt(museum.roomByCode('LOBBY').unitId).map((d) => d.kind)).toContain('counter');
    for (const code of ['ST-A', 'ST-B', 'ST-C', 'TMP', 'DOCK'])
      expect(museum.devicesAt(museum.roomByCode(code).unitId).map((d) => d.kind)).toContain('rfid');
    // 设备都在它监测的房间或展示柜所在的房间里
    for (const d of museum.devices) {
      const room = museum.roomOf(d.unitId);
      expect(booleanPointInPolygon(d.coord, unitGeometry(room.unitId)), d.code).toBe(true);
    }
  });

  it('has two patrol routes covering every floor and three tours that start in the entrance hall', () => {
    const patrols = museum.routes.filter((r) => r.kind === 'patrol');
    expect(patrols.map((r) => r.code)).toEqual(['PATROL-A', 'PATROL-B']);
    const covered = new Set(patrols.flatMap((r) => r.stops.map((s) => museum.roomOf(s.unitId).levelId)));
    expect([...covered].map(short).sort()).toEqual(['1F', '2F', '3F', 'B1']);
    const tours = museum.routes.filter((r) => r.kind === 'tour');
    expect(tours.map((r) => r.code)).toEqual(['TOUR-HIGHLIGHTS', 'TOUR-JAPAN', 'TOUR-SPECIAL']);
    for (const t of tours) {
      expect(near(t.path[0]!.coord, museum.roomByCode('LOBBY').center)).toBe(true);
      for (const s of t.stops) expect(near(t.path[s.index]!.coord, museum.room(s.unitId).center)).toBe(true);
    }
  });

  it('changes floors only through the elevator', () => {
    for (const r of museum.routes) {
      for (let i = 1; i < r.path.length; i++) {
        const a = r.path[i - 1]!;
        const b = r.path[i]!;
        if (a.levelId === b.levelId) continue;
        const core = museum.rooms.find((x) => x.kind === 'core' && x.levelId === a.levelId)!;
        expect(near(a.coord, core.center), r.code).toBe(true);
      }
    }
  });
});
