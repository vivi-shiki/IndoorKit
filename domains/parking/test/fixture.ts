import { buildVenueModel, type ImdfArchive, type RawFeature } from '@indoorkit/imdf';
import { parkingExtensions } from '../src/index';

/**
 * 小型停车场：立体 2 层（1F、2F）+ 平面场（P2）。
 *
 * 立体每层一排 6 个车位（y 0–5 m），前面是车道（y = 8）；平面场同样一排 6 个。
 * 1F：A 区 = EV、无障碍、普通；B 区 = 3 个月租。2F：A、B 区各 3 个普通。
 * P2：S 区 3 个普通，L 区 3 个大型车位，都由一台 AI 相机识别。
 *
 * 车道（单向，除平面场外）：
 *   1F 入口 (-3,8) → (0,8) → (15,8) → (18,8) ─坡道上→ 2F (18,8) → (0,8) ─坡道下→ 1F (0,8)
 *   1F (15,8) → (15,14) → (0,14) → 出口 (-3,14)
 *   P2 出入口 (-3,8) ⇄ (0,8) ⇄ (15,8)
 */
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
export const M_PER_LNG = 111_320;
export const M_PER_LAT = 110_540;
export const at = (x: number, y: number): [number, number] => [x / M_PER_LNG, y / M_PER_LAT];
const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon' as const,
  coordinates: [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]],
});

export const LEVELS = { l1: uid(0x10), l2: uid(0x11), surface: uid(0x12) };
const BUILDINGS = { garage: uid(0x1), surface: uid(0x2) };

let next = 0x1000;
const feature = (
  feature_type: string,
  geometry: RawFeature['geometry'],
  properties: RawFeature['properties'],
) => ({ type: 'Feature', id: uid(next++), feature_type, geometry, properties }) as RawFeature;

/** 车位 id：BAYS['1F-A01'] */
export const BAYS: Record<string, string> = {};
/** 设备 id：DEVICES['G-IN'] */
export const DEVICES: Record<string, string> = {};

function build(): ImdfArchive {
  next = 0x1000;
  const units: RawFeature[] = [];
  const zones: RawFeature[] = [];
  const devices: RawFeature[] = [];
  const lanes: RawFeature[] = [];

  const row = (
    levelId: string,
    prefix: string,
    groups: { zone: string; kind: string; site: string; types: string[]; detection: string }[],
  ) => {
    let i = 0;
    for (const g of groups) {
      const bays = g.types.map((type, k) => {
        const unit = feature('unit', rect(i * 2.5, 0, i * 2.5 + 2.5, 5), {
          category: 'parking',
          level_id: levelId,
          name: { en: `${g.zone}${String(k + 1).padStart(2, '0')}` },
        });
        units.push(unit);
        i++;
        const code = `${prefix}-${g.zone}${String(k + 1).padStart(2, '0')}`;
        BAYS[code] = unit.id;
        return { unit_id: unit.id, code, type, detection: g.detection };
      });
      zones.push(
        feature('parking_zone', null, {
          code: `${prefix}-${g.zone}`,
          name: { en: `Zone ${g.zone}`, ja: `${g.zone}エリア` },
          kind: g.kind,
          site: g.site,
          bays,
        }),
      );
    }
  };
  row(LEVELS.l1, '1F', [
    {
      zone: 'A',
      kind: 'general',
      site: 'garage',
      types: ['ev', 'accessible', 'standard'],
      detection: 'sensor',
    },
    {
      zone: 'B',
      kind: 'monthly',
      site: 'garage',
      types: ['monthly', 'monthly', 'monthly'],
      detection: 'sensor',
    },
  ]);
  row(LEVELS.l2, '2F', [
    {
      zone: 'A',
      kind: 'general',
      site: 'garage',
      types: ['standard', 'standard', 'standard'],
      detection: 'sensor',
    },
    {
      zone: 'B',
      kind: 'general',
      site: 'garage',
      types: ['standard', 'standard', 'standard'],
      detection: 'sensor',
    },
  ]);
  row(LEVELS.surface, 'P2', [
    {
      zone: 'S',
      kind: 'general',
      site: 'surface',
      types: ['standard', 'standard', 'standard'],
      detection: 'camera',
    },
    { zone: 'L', kind: 'large', site: 'surface', types: ['large', 'large', 'large'], detection: 'camera' },
  ]);
  for (const levelId of Object.values(LEVELS)) {
    units.push(feature('unit', rect(0, 5, 18, 16), { category: 'road', level_id: levelId, name: null }));
    units.push(feature('unit', rect(18, 0, 22, 5), { category: 'elevator', level_id: levelId, name: null }));
  }

  const device = (
    code: string,
    kind: string,
    levelId: string,
    coord: [number, number],
    unitIds: string[] = [],
  ) => {
    const f = feature(
      'parking_device',
      { type: 'Point', coordinates: at(...coord) },
      {
        code,
        kind,
        level_id: levelId,
        unit_ids: unitIds,
      },
    );
    DEVICES[code] = f.id;
    devices.push(f);
  };
  for (const [code, id] of Object.entries(BAYS)) {
    if (!code.startsWith('P2'))
      device(`S-${code}`, 'bay-sensor', code.startsWith('1F') ? LEVELS.l1 : LEVELS.l2, [0, 2.5], [id]);
  }
  device('G-IN', 'gate', LEVELS.l1, [0, 8]);
  device('G-OUT', 'gate', LEVELS.l1, [0, 14]);
  device('LPR-IN', 'lpr-camera', LEVELS.l1, [-1, 8]);
  device('LPR-OUT', 'lpr-camera', LEVELS.l1, [-1, 14]);
  device(
    'CAM-P2',
    'ai-camera',
    LEVELS.surface,
    [7, 10],
    Object.entries(BAYS)
      .filter(([c]) => c.startsWith('P2'))
      .map(([, id]) => id),
  );
  device('FLAP-P2-S01', 'flap', LEVELS.surface, [1.25, 2.5], [BAYS['P2-S01']!]);
  device('DISP-1F', 'display', LEVELS.l1, [2, 9]);
  device('EV-1', 'charger', LEVELS.l1, [1.25, 0.5], [BAYS['1F-A01']!]);
  device('CO-1F', 'co-sensor', LEVELS.l1, [10, 10]);
  device('TEL-1', 'intercom', LEVELS.l1, [0, 9]);

  const lane = (from: string, to: string, coords: [number, number][], oneway = true) =>
    lanes.push(
      feature(
        'parking_lane',
        { type: 'LineString', coordinates: coords.map((c) => at(...c)) },
        {
          from_level: from,
          to_level: to,
          oneway,
        },
      ),
    );
  const gateway = (levelId: string, role: string, coord: [number, number]) =>
    lanes.push(
      feature('parking_gateway', { type: 'Point', coordinates: at(...coord) }, { level_id: levelId, role }),
    );
  const { l1, l2, surface } = LEVELS;
  lane(l1, l1, [
    [-3, 8],
    [0, 8],
  ]);
  lane(l1, l1, [
    [0, 8],
    [15, 8],
  ]);
  lane(l1, l1, [
    [15, 8],
    [18, 8],
  ]);
  lane(l1, l2, [
    [18, 8],
    [18, 8],
  ]);
  lane(l2, l2, [
    [18, 8],
    [0, 8],
  ]);
  lane(l2, l1, [
    [0, 8],
    [0, 8],
  ]);
  lane(l1, l1, [
    [15, 8],
    [15, 14],
    [0, 14],
  ]);
  lane(l1, l1, [
    [0, 14],
    [-3, 14],
  ]);
  lane(
    surface,
    surface,
    [
      [-3, 8],
      [0, 8],
      [15, 8],
    ],
    false,
  );
  gateway(l1, 'entry', [-3, 8]);
  gateway(l1, 'exit', [-3, 14]);
  gateway(surface, 'both', [-3, 8]);

  const fc = (features: RawFeature[]) => ({ type: 'FeatureCollection' as const, features });
  const level = (id: string, ordinal: number, short: string, building: string) => ({
    type: 'Feature' as const,
    id,
    feature_type: 'level',
    geometry: rect(-4, -1, 23, 17),
    properties: {
      category: 'parking',
      ordinal,
      outdoor: building === BUILDINGS.surface,
      name: { en: short },
      short_name: { en: short, ja: short },
      building_ids: [building],
    },
  });
  return {
    manifest: { version: '1.0.0', created: '2026-01-01T00:00:00Z', language: 'ja' },
    venue: fc([
      {
        type: 'Feature',
        id: uid(0x100),
        feature_type: 'venue',
        geometry: rect(-5, -2, 24, 18),
        properties: {
          category: 'parking',
          name: { en: 'Test Parking' },
          display_point: { type: 'Point', coordinates: at(9, 8) },
        },
      },
    ]),
    building: fc([
      {
        type: 'Feature',
        id: BUILDINGS.garage,
        feature_type: 'building',
        geometry: null,
        properties: { category: 'parking', name: { en: 'Garage' } },
      },
      {
        type: 'Feature',
        id: BUILDINGS.surface,
        feature_type: 'building',
        geometry: null,
        properties: { category: 'parking', name: { en: 'Surface lot' } },
      },
    ]),
    level: fc([
      level(LEVELS.l1, 0, '1F', BUILDINGS.garage),
      level(LEVELS.l2, 1, '2F', BUILDINGS.garage),
      level(LEVELS.surface, 0, 'P2', BUILDINGS.surface),
    ]),
    unit: fc(units),
    opening: fc([]),
    'parking-zone': fc(zones),
    'parking-device': fc(devices),
    'parking-lane': fc(lanes),
  };
}

export const makeArchive = build;
export const makeVenue = () => buildVenueModel(build(), parkingExtensions);
