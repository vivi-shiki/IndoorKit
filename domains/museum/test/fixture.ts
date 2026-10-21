import { buildVenueModel, type ImdfArchive, type RawFeature } from '@indoorkit/imdf';
import { createMuseum, museumExtensions } from '../src/index';

/**
 * 小型博物馆：两层，走廊在 y 10–14。
 *
 * 1F：展示室 G1（x 0–20，y 0–10，定员 20）里有两个展示柜 C1（纸本）、C2（陶瓷）；
 *     库房 S1（x 20–30，职员专用）放着和 C1 同一系列的纸本；楼梯间 CORE-1F（x 30–36）。
 * 2F：展示室 G2（x 0–20）里一个展示柜 C3（指定文化财的油画）；楼梯间 CORE-2F。
 * 门在房间朝走廊的一边正中，门外 2 m 是走廊上的点（hall）。
 */
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const M_PER_LNG = 111_320;
const M_PER_LAT = 110_540;
export const at = (x: number, y: number): [number, number] => [x / M_PER_LNG, y / M_PER_LAT];
const rect = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon' as const,
  coordinates: [[at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)]],
});

export const LEVELS = { l1: uid(0x10), l2: uid(0x11) };
export const UNITS = {
  g1: uid(0x20),
  s1: uid(0x21),
  core1: uid(0x22),
  hall1: uid(0x23),
  g2: uid(0x24),
  core2: uid(0x25),
  hall2: uid(0x26),
  c1: uid(0x30),
  c2: uid(0x31),
  c3: uid(0x32),
};

let next = 0x1000;
const feature = (
  feature_type: string,
  geometry: RawFeature['geometry'],
  properties: RawFeature['properties'],
  id = uid(next++),
) => ({ type: 'Feature', id, feature_type, geometry, properties }) as RawFeature;

/** 藏品 id：OBJECTS['O-1'] */
export const OBJECTS: Record<string, string> = {};
/** 设备 id：DEVICES['CL-G1'] */
export const DEVICES: Record<string, string> = {};

function build(): ImdfArchive {
  next = 0x1000;
  const label = (en: string) => ({ en, ja: en });
  const unit = (
    id: string,
    levelId: string,
    r: [number, number, number, number],
    category: string,
    name: string,
  ) => feature('unit', rect(...r), { category, level_id: levelId, name: label(name) }, id);
  const units = [
    unit(UNITS.g1, LEVELS.l1, [0, 0, 20, 10], 'room', 'Gallery 1'),
    unit(UNITS.s1, LEVELS.l1, [20, 0, 30, 10], 'storage', 'Storage 1'),
    unit(UNITS.core1, LEVELS.l1, [30, 0, 36, 10], 'stairs', 'Stairs'),
    unit(UNITS.hall1, LEVELS.l1, [0, 10, 36, 14], 'walkway', 'Hall'),
    unit(UNITS.g2, LEVELS.l2, [0, 0, 20, 10], 'room', 'Gallery 2'),
    unit(UNITS.core2, LEVELS.l2, [30, 0, 36, 10], 'stairs', 'Stairs'),
    unit(UNITS.hall2, LEVELS.l2, [0, 10, 36, 14], 'walkway', 'Hall'),
    unit(UNITS.c1, LEVELS.l1, [2, 1, 6, 2], 'unspecified', 'C1'),
    unit(UNITS.c2, LEVELS.l1, [10, 4, 12, 6], 'unspecified', 'C2'),
    unit(UNITS.c3, LEVELS.l2, [2, 1, 6, 2], 'unspecified', 'C3'),
  ];

  const room = (
    unitId: string,
    code: string,
    kind: string,
    access: string,
    capacity: number | null,
    exhibition: string | null,
    doorX: number,
  ) =>
    feature('museum_room', null, {
      unit_id: unitId,
      code,
      kind,
      access,
      capacity,
      exhibition,
      door: at(doorX, 9),
      hall: at(doorX, 12),
    });
  const space = [
    feature('museum_exhibition', null, {
      code: 'PERM',
      name: label('Permanent collection'),
      kind: 'permanent',
    }),
    room(UNITS.g1, 'G1', 'gallery', 'public', 20, 'PERM', 10),
    room(UNITS.s1, 'S1', 'storage', 'staff', null, null, 25),
    room(UNITS.core1, 'CORE-1F', 'core', 'public', null, null, 33),
    room(UNITS.g2, 'G2', 'gallery', 'public', 20, 'PERM', 10),
    room(UNITS.core2, 'CORE-2F', 'core', 'public', null, null, 33),
  ];
  const cases = [
    feature('museum_case', null, {
      unit_id: UNITS.c1,
      code: 'C1',
      room_id: UNITS.g1,
      kind: 'wall',
      sealed: true,
    }),
    feature('museum_case', null, {
      unit_id: UNITS.c2,
      code: 'C2',
      room_id: UNITS.g1,
      kind: 'freestanding',
      sealed: false,
    }),
    feature('museum_case', null, {
      unit_id: UNITS.c3,
      code: 'C3',
      room_id: UNITS.g2,
      kind: 'single',
      sealed: true,
    }),
  ];

  const object = (
    code: string,
    material: string,
    status: string,
    location: string | null,
    extra: { designated?: boolean; series?: string } = {},
  ) => {
    const f = feature('museum_object', null, {
      code,
      title: label(`Object ${code}`),
      artist: label('Anonymous'),
      period: label('19th century'),
      material,
      designated: extra.designated ?? false,
      status,
      location,
      series: extra.series ?? null,
    });
    OBJECTS[code] = f.id;
    return f;
  };
  const objects = [
    object('O-1', 'paper', 'display', UNITS.c1, { series: 'scrolls' }),
    object('O-2', 'ceramic', 'display', UNITS.c2),
    object('O-3', 'paper', 'storage', UNITS.s1, { series: 'scrolls' }),
    object('O-4', 'painting', 'display', UNITS.c3, { designated: true }),
    object('O-5', 'textile', 'loan', null),
  ];

  const device = (code: string, kind: string, levelId: string, unitId: string, xy: [number, number]) => {
    const f = feature(
      'museum_device',
      { type: 'Point', coordinates: at(...xy) },
      {
        code,
        kind,
        level_id: levelId,
        unit_id: unitId,
      },
    );
    DEVICES[code] = f.id;
    return f;
  };
  const devices = [
    device('CL-G1', 'climate', LEVELS.l1, UNITS.g1, [15, 8]),
    device('CL-C1', 'climate', LEVELS.l1, UNITS.c1, [3, 1.5]),
    device('CL-C2', 'climate', LEVELS.l1, UNITS.c2, [11, 5]),
    device('LX-C1', 'light', LEVELS.l1, UNITS.c1, [4, 1.5]),
    device('CO2-G1', 'co2', LEVELS.l1, UNITS.g1, [16, 8]),
    device('MO-G1', 'motion', LEVELS.l1, UNITS.g1, [18, 8]),
    device('MO-S1', 'motion', LEVELS.l1, UNITS.s1, [28, 8]),
    device('DR-C1', 'door', LEVELS.l1, UNITS.c1, [5, 1.5]),
    device('VB-C1', 'vibration', LEVELS.l1, UNITS.c1, [5, 1.8]),
    device('PX-C2', 'proximity', LEVELS.l1, UNITS.c2, [11, 6.5]),
    device('RF-G1', 'rfid', LEVELS.l1, UNITS.g1, [10, 9.5]),
    device('RF-S1', 'rfid', LEVELS.l1, UNITS.s1, [25, 9.5]),
    device('CT-G1', 'counter', LEVELS.l1, UNITS.g1, [10, 9.8]),
    device('BC-G1', 'beacon', LEVELS.l1, UNITS.g1, [10, 5]),
  ];

  // 巡逻：1F 走廊从 x 0 走到 x 30，检查点在 G1 门外和 S1 门外；导览：G1 → 楼梯 → G2
  const point = (levelId: string, x: number, y: number) => ({ level_id: levelId, coord: at(x, y) });
  const routes = [
    feature('museum_route', null, {
      code: 'P1',
      kind: 'patrol',
      name: label('Patrol 1'),
      minutes: 30,
      path: [
        point(LEVELS.l1, 0, 12),
        point(LEVELS.l1, 10, 12),
        point(LEVELS.l1, 25, 12),
        point(LEVELS.l1, 30, 12),
      ],
      stops: [
        { unit_id: UNITS.g1, index: 1, code: 'CP-1' },
        { unit_id: UNITS.s1, index: 3, code: 'CP-2' },
      ],
    }),
    feature('museum_route', null, {
      code: 'T1',
      kind: 'tour',
      name: label('Highlights'),
      minutes: 20,
      path: [
        point(LEVELS.l1, 10, 5),
        point(LEVELS.l1, 33, 12),
        point(LEVELS.l2, 33, 12),
        point(LEVELS.l2, 10, 5),
      ],
      stops: [
        { unit_id: UNITS.g1, index: 0, code: 'G1' },
        { unit_id: UNITS.g2, index: 3, code: 'G2' },
      ],
    }),
  ];

  const fc = (features: RawFeature[]) => ({ type: 'FeatureCollection' as const, features });
  return {
    manifest: { version: '1.0.0', created: '2026-01-01T00:00:00Z', language: 'ja' },
    venue: fc([
      feature('venue', rect(-5, -5, 40, 20), {
        category: 'museum',
        name: { en: 'Test Museum', ja: 'テスト美術館' },
        display_point: { type: 'Point', coordinates: at(18, 7) },
      }),
    ]),
    building: fc([feature('building', null, { category: 'unspecified', name: label('Main') }, uid(0x1))]),
    level: fc(
      [LEVELS.l1, LEVELS.l2].map((id, i) =>
        feature(
          'level',
          rect(0, 0, 36, 14),
          {
            category: 'unspecified',
            ordinal: i,
            outdoor: false,
            name: label(`Level ${i + 1}`),
            short_name: label(`${i + 1}F`),
            building_ids: [uid(0x1)],
          },
          id,
        ),
      ),
    ),
    unit: fc(units),
    opening: fc([]),
    fixture: fc([]),
    amenity: fc([]),
    'museum-space': fc(space),
    'museum-case': fc(cases),
    'museum-object': fc(objects),
    'museum-device': fc(devices),
    'museum-route': fc(routes),
  } as ImdfArchive;
}

export const makeArchive = build;
export const makeMuseum = () => createMuseum(buildVenueModel(build(), museumExtensions));
