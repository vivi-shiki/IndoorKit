import type { ImdfArchive, LabelMap, RawCollection, RawFeature } from '@indoorkit/imdf';
import type { MultiPolygon, Polygon } from 'geojson';

export interface VenueGenOptions {
  seed: string;
  name: LabelMap;
  /** 场馆中心经纬度（虚构地点） */
  origin: [number, number];
  buildings: number;
  floors: number;
  roomsPerSide: number;
  roomWidth: number;
  roomDepth: number;
  corridorWidth: number;
}

export const SAKURA_HOSPITAL: VenueGenOptions = {
  seed: 'sakura-hospital',
  name: { ja: 'さくら総合病院', en: 'Sakura General Hospital', zh: '樱花综合医院' },
  // 海上的虚构坐标，避免与任何真实医院重合
  origin: [139.9, 35.2],
  buildings: 3,
  floors: 5,
  roomsPerSide: 6,
  roomWidth: 6,
  roomDepth: 6,
  corridorWidth: 3,
};

const WALL = 0.2;
const DOOR = 1.2;
const BUILDING_GAP = 12;

const DEPARTMENTS: LabelMap[][] = [
  [
    { ja: '受付', en: 'Reception', zh: '接待处' },
    { ja: '救急外来', en: 'Emergency', zh: '急诊' },
    { ja: '放射線科', en: 'Radiology', zh: '放射科' },
    { ja: '検査室', en: 'Laboratory', zh: '检验室' },
    { ja: '薬局', en: 'Pharmacy', zh: '药房' },
    { ja: '会計', en: 'Billing desk', zh: '收费处' },
    { ja: '売店', en: 'Shop', zh: '小卖部' },
    { ja: '待合室', en: 'Waiting room', zh: '候诊室' },
    { ja: '総合案内', en: 'Information desk', zh: '咨询台' },
  ],
  [
    { ja: '内科', en: 'Internal medicine', zh: '内科' },
    { ja: '外科', en: 'Surgery', zh: '外科' },
    { ja: '小児科', en: 'Pediatrics', zh: '儿科' },
    { ja: '整形外科', en: 'Orthopedics', zh: '骨科' },
    { ja: '眼科', en: 'Ophthalmology', zh: '眼科' },
    { ja: '皮膚科', en: 'Dermatology', zh: '皮肤科' },
    { ja: '耳鼻咽喉科', en: 'ENT (Ear, Nose and Throat)', zh: '耳鼻喉科' },
    { ja: '診察室', en: 'Consultation room', zh: '诊室' },
    { ja: '処置室', en: 'Treatment room', zh: '处置室' },
  ],
  [
    { ja: 'ICU', en: 'ICU', zh: '重症监护室' },
    { ja: 'ナースステーション', en: 'Nursing station', zh: '护士站' },
    { ja: '病室 301', en: 'Patient room 301', zh: '病房 301' },
    { ja: '病室 302', en: 'Patient room 302', zh: '病房 302' },
    { ja: '病室 303', en: 'Patient room 303', zh: '病房 303' },
    { ja: '病室 304', en: 'Patient room 304', zh: '病房 304' },
    { ja: 'リハビリ室', en: 'Rehabilitation room', zh: '康复室' },
    { ja: 'カンファレンス室', en: 'Conference room', zh: '会议室' },
    { ja: '病室 305', en: 'Patient room 305', zh: '病房 305' },
  ],
  [
    { ja: '病室 401', en: 'Patient room 401', zh: '病房 401' },
    { ja: '病室 402', en: 'Patient room 402', zh: '病房 402' },
    { ja: '病室 403', en: 'Patient room 403', zh: '病房 403' },
    { ja: '病室 404', en: 'Patient room 404', zh: '病房 404' },
    { ja: 'デイルーム', en: 'Day room', zh: '活动室' },
    { ja: 'ナースステーション', en: 'Nursing station', zh: '护士站' },
    { ja: '病室 405', en: 'Patient room 405', zh: '病房 405' },
    { ja: '病室 406', en: 'Patient room 406', zh: '病房 406' },
    { ja: '面会室', en: 'Visiting room', zh: '探视室' },
  ],
  [
    { ja: '手術室 1', en: 'Operating room 1', zh: '手术室 1' },
    { ja: '手術室 2', en: 'Operating room 2', zh: '手术室 2' },
    { ja: '回復室', en: 'Recovery room', zh: '复苏室' },
    { ja: '中央材料室', en: 'Sterile supply room', zh: '消毒供应室' },
    { ja: '更衣室', en: 'Locker room', zh: '更衣室' },
    { ja: '医局', en: 'Doctors’ office', zh: '医生办公室' },
    { ja: '会議室', en: 'Meeting room', zh: '会议室' },
    { ja: '倉庫', en: 'Storage room', zh: '仓库' },
    { ja: '院長室', en: 'Hospital director’s office', zh: '院长室' },
  ],
];

/**
 * 科室按「楼层 + 房间英文名」认领房间，三栋楼的同名房间都属于同一科室；
 * 走廊、电梯、楼梯、洗手间是公共区域，不属于任何科室。
 */
const DEPARTMENT_TABLE: { code: string; name: LabelMap; rooms: [floor: number, en: string][] }[] = [
  {
    code: 'outpatient',
    name: { ja: '外来部門', en: 'Outpatient services', zh: '门诊部' },
    rooms: [
      [0, 'Reception'],
      [0, 'Billing desk'],
      [0, 'Shop'],
      [0, 'Waiting room'],
      [0, 'Information desk'],
    ],
  },
  { code: 'emergency', name: { ja: '救急科', en: 'Emergency', zh: '急诊科' }, rooms: [[0, 'Emergency']] },
  {
    code: 'medtech',
    name: { ja: '医療技術部', en: 'Medical technical services', zh: '医技科' },
    rooms: [
      [0, 'Radiology'],
      [0, 'Laboratory'],
      [4, 'Sterile supply room'],
    ],
  },
  {
    code: 'pharmacy',
    name: { ja: '薬剤部', en: 'Pharmacy', zh: '药剂科' },
    rooms: [
      [0, 'Pharmacy'],
      [4, 'Storage room'],
    ],
  },
  {
    code: 'internal',
    name: { ja: '内科', en: 'Internal medicine', zh: '内科' },
    rooms: [
      [1, 'Internal medicine'],
      [1, 'Consultation room'],
      [1, 'Treatment room'],
      [3, 'Patient room 401'],
      [3, 'Patient room 402'],
      [3, 'Patient room 403'],
    ],
  },
  {
    code: 'surgery',
    name: { ja: '外科', en: 'Surgery', zh: '外科' },
    rooms: [
      [1, 'Surgery'],
      [1, 'Orthopedics'],
      [3, 'Patient room 404'],
      [3, 'Patient room 405'],
      [3, 'Patient room 406'],
      [4, 'Operating room 1'],
      [4, 'Operating room 2'],
      [4, 'Recovery room'],
      [4, 'Locker room'],
    ],
  },
  {
    code: 'clinics',
    name: { ja: '専門外来', en: 'Specialty clinics', zh: '专科门诊' },
    rooms: [
      [1, 'Pediatrics'],
      [1, 'Ophthalmology'],
      [1, 'Dermatology'],
      [1, 'ENT (Ear, Nose and Throat)'],
    ],
  },
  {
    code: 'icu',
    name: { ja: '集中治療科', en: 'Intensive care', zh: '重症医学科' },
    rooms: [
      [2, 'ICU'],
      [2, 'Nursing station'],
      [2, 'Patient room 301'],
      [2, 'Patient room 302'],
    ],
  },
  {
    code: 'rehab',
    name: { ja: 'リハビリテーション科', en: 'Rehabilitation', zh: '康复科' },
    rooms: [
      [2, 'Rehabilitation room'],
      [2, 'Patient room 303'],
      [2, 'Patient room 304'],
      [2, 'Patient room 305'],
      [2, 'Conference room'],
    ],
  },
  {
    code: 'nursing',
    name: { ja: '看護部', en: 'Nursing department', zh: '护理部' },
    rooms: [
      [3, 'Nursing station'],
      [3, 'Day room'],
      [3, 'Visiting room'],
    ],
  },
  {
    code: 'admin',
    name: { ja: '事務部', en: 'Administration', zh: '行政部' },
    rooms: [
      [4, 'Doctors’ office'],
      [4, 'Meeting room'],
      [4, 'Hospital director’s office'],
    ],
  },
];

const SERVICE: { category: string; name: LabelMap }[] = [
  { category: 'elevator', name: { ja: 'エレベーター', en: 'Elevator', zh: '电梯' } },
  { category: 'stairs', name: { ja: '階段', en: 'Stairs', zh: '楼梯' } },
  { category: 'restroom', name: { ja: 'トイレ', en: 'Restroom', zh: '洗手间' } },
];

/** FNV-1a，生成与 seed 绑定的稳定 UUID */
function hash32(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function makeUuid(seed: string, key: string): string {
  const hex = [0, 1, 2, 3]
    .map((salt) => hash32(`${seed}/${key}`, salt).toString(16).padStart(8, '0'))
    .join('');
  const chars = hex.split('');
  chars[12] = '4';
  chars[16] = '89ab'[Number.parseInt(chars[16]!, 16) % 4]!;
  const s = chars.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

type Rect = [number, number, number, number];

/** 标准 IMDF 文件加上医院的科室扩展文件 department.json */
export type HospitalArchive = ImdfArchive & { department: RawCollection };

export function generateVenue(options: VenueGenOptions): HospitalArchive {
  const { seed, roomsPerSide: n, roomWidth: w, roomDepth: d, corridorWidth: c } = options;
  const id = (key: string) => makeUuid(seed, key);
  const buildingWidth = n * w;
  const buildingHeight = 2 * d + c;
  const totalWidth = options.buildings * buildingWidth + (options.buildings - 1) * BUILDING_GAP;

  const [lng0, lat0] = options.origin;
  const metersPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const metersPerLat = 110_540;
  const round = (v: number) => Math.round(v * 1e8) / 1e8;
  const toLngLat = (x: number, y: number): [number, number] => [
    round(lng0 + (x - totalWidth / 2) / metersPerLng),
    round(lat0 + (y - buildingHeight / 2) / metersPerLat),
  ];
  const polygon = ([x0, y0, x1, y1]: Rect): Polygon => ({
    type: 'Polygon',
    coordinates: [[toLngLat(x0, y0), toLngLat(x1, y0), toLngLat(x1, y1), toLngLat(x0, y1), toLngLat(x0, y0)]],
  });
  const feature = (
    featureType: string,
    key: string,
    geometry: RawFeature['geometry'],
    properties: RawFeature['properties'],
  ): RawFeature => ({ type: 'Feature', id: id(key), feature_type: featureType, geometry, properties });
  const fc = (features: RawFeature[]): RawCollection => ({ type: 'FeatureCollection', features });

  const margin = 10;
  const venue = feature(
    'venue',
    'venue',
    polygon([-margin, -margin, totalWidth + margin, buildingHeight + margin]),
    {
      category: 'healthcare',
      name: options.name,
      alt_name: null,
      display_point: { type: 'Point', coordinates: toLngLat(totalWidth / 2, buildingHeight / 2) },
    },
  );

  const buildings: RawFeature[] = [];
  const levels: RawFeature[] = [];
  const units: RawFeature[] = [];
  const openings: RawFeature[] = [];
  const fixtures: RawFeature[] = [];
  /** 科室代码 → 区块 id */
  const departmentUnits = new Map<string, string[]>(DEPARTMENT_TABLE.map((d) => [d.code, []]));
  const departmentFor = (floor: number, en: string) =>
    DEPARTMENT_TABLE.find((d) => d.rooms.some(([f, name]) => f === floor && name === en));

  const buildingX = (b: number) => b * (buildingWidth + BUILDING_GAP);
  for (let b = 0; b < options.buildings; b++) {
    const letter = String.fromCharCode(65 + b);
    buildings.push(
      feature('building', `building/${b}`, null, {
        category: 'unspecified',
        name: { ja: `${letter}棟`, en: `Building ${letter}`, zh: `${letter}栋` },
      }),
    );
  }
  const buildingIds = buildings.map((x) => x.id);

  // 每层一个 level，由各栋楼和栋间连廊组成，楼层切换对所有楼栋同时生效
  const outline: Rect[] = [];
  for (let b = 0; b < options.buildings; b++) {
    outline.push([buildingX(b), 0, buildingX(b) + buildingWidth, buildingHeight]);
    if (b > 0) outline.push([buildingX(b) - BUILDING_GAP, d, buildingX(b), d + c]);
  }
  const levelGeometry: MultiPolygon = {
    type: 'MultiPolygon',
    coordinates: outline.map((r) => polygon(r).coordinates),
  };

  for (let f = 0; f < options.floors; f++) {
    const levelId = id(`level/f${f}`);
    const short = `${f + 1}F`;
    levels.push(
      feature('level', `level/f${f}`, levelGeometry, {
        category: 'unspecified',
        ordinal: f,
        outdoor: false,
        name: { ja: `${f + 1}階`, en: `Level ${f + 1}`, zh: `${f + 1}层` },
        short_name: { ja: short, en: short, zh: short },
        building_ids: buildingIds,
      }),
    );
    for (let b = 1; b < options.buildings; b++) {
      units.push(
        feature(
          'unit',
          `unit/f${f}/bridge${b}`,
          polygon([buildingX(b) - BUILDING_GAP, d, buildingX(b), d + c]),
          {
            category: 'walkway',
            level_id: levelId,
            name: null,
          },
        ),
      );
    }
  }

  for (let b = 0; b < options.buildings; b++) {
    const bx = buildingX(b);
    for (let f = 0; f < options.floors; f++) {
      const key = `b${b}/f${f}`;
      const levelId = id(`level/f${f}`);
      const names = DEPARTMENTS[f % DEPARTMENTS.length]!;

      units.push(
        feature('unit', `unit/${key}/corridor`, polygon([bx, d, bx + buildingWidth, d + c]), {
          category: 'walkway',
          level_id: levelId,
          name: null,
        }),
      );

      let named = 0;
      // row 0 在走廊南侧，row 1 在北侧
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < n; i++) {
          const cell: Rect =
            row === 0
              ? [bx + i * w, 0, bx + (i + 1) * w, d]
              : [bx + i * w, d + c, bx + (i + 1) * w, buildingHeight];
          const service = row === 0 ? SERVICE[i] : undefined;
          const department = service ? undefined : names[named++ % names.length]!;
          const category = service?.category ?? (department === names[0] && f === 0 ? 'lobby' : 'room');
          const cellKey = `${key}/r${row}c${i}`;
          units.push(
            feature('unit', `unit/${cellKey}`, polygon(cell), {
              category,
              level_id: levelId,
              name: service?.name ?? department,
            }),
          );
          if (department) {
            const owner = departmentFor(f % DEPARTMENTS.length, department.en!);
            if (!owner) throw new Error(`room "${department.en}" on floor ${f + 1} has no department`);
            departmentUnits.get(owner.code)!.push(units.at(-1)!.id);
          }

          // 门开在朝走廊的一侧
          const [x0, y0, x1, y1] = cell;
          const doorY = row === 0 ? y1 : y0;
          const cx = (x0 + x1) / 2;
          openings.push(
            feature(
              'opening',
              `opening/${cellKey}`,
              {
                type: 'LineString',
                coordinates: [toLngLat(cx - DOOR / 2, doorY), toLngLat(cx + DOOR / 2, doorY)],
              },
              { category: 'pedestrian', level_id: levelId },
            ),
          );

          const front: [number, number] = row === 0 ? [y1 - WALL, y1] : [y0, y0 + WALL];
          const back: [number, number] = row === 0 ? [y0, y0 + WALL] : [y1 - WALL, y1];
          const walls: Rect[] = [
            [x0, y0, x0 + WALL, y1],
            [x1 - WALL, y0, x1, y1],
            [x0, back[0], x1, back[1]],
            [x0, front[0], cx - DOOR / 2, front[1]],
            [cx + DOOR / 2, front[0], x1, front[1]],
          ];
          walls.forEach((rect, k) => {
            fixtures.push(
              feature('fixture', `wall/${cellKey}/${k}`, polygon(rect), {
                category: 'wall',
                level_id: levelId,
                name: null,
              }),
            );
          });
        }
      }
    }
  }

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
    fixture: fc(fixtures),
    amenity: fc([]),
    department: fc(
      DEPARTMENT_TABLE.map((d) =>
        feature('department', `department/${d.code}`, null, {
          code: d.code,
          name: d.name,
          unit_ids: departmentUnits.get(d.code)!,
        }),
      ),
    ),
  };
}
