import { buildVenueModel, type RawCollection, validateImdf } from '@indoorkit/imdf';
import { createParking, createRouter, parkingExtensions } from '@indoorkit/parking';
import { describe, expect, it } from 'vitest';
import { generateParking, MINATO_PARKING } from '../src/index';

type Ring = number[][];
const bbox = (ring: Ring) => {
  const xs = ring.map((p) => p[0]!);
  const ys = ring.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};
const outer = (f: { geometry: unknown }) => (f.geometry as GeoJSON.Polygon).coordinates[0] as Ring;
const EPS = 1e-9;

const archive = generateParking(MINATO_PARKING);
const venue = buildVenueModel(archive, parkingExtensions);
const parking = createParking(venue);
const short = (levelId: string) => venue.levels.find((l) => l.id === levelId)!.shortName.en;
const count = (pred: (b: (typeof parking.bays)[number]) => boolean) => parking.bays.filter(pred).length;

describe('generateParking', () => {
  it('produces an archive that passes IMDF and parking-extension validation', () => {
    const result = validateImdf(archive, parkingExtensions);
    if (!result.ok) throw new Error(JSON.stringify(result.issues.slice(0, 5)));
    expect(result.ok).toBe(true);
  });

  it('names the fictional venue in three languages', () => {
    expect(venue.name).toEqual({
      ja: 'みなと中央パーキング',
      en: 'Minato Central Parking',
      zh: '港中央停车场',
    });
  });

  it('has a four-floor garage with a rooftop and a surface lot', () => {
    expect(parking.garageLevels.map(short)).toEqual(['1F', '2F', '3F', '4F']);
    expect(parking.surfaceLevels.map(short)).toEqual(['P2']);
    expect(archive.building.features.map((b) => b.properties.name.en)).toEqual([
      'Parking garage',
      'Surface lot',
    ]);
  });

  it('has 331 bays, with one standard bay exchanged for accessible transfer width on 1F', () => {
    expect(parking.bays.length).toBe(331);
    for (const levelId of parking.garageLevels)
      expect(count((b) => b.levelId === levelId)).toBe(short(levelId) === '1F' ? 71 : 72);
    expect(count((b) => b.levelId === parking.surfaceLevels[0])).toBe(44);
  });

  it('puts EV and accessible bays on 1F, monthly bays on the roof and large bays in the surface lot', () => {
    const [f1, , , f4] = parking.garageLevels;
    expect(count((b) => b.type === 'ev')).toBe(6);
    expect(count((b) => b.type === 'ev' && b.levelId === f1)).toBe(6);
    expect(count((b) => b.type === 'accessible' && b.levelId === f1)).toBe(2);
    expect(count((b) => b.type === 'monthly')).toBe(36);
    expect(count((b) => b.type === 'monthly' && b.levelId === f4)).toBe(36);
    expect(count((b) => b.type === 'large' && b.levelId === parking.surfaceLevels[0])).toBe(8);
    expect(parking.zones.map((z) => z.code)).toEqual([
      '1F-A',
      '1F-B',
      '1F-C',
      '1F-D',
      '2F-A',
      '2F-B',
      '2F-C',
      '2F-D',
      '3F-A',
      '3F-B',
      '3F-C',
      '3F-D',
      '4F-A',
      '4F-B',
      '4F-C',
      '4F-D',
      'P2-A',
      'P2-B',
      'P2-L',
    ]);
  });

  it('detects every bay: garage bays and surface row A by sensor, the rest by AI cameras', () => {
    for (const bay of parking.bays) {
      const kinds = parking.devicesOfBay(bay.id).map((d) => d.kind);
      expect(kinds, bay.code).toContain(bay.detection === 'sensor' ? 'bay-sensor' : 'ai-camera');
    }
    expect(parking.bays.filter((b) => b.detection === 'camera').map((b) => b.code.slice(0, 4))).toEqual(
      expect.arrayContaining(['P2-B', 'P2-L']),
    );
    for (const bay of parking.bays.filter((b) => b.zoneId === parking.zoneByCode('P2-A').id)) {
      expect(parking.devicesOfBay(bay.id).map((d) => d.kind)).toContain('flap');
    }
    for (const bay of parking.bays.filter((b) => b.type === 'ev')) {
      expect(parking.devicesOfBay(bay.id).map((d) => d.kind)).toContain('charger');
    }
  });

  it('has gates, plate cameras, displays, CO sensors, intercoms and a pay station', () => {
    const kinds = (k: string) => parking.devices.filter((d) => d.kind === k).map((d) => d.code);
    expect(kinds('gate')).toEqual(['G-IN', 'G-OUT']);
    expect(kinds('lpr-camera')).toEqual(['LPR-IN', 'LPR-OUT', 'LPR-P2']);
    expect(kinds('display').sort()).toEqual([
      'DISP-1F',
      'DISP-2F',
      'DISP-3F',
      'DISP-4F',
      'DISP-ENT',
      'DISP-P2',
    ]);
    expect(kinds('co-sensor')).toHaveLength(6);
    expect(kinds('intercom').length).toBeGreaterThanOrEqual(3);
    expect(kinds('pay-station')).toEqual(['PAY-1F']);
  });

  it('can drive to and from every bay', () => {
    const router = createRouter(parking);
    for (const bay of parking.bays) {
      expect(router.toBay(bay.id).meters, bay.code).toBeGreaterThan(0);
      expect(router.fromBay(bay.id).meters, bay.code).toBeGreaterThan(0);
    }
  });

  it('reaches the rooftop by the ramps, floor by floor', () => {
    const router = createRouter(parking);
    const route = router.toBay(parking.bayByCode('4F-C05').id);
    expect(route.levels.map(short)).toEqual(['1F', '2F', '3F', '4F']);
    expect(router.fromBay(parking.bayByCode('4F-C05').id).levels.map(short)).toEqual([
      '4F',
      '3F',
      '2F',
      '1F',
    ]);
  });

  it('places units inside their level and never lets them overlap', () => {
    for (const level of archive.level.features) {
      const [lx0, ly0, lx1, ly1] = bbox(outer(level));
      const units = archive.unit.features.filter((u) => u.properties.level_id === level.id);
      const boxes = units.map((u) => bbox(outer(u)));
      for (const [x0, y0, x1, y1] of boxes) {
        expect(x0 >= lx0 - EPS && y0 >= ly0 - EPS && x1 <= lx1 + EPS && y1 <= ly1 + EPS).toBe(true);
      }
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

  it('labels bays with their number and ramps, elevators and stairs in three languages', () => {
    const bay = archive.unit.features.find((u) => u.id === parking.bayByCode('2F-B07').id)!;
    expect(bay.properties.name).toEqual({ ja: 'B07', en: 'B07', zh: 'B07' });
    for (const category of ['ramp', 'elevator', 'stairs']) {
      const unit = archive.unit.features.find((u) => u.properties.category === category)!;
      for (const lang of ['ja', 'en', 'zh']) expect(unit.properties.name[lang], category).toBeTruthy();
    }
  });

  it('sits away from the hospital, on its own fictional coordinates', () => {
    const [lng, lat] = archive.venue.features[0]!.properties.display_point.coordinates;
    expect(lng).toBeCloseTo(MINATO_PARKING.origin[0], 3);
    expect(lat).toBeCloseTo(MINATO_PARKING.origin[1], 3);
  });

  it('is deterministic and uses unique ids', () => {
    expect(generateParking(MINATO_PARKING)).toEqual(archive);
    const files = [
      'venue',
      'building',
      'level',
      'unit',
      'opening',
      'parking-zone',
      'parking-device',
      'parking-lane',
    ];
    const ids = files.flatMap((f) => (archive[f] as RawCollection).features.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
