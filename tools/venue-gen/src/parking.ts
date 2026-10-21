import type { ImdfArchive, LabelMap, RawCollection, RawFeature } from '@indoorkit/imdf';
import type { BayType, Detection, DeviceKind, ZoneKind } from '@indoorkit/parking';
import type { Polygon } from 'geojson';
import { makeUuid } from './uuid';

export interface ParkingGenOptions {
  seed: string;
  name: LabelMap;
  /** 场馆中心经纬度（虚构地点） */
  origin: [number, number];
}

export const MINATO_PARKING: ParkingGenOptions = {
  seed: 'minato-parking',
  name: { ja: 'みなと中央パーキング', en: 'Minato Central Parking', zh: '港中央停车场' },
  // 海上的虚构坐标，和医院、真实停车场都不重合
  origin: [139.95, 35.15],
};

/** 标准 IMDF 文件加上停车场的三个扩展文件 */
export type ParkingArchive = ImdfArchive & {
  'parking-zone': RawCollection;
  'parking-device': RawCollection;
  'parking-lane': RawCollection;
};

type Rect = [number, number, number, number];
type XY = [number, number];

/**
 * 布局（米，x 向东、y 向北）。
 *
 * 立体停车场每层 4 排车位，每排 18 个（2.5 × 5 m）：
 *   A 排 y 0–5 ─ 车道 1（y 5–11，中心 8，向东）─ B 排 y 11–16 ─ C 排 y 16–21
 *   ─ 车道 2（y 21–27，中心 24，向西）─ D 排 y 27–32
 * 两端是纵向车道：西侧 x 0–6（中心 3，向南），东侧 x 51–57（中心 54，向北），合成一个逆时针的单向环。
 * 东侧 x 57–63 是电梯、坡道和楼梯；坡道在 (60, 16) 连接上下层，双向。
 * 1F 南侧 x 0–6 是入口（向北接入车道 1 的起点），x 51–57 是出口（从车道 1 的终点向南）。
 *
 * 平面停车场在东边 75 m 处：A 排 24 个（y 0–5），车道（y 5–11，双向），
 * 北侧是 8 个大型车位（3.5 × 8 m）和 B 排 12 个；西侧 x 0–6 是唯一的出入口。
 */
const BAY_W = 2.5;
const BAY_D = 5;
const ROW = 18;
const GARAGE: Rect = [0, -6, 63, 32];
const SURFACE_X = 75;
const SURFACE: Rect = [SURFACE_X, -6, SURFACE_X + 72, 19];
const FLOORS = 4;

const NAMES = {
  garage: { ja: '立体駐車場', en: 'Parking garage', zh: '立体停车楼' },
  surface: { ja: '平面駐車場', en: 'Surface lot', zh: '地面停车场' },
  ramp: { ja: 'スロープ', en: 'Ramp', zh: '坡道' },
  elevator: { ja: 'エレベーター', en: 'Elevator', zh: '电梯' },
  stairs: { ja: '階段', en: 'Stairs', zh: '楼梯' },
};
const zoneName = (letter: string): LabelMap => ({
  ja: `${letter}エリア`,
  en: `Zone ${letter}`,
  zh: `${letter} 区`,
});
const LARGE_ZONE: LabelMap = { ja: '大型車エリア', en: 'Large vehicle zone', zh: '大型车区' };

export function generateParking(options: ParkingGenOptions): ParkingArchive {
  const id = (key: string) => makeUuid(options.seed, key);
  const [lng0, lat0] = options.origin;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 110_540;
  const cx = (GARAGE[0] + SURFACE[2]) / 2;
  const cy = (GARAGE[1] + GARAGE[3]) / 2;
  const round = (v: number) => Math.round(v * 1e8) / 1e8;
  const ll = ([x, y]: XY): XY => [round(lng0 + (x - cx) / mPerLng), round(lat0 + (y - cy) / mPerLat)];
  const polygon = ([x0, y0, x1, y1]: Rect): Polygon => ({
    type: 'Polygon',
    coordinates: [[ll([x0, y0]), ll([x1, y0]), ll([x1, y1]), ll([x0, y1]), ll([x0, y0])]],
  });
  const feature = (
    featureType: string,
    key: string,
    geometry: RawFeature['geometry'],
    properties: RawFeature['properties'],
  ): RawFeature => ({ type: 'Feature', id: id(key), feature_type: featureType, geometry, properties });
  const fc = (features: RawFeature[]): RawCollection => ({ type: 'FeatureCollection', features });

  const buildings = (['garage', 'surface'] as const).map((b) =>
    feature('building', `building/${b}`, null, { category: 'parking', name: NAMES[b] }),
  );
  const levels: RawFeature[] = [];
  const units: RawFeature[] = [];
  const openings: RawFeature[] = [];
  const zones: RawFeature[] = [];
  const devices: RawFeature[] = [];
  const lanes: RawFeature[] = [];

  const unit = (key: string, levelId: string, rect: Rect, category: string, name: LabelMap | null = null) => {
    const f = feature('unit', `unit/${key}`, polygon(rect), { category, level_id: levelId, name });
    units.push(f);
    return f.id;
  };
  const device = (code: string, kind: DeviceKind, levelId: string, at: XY, unitIds: string[] = []) =>
    devices.push(
      feature(
        'parking_device',
        `device/${code}`,
        { type: 'Point', coordinates: ll(at) },
        {
          code,
          kind,
          level_id: levelId,
          unit_ids: unitIds,
        },
      ),
    );
  const lane = (key: string, from: string, to: string, coords: XY[], oneway: boolean) =>
    lanes.push(
      feature(
        'parking_lane',
        `lane/${key}`,
        { type: 'LineString', coordinates: coords.map(ll) },
        {
          from_level: from,
          to_level: to,
          oneway,
        },
      ),
    );
  const gateway = (key: string, levelId: string, role: string, at: XY) =>
    lanes.push(
      feature(
        'parking_gateway',
        `gateway/${key}`,
        { type: 'Point', coordinates: ll(at) },
        { level_id: levelId, role },
      ),
    );
  const opening = (key: string, levelId: string, a: XY, b: XY, category: string) =>
    openings.push(
      feature(
        'opening',
        `opening/${key}`,
        { type: 'LineString', coordinates: [ll(a), ll(b)] },
        { category, level_id: levelId },
      ),
    );

  interface RowSpec {
    letter: string;
    name?: LabelMap;
    kind: ZoneKind;
    site: 'garage' | 'surface';
    /** 车位左下角的 x、y，宽、深 */
    x: number;
    y: number;
    count: number;
    width?: number;
    depth?: number;
    type: (i: number) => BayType;
    detection: Detection;
  }
  /** 一排车位成为一个区；返回车位 id */
  const row = (levelId: string, prefix: string, spec: RowSpec) => {
    const w = spec.width ?? BAY_W;
    const d = spec.depth ?? BAY_D;
    const bays = Array.from({ length: spec.count }, (_, i) => {
      const number = `${spec.letter}${String(i + 1).padStart(2, '0')}`;
      const code = `${prefix}-${number}`;
      const rect: Rect = [spec.x + i * w, spec.y, spec.x + (i + 1) * w, spec.y + d];
      const unitId = unit(`bay/${code}`, levelId, rect, 'parking', { ja: number, en: number, zh: number });
      return { unit_id: unitId, code, type: spec.type(i), detection: spec.detection, rect };
    });
    zones.push(
      feature('parking_zone', `zone/${prefix}-${spec.letter}`, null, {
        code: `${prefix}-${spec.letter}`,
        name: spec.name ?? zoneName(spec.letter),
        kind: spec.kind,
        site: spec.site,
        bays: bays.map(({ rect: _, ...b }) => b),
      }),
    );
    return bays;
  };
  const center = ([x0, y0, x1, y1]: Rect): XY => [(x0 + x1) / 2, (y0 + y1) / 2];

  // 立体停车场
  const garageLevels: string[] = [];
  for (let f = 0; f < FLOORS; f++) {
    const short = `${f + 1}F`;
    const roof = f === FLOORS - 1;
    const levelId = id(`level/${short}`);
    garageLevels.push(levelId);
    levels.push(
      feature('level', `level/${short}`, polygon(GARAGE), {
        category: 'parking',
        ordinal: f,
        outdoor: roof,
        name: roof
          ? { ja: `${f + 1}階（屋上）`, en: `Level ${f + 1} (rooftop)`, zh: `${f + 1}层（屋顶）` }
          : { ja: `${f + 1}階`, en: `Level ${f + 1}`, zh: `${f + 1}层` },
        short_name: { ja: short, en: short, zh: short },
        building_ids: [buildings[0]!.id],
      }),
    );
    const firstFloor = f === 0;
    const rowType =
      (letter: string) =>
      (i: number): BayType => {
        if (roof && (letter === 'A' || letter === 'B')) return 'monthly';
        if (firstFloor && letter === 'A') return i < 6 ? 'ev' : i >= ROW - 2 ? 'accessible' : 'standard';
        return 'standard';
      };
    const rows: [string, number][] = [
      ['A', 0],
      ['B', 11],
      ['C', 16],
      ['D', 27],
    ];
    for (const [letter, y] of rows) {
      const bays = row(levelId, short, {
        letter,
        kind: roof && (letter === 'A' || letter === 'B') ? 'monthly' : 'general',
        site: 'garage',
        x: 6,
        y,
        count: ROW,
        type: rowType(letter),
        detection: 'sensor',
      });
      for (const b of bays) {
        device(`S-${b.code}`, 'bay-sensor', levelId, center(b.rect), [b.unit_id]);
        if (b.type === 'ev') {
          const [x0, y0, x1] = b.rect;
          device(`EV-${b.code.slice(-2)}`, 'charger', levelId, [(x0 + x1) / 2, y0 + 0.4], [b.unit_id]);
        }
      }
    }
    unit(`road/${short}/aisle1`, levelId, [6, 5, 51, 11], 'road');
    unit(`road/${short}/aisle2`, levelId, [6, 21, 51, 27], 'road');
    unit(`road/${short}/west`, levelId, [0, 0, 6, 32], 'road');
    unit(`road/${short}/east`, levelId, [51, 0, 57, 32], 'road');
    unit(`elevator/${short}`, levelId, [57, 0, 63, 5], 'elevator', NAMES.elevator);
    unit(`ramp/${short}`, levelId, [57, 5, 63, 27], 'ramp', NAMES.ramp);
    unit(`stairs/${short}`, levelId, [57, 27, 63, 32], 'stairs', NAMES.stairs);
    opening(`elevator/${short}`, levelId, [57, 1.5], [57, 3.5], 'pedestrian');
    opening(`stairs/${short}`, levelId, [57, 28.5], [57, 30.5], 'pedestrian');

    // 逆时针单向环；东侧纵向车道在 (54, 16) 接坡道
    lane(
      `${short}/aisle1`,
      levelId,
      levelId,
      [
        [3, 8],
        [54, 8],
      ],
      true,
    );
    lane(
      `${short}/east`,
      levelId,
      levelId,
      [
        [54, 8],
        [54, 16],
        [54, 24],
      ],
      true,
    );
    lane(
      `${short}/aisle2`,
      levelId,
      levelId,
      [
        [54, 24],
        [3, 24],
      ],
      true,
    );
    lane(
      `${short}/west`,
      levelId,
      levelId,
      [
        [3, 24],
        [3, 8],
      ],
      true,
    );
    lane(
      `${short}/ramp-stub`,
      levelId,
      levelId,
      [
        [54, 16],
        [60, 16],
      ],
      false,
    );
    if (f > 0)
      lane(
        `ramp/${f}`,
        garageLevels[f - 1]!,
        levelId,
        [
          [60, 16],
          [60, 16],
        ],
        false,
      );

    device(`DISP-${short}`, 'display', levelId, [48, 14]);
    if (!roof) {
      device(`CO-${short}-1`, 'co-sensor', levelId, [20, 16]);
      device(`CO-${short}-2`, 'co-sensor', levelId, [40, 16]);
    }
  }
  // 1F 的出入口
  const f1 = garageLevels[0]!;
  unit('road/1F/entry', f1, [0, -6, 6, 0], 'road');
  unit('road/1F/exit', f1, [51, -6, 57, 0], 'road');
  lane(
    '1F/entry',
    f1,
    f1,
    [
      [3, -5],
      [3, 8],
    ],
    true,
  );
  lane(
    '1F/exit',
    f1,
    f1,
    [
      [54, 8],
      [54, -5],
    ],
    true,
  );
  gateway('1F/entry', f1, 'entry', [3, -5]);
  gateway('1F/exit', f1, 'exit', [54, -5]);
  opening('1F/entry', f1, [0, -1], [6, -1], 'automobile');
  opening('1F/exit', f1, [51, -1], [57, -1], 'automobile');
  device('G-IN', 'gate', f1, [3, -1]);
  device('G-OUT', 'gate', f1, [54, -1]);
  device('LPR-IN', 'lpr-camera', f1, [1, -2]);
  device('LPR-OUT', 'lpr-camera', f1, [56, -2]);
  device('DISP-ENT', 'display', f1, [5, -4]);
  device('TEL-IN', 'intercom', f1, [5, -1]);
  device('TEL-OUT', 'intercom', f1, [52, -1]);
  device('PAY-1F', 'pay-station', f1, [52, -3]);

  // 平面停车场
  const p2 = id('level/P2');
  levels.push(
    feature('level', 'level/P2', polygon(SURFACE), {
      category: 'parking',
      ordinal: 0,
      outdoor: true,
      name: { ja: '第2駐車場（平面）', en: 'Surface lot P2', zh: 'P2 地面停车场' },
      short_name: { ja: 'P2', en: 'P2', zh: 'P2' },
      building_ids: [buildings[1]!.id],
    }),
  );
  const sx = SURFACE_X;
  const rowA = row(p2, 'P2', {
    letter: 'A',
    kind: 'general',
    site: 'surface',
    x: sx + 6,
    y: 0,
    count: 24,
    type: () => 'standard',
    detection: 'sensor',
  });
  for (const b of rowA) {
    device(`S-${b.code}`, 'bay-sensor', p2, center(b.rect), [b.unit_id]);
    device(`FLAP-${b.code}`, 'flap', p2, [center(b.rect)[0], b.rect[1] + 2], [b.unit_id]);
  }
  const rowB = row(p2, 'P2', {
    letter: 'B',
    kind: 'general',
    site: 'surface',
    x: sx + 34,
    y: 11,
    count: 12,
    type: () => 'standard',
    detection: 'camera',
  });
  const rowL = row(p2, 'P2', {
    letter: 'L',
    name: LARGE_ZONE,
    kind: 'large',
    site: 'surface',
    x: sx + 6,
    y: 11,
    count: 8,
    width: 3.5,
    depth: 8,
    type: () => 'large',
    detection: 'camera',
  });
  device(
    'CAM-P2-B',
    'ai-camera',
    p2,
    [sx + 49, 18.5],
    rowB.map((b) => b.unit_id),
  );
  device(
    'CAM-P2-L',
    'ai-camera',
    p2,
    [sx + 20, 18.5],
    rowL.map((b) => b.unit_id),
  );
  unit('road/P2/aisle', p2, [sx + 6, 5, sx + 66, 11], 'road');
  unit('road/P2/access', p2, [sx, -6, sx + 6, 19], 'road');
  lane(
    'P2/access',
    p2,
    p2,
    [
      [sx + 3, -5],
      [sx + 3, 8],
      [sx + 66, 8],
    ],
    false,
  );
  gateway('P2', p2, 'both', [sx + 3, -5]);
  opening('P2/entry', p2, [sx, -1], [sx + 6, -1], 'automobile');
  device('LPR-P2', 'lpr-camera', p2, [sx + 1, -2]);
  device('DISP-P2', 'display', p2, [sx + 8, -3]);
  device('TEL-P2', 'intercom', p2, [sx + 5, -1]);

  const venue = feature(
    'venue',
    'venue',
    polygon([GARAGE[0] - 6, GARAGE[1] - 4, SURFACE[2] + 6, GARAGE[3] + 6]),
    {
      category: 'parking',
      name: options.name,
      alt_name: null,
      display_point: { type: 'Point', coordinates: ll([cx, cy]) },
    },
  );

  return {
    manifest: {
      version: '1.0.0',
      created: '2026-01-01T00:00:00Z',
      language: 'ja',
      generator: 'indoorkit venue-gen',
    },
    venue: fc([venue]),
    building: fc(buildings),
    level: fc(levels),
    unit: fc(units),
    opening: fc(openings),
    fixture: fc([]),
    amenity: fc([]),
    'parking-zone': fc(zones),
    'parking-device': fc(devices),
    'parking-lane': fc(lanes),
  };
}
