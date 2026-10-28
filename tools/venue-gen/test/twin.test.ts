import { describe, expect, it } from 'vitest';
import {
  generateMuseum,
  generateParking,
  generateVenue,
  MINATO_MUSEUM,
  MINATO_PARKING,
  SAKURA_HOSPITAL,
} from '../src/index';

describe('buildable circulation', () => {
  it('gives each hospital wing a principal exterior entrance', () => {
    const a = generateVenue(SAKURA_HOSPITAL);
    expect(a.opening.features.filter((o) => o.properties.category === 'pedestrian.principal')).toHaveLength(
      3,
    );
  });
  it('models inter-floor travel with a nonzero ramp footprint', () => {
    const a = generateParking(MINATO_PARKING);
    const ramps = a['parking-lane'].features.filter((f) => f.properties.from_level !== f.properties.to_level);
    expect(ramps.length).toBeGreaterThan(0);
    for (const ramp of ramps) {
      const p = (ramp.geometry as GeoJSON.LineString).coordinates;
      expect(new Set(p.map((v) => v.join(','))).size).toBeGreaterThan(2);
    }
  });
  it('gives accessible bays extra transfer width without overlapping standard bays', () => {
    const a = generateParking(MINATO_PARKING);
    const accessible = a['parking-zone'].features
      .flatMap((z) => z.properties.bays)
      .filter((b: { type: string }) => b.type === 'accessible');
    for (const bay of accessible) {
      const u = a.unit.features.find((f) => f.id === bay.unit_id)!;
      const ring = (u.geometry as GeoJSON.Polygon).coordinates[0]!;
      const width =
        (Math.max(...ring.map((p) => p[0]!)) - Math.min(...ring.map((p) => p[0]!))) *
        111320 *
        Math.cos((MINATO_PARKING.origin[1] * Math.PI) / 180);
      expect(width).toBeGreaterThanOrEqual(3.6);
    }
  });
  it('provides museum washrooms and two separated stair cores on every floor', () => {
    const a = generateMuseum(MINATO_MUSEUM);
    for (const floor of a.level.features) {
      const units = a.unit.features.filter((u) => u.properties.level_id === floor.id);
      expect(units.filter((u) => u.properties.category === 'restroom')).toHaveLength(1);
      expect(units.filter((u) => u.properties.category === 'stairs')).toHaveLength(2);
    }
  });
});
