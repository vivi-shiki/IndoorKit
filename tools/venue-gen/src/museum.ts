import type { ImdfArchive, LabelMap, RawCollection, RawFeature } from '@indoorkit/imdf';
import type { CaseKind, DeviceKind, Material, ObjectStatus, RoomKind } from '@indoorkit/museum';
import type { Polygon } from 'geojson';
import { makeUuid } from './uuid';

export interface MuseumGenOptions {
  seed: string;
  name: LabelMap;
  /** 场馆中心经纬度（虚构地点） */
  origin: [number, number];
}

export const MINATO_MUSEUM: MuseumGenOptions = {
  seed: 'minato-museum',
  name: {
    ja: 'みなと市立美術博物館',
    en: 'Minato City Museum of Art and History',
    zh: '港市立美术博物馆',
  },
  // 海上的虚构坐标，和医院、停车场、真实的博物馆都不重合
  origin: [139.85, 35.1],
};

/** 标准 IMDF 文件加上博物馆的五个扩展文件 */
export type MuseumArchive = ImdfArchive & {
  'museum-space': RawCollection;
  'museum-case': RawCollection;
  'museum-object': RawCollection;
  'museum-device': RawCollection;
  'museum-route': RawCollection;
};

type Rect = [number, number, number, number];
type XY = [number, number];

/**
 * 布局（米，x 向东、y 向北），四层相同的骨架：
 *   南排房间 y 0–14 ─ 走廊 y 14–20（中线 17）─ 北排房间 y 20–34
 * 房间占 x 0–60，东端 x 60–66 是电梯（南）和楼梯（北），走廊一直通到电梯门口。
 * 每个房间的门开在朝走廊的墙正中，来馆者和警卫都沿走廊中线走、经电梯换层。
 *
 * B1 收藏库和后勤（不公开），1F 企划展示室和大厅，2F 常设展 5 间，3F 日本书画染织 4 间和学芸员室。
 */
const WIDTH = 66;
const DEPTH = 34;
const HALL_Y = 17;
const CORE_X = 63;

interface RoomSpec {
  code: string;
  kind: RoomKind;
  x0: number;
  x1: number;
  side: 'south' | 'north';
  name: LabelMap;
  exhibition?: string;
  /** 展示室里的藏品材质（按展示柜轮流） */
  materials?: Material[];
  /** 展示室的藏品题名主题 */
  theme?: Theme;
}

type Theme =
  | 'modern'
  | 'craft'
  | 'archaeology'
  | 'sculpture'
  | 'ceramics'
  | 'nihonga'
  | 'calligraphy'
  | 'textile'
  | 'prints';

const gallery = (n: number, ja: string, en: string, zh: string): LabelMap => ({
  ja: `展示室 ${n}（${ja}）`,
  en: `Gallery ${n}: ${en}`,
  zh: `${n} 号展厅 · ${zh}`,
});

const FLOORS: { short: string; ordinal: number; name: LabelMap; rooms: RoomSpec[] }[] = [
  {
    short: 'B1',
    ordinal: -1,
    name: { ja: '地下 1 階', en: 'Basement 1', zh: '地下 1 层' },
    rooms: [
      {
        code: 'ST-A',
        kind: 'storage',
        x0: 0,
        x1: 20,
        side: 'south',
        name: { ja: '収蔵庫 A（一般）', en: 'Storage A: General', zh: '库房 A · 综合' },
      },
      {
        code: 'ST-B',
        kind: 'storage',
        x0: 20,
        x1: 40,
        side: 'south',
        name: {
          ja: '収蔵庫 B（書画・染織）',
          en: 'Storage B: Paper and textiles',
          zh: '库房 B · 书画与染织',
        },
      },
      {
        code: 'ST-C',
        kind: 'storage',
        x0: 40,
        x1: 60,
        side: 'south',
        name: { ja: '収蔵庫 C（金属）', en: 'Storage C: Metal', zh: '库房 C · 金属' },
      },
      {
        code: 'FUM',
        kind: 'fumigation',
        x0: 0,
        x1: 15,
        side: 'north',
        name: { ja: '燻蒸室', en: 'Fumigation room', zh: '熏蒸室' },
      },
      {
        code: 'DOCK',
        kind: 'loading',
        x0: 15,
        x1: 35,
        side: 'north',
        name: { ja: '搬入口', en: 'Loading dock', zh: '装卸区' },
      },
      {
        code: 'TMP',
        kind: 'storage',
        x0: 35,
        x1: 60,
        side: 'north',
        name: { ja: '一時保管庫', en: 'Temporary storage', zh: '临时库房' },
      },
    ],
  },
  {
    short: '1F',
    ordinal: 0,
    name: { ja: '1 階', en: 'Level 1', zh: '1 层' },
    rooms: [
      {
        code: 'SP1',
        kind: 'special',
        x0: 0,
        x1: 30,
        side: 'south',
        exhibition: 'SPECIAL',
        theme: 'modern',
        materials: ['painting'],
        name: { ja: '企画展示室 1', en: 'Special exhibition gallery 1', zh: '1 号特展厅' },
      },
      {
        code: 'SP2',
        kind: 'special',
        x0: 30,
        x1: 60,
        side: 'south',
        exhibition: 'SPECIAL',
        theme: 'prints',
        materials: ['paper'],
        name: { ja: '企画展示室 2', en: 'Special exhibition gallery 2', zh: '2 号特展厅' },
      },
      {
        code: 'LOBBY',
        kind: 'lobby',
        x0: 0,
        x1: 30,
        side: 'north',
        name: { ja: 'エントランスホール', en: 'Entrance hall', zh: '入口大厅' },
      },
      {
        code: 'SHOP',
        kind: 'shop',
        x0: 30,
        x1: 45,
        side: 'north',
        name: { ja: 'ミュージアムショップ', en: 'Museum shop', zh: '文创商店' },
      },
      {
        code: 'CAFE',
        kind: 'cafe',
        x0: 45,
        x1: 60,
        side: 'north',
        name: { ja: 'カフェ', en: 'Café', zh: '咖啡厅' },
      },
    ],
  },
  {
    short: '2F',
    ordinal: 1,
    name: { ja: '2 階', en: 'Level 2', zh: '2 层' },
    rooms: [
      {
        code: 'G1',
        kind: 'gallery',
        x0: 0,
        x1: 20,
        side: 'south',
        exhibition: 'ART',
        theme: 'modern',
        materials: ['painting'],
        name: gallery(1, '近代絵画', 'Modern painting', '近代绘画'),
      },
      {
        code: 'G2',
        kind: 'gallery',
        x0: 20,
        x1: 40,
        side: 'south',
        exhibition: 'ART',
        theme: 'craft',
        materials: ['lacquer', 'wood', 'lacquer', 'ceramic', 'lacquer'],
        name: gallery(2, '工芸', 'Decorative arts', '工艺'),
      },
      {
        code: 'G3',
        kind: 'gallery',
        x0: 40,
        x1: 60,
        side: 'south',
        exhibition: 'ARCH',
        theme: 'archaeology',
        materials: ['stone', 'metal', 'ceramic', 'metal', 'stone'],
        name: gallery(3, '考古', 'Archaeology', '考古'),
      },
      {
        code: 'G4',
        kind: 'gallery',
        x0: 0,
        x1: 20,
        side: 'north',
        exhibition: 'ART',
        theme: 'sculpture',
        materials: ['wood'],
        name: gallery(4, '彫刻', 'Sculpture', '雕塑'),
      },
      {
        code: 'LNG2',
        kind: 'lounge',
        x0: 20,
        x1: 40,
        side: 'north',
        name: { ja: '休憩スペース', en: 'Lounge', zh: '休息区' },
      },
      {
        code: 'G5',
        kind: 'gallery',
        x0: 40,
        x1: 60,
        side: 'north',
        exhibition: 'ART',
        theme: 'ceramics',
        materials: ['ceramic'],
        name: gallery(5, '陶磁', 'Ceramics', '陶瓷'),
      },
    ],
  },
  {
    short: '3F',
    ordinal: 2,
    name: { ja: '3 階', en: 'Level 3', zh: '3 层' },
    rooms: [
      {
        code: 'G6',
        kind: 'gallery',
        x0: 0,
        x1: 20,
        side: 'south',
        exhibition: 'JAPAN',
        theme: 'nihonga',
        materials: ['paper'],
        name: gallery(6, '日本画', 'Japanese painting', '日本画'),
      },
      {
        code: 'G7',
        kind: 'gallery',
        x0: 20,
        x1: 40,
        side: 'south',
        exhibition: 'JAPAN',
        theme: 'calligraphy',
        materials: ['paper'],
        name: gallery(7, '書跡', 'Calligraphy', '书法'),
      },
      {
        code: 'G8',
        kind: 'gallery',
        x0: 40,
        x1: 60,
        side: 'south',
        exhibition: 'JAPAN',
        theme: 'textile',
        materials: ['textile'],
        name: gallery(8, '染織', 'Textiles', '染织'),
      },
      {
        code: 'G9',
        kind: 'gallery',
        x0: 0,
        x1: 20,
        side: 'north',
        exhibition: 'JAPAN',
        theme: 'prints',
        materials: ['paper'],
        name: gallery(9, '浮世絵', 'Ukiyo-e prints', '浮世绘'),
      },
      {
        code: 'LNG3',
        kind: 'lounge',
        x0: 20,
        x1: 40,
        side: 'north',
        name: { ja: '休憩スペース', en: 'Lounge', zh: '休息区' },
      },
      {
        code: 'OFFICE',
        kind: 'office',
        x0: 40,
        x1: 60,
        side: 'north',
        name: { ja: '学芸員室', en: 'Curators’ office', zh: '研究室' },
      },
    ],
  },
];

const EXHIBITIONS: { code: string; kind: 'permanent' | 'special'; name: LabelMap }[] = [
  {
    code: 'SPECIAL',
    kind: 'special',
    name: {
      ja: '企画展「港町の記憶」',
      en: 'Special exhibition: Memories of a Port Town',
      zh: '特展“港城记忆”',
    },
  },
  {
    code: 'ART',
    kind: 'permanent',
    name: {
      ja: '常設展「近代美術と工芸」',
      en: 'Permanent collection: Modern art and crafts',
      zh: '常设展“近代美术与工艺”',
    },
  },
  {
    code: 'ARCH',
    kind: 'permanent',
    name: { ja: '常設展「考古」', en: 'Permanent collection: Archaeology', zh: '常设展“考古”' },
  },
  {
    code: 'JAPAN',
    kind: 'permanent',
    name: {
      ja: '常設展「日本の書画と染織」',
      en: 'Permanent collection: Japanese painting, calligraphy and textiles',
      zh: '常设展“日本书画与染织”',
    },
  },
];

type L3 = [ja: string, en: string, zh: string];
const lm = ([ja, en, zh]: L3): LabelMap => ({ ja, en, zh });

const TITLES: Record<Theme, L3[]> = {
  modern: [
    ['港の夕景', 'Harbor at dusk', '港湾夕景'],
    ['静物', 'Still life', '静物'],
    ['少女像', 'Portrait of a girl', '少女像'],
    ['海辺の家', 'House by the sea', '海边的房子'],
    ['冬の運河', 'Canal in winter', '冬日运河'],
    ['赤い帽子', 'The red hat', '红帽子'],
  ],
  craft: [
    ['蒔絵硯箱', 'Writing box with maki-e', '莳绘砚箱'],
    ['漆塗手箱', 'Lacquered toiletry box', '漆手箱'],
    ['木彫盆', 'Carved wooden tray', '木雕托盘'],
    ['螺鈿香合', 'Incense box with mother-of-pearl inlay', '螺钿香盒'],
  ],
  archaeology: [
    ['石斧', 'Stone axe', '石斧'],
    ['銅鏡', 'Bronze mirror', '铜镜'],
    ['土器 壺', 'Earthenware jar', '陶罐'],
    ['鉄剣', 'Iron sword', '铁剑'],
    ['石棒', 'Stone rod', '石棒'],
  ],
  sculpture: [
    ['木彫 鶴', 'Carved crane', '木雕鹤'],
    ['少年像', 'Figure of a boy', '少年像'],
    ['漁夫像', 'Fisherman', '渔夫像'],
  ],
  ceramics: [
    ['染付皿', 'Blue-and-white dish', '青花盘'],
    ['色絵壺', 'Jar with overglaze enamels', '五彩罐'],
    ['灰釉瓶', 'Ash-glazed bottle', '灰釉瓶'],
  ],
  nihonga: [
    ['山水図', 'Landscape', '山水图'],
    ['花鳥図', 'Birds and flowers', '花鸟图'],
    ['秋草図', 'Autumn grasses', '秋草图'],
    ['松鶴図', 'Pines and cranes', '松鹤图'],
    ['月下渓流図', 'Mountain stream by moonlight', '月下溪流图'],
  ],
  calligraphy: [
    ['和歌懐紙', 'Waka poem sheet', '和歌怀纸'],
    ['漢詩二行書', 'Chinese poem in two lines', '汉诗二行书'],
    ['書状', 'Letter', '书信'],
    ['般若心経', 'Heart Sutra', '般若心经'],
  ],
  textile: [
    ['小袖', 'Kosode robe', '小袖'],
    ['打掛', 'Uchikake robe', '打褂'],
    ['帛紗', 'Fukusa cloth', '帛纱'],
    ['能装束', 'Noh costume', '能剧服装'],
  ],
  // 版画是成套的「港百景」，第几景就是系列里的编号
  prints: [],
};

const ARTISTS: L3[] = [
  ['港川青雲', 'Minatogawa Seiun', '港川青云'],
  ['汐見春湖', 'Shiomi Shunko', '汐见春湖'],
  ['浦野白峰', 'Urano Hakuho', '浦野白峰'],
  ['沖田蘭渓', 'Okita Rankei', '冲田兰溪'],
  ['灘本秋汀', 'Nadamoto Shutei', '滩本秋汀'],
  ['帆村柳舟', 'Homura Ryushu', '帆村柳舟'],
];
const UNKNOWN: L3 = ['作者不詳', 'Unknown', '佚名'];

const PERIODS: Record<Theme, L3> = {
  modern: ['大正時代', 'Taisho era', '大正时代'],
  craft: ['江戸時代', 'Edo period', '江户时代'],
  archaeology: ['古墳時代', 'Kofun period', '古坟时代'],
  sculpture: ['明治時代', 'Meiji era', '明治时代'],
  ceramics: ['江戸時代', 'Edo period', '江户时代'],
  nihonga: ['江戸時代', 'Edo period', '江户时代'],
  calligraphy: ['室町時代', 'Muromachi period', '室町时代'],
  textile: ['江戸時代', 'Edo period', '江户时代'],
  prints: ['江戸時代', 'Edo period', '江户时代'],
};

/** 无作者署名的主题 */
const ANONYMOUS: Theme[] = ['archaeology', 'craft', 'ceramics', 'textile'];

/** 每个展示室的柜：每 10 m 一个壁柜和一个独立柜，靠门一侧一个单品柜；房间正中留给来馆者 */
function caseLayout(width: number, side: 'south' | 'north'): { kind: CaseKind; rect: Rect }[] {
  // 先按南排房间（门在北墙 y 14）布置，北排房间上下翻转
  const n = width / 10;
  const out: { kind: CaseKind; rect: Rect }[] = [];
  for (let i = 0; i < n; i++) out.push({ kind: 'wall', rect: [i * 10 + 1, 0.4, i * 10 + 9, 1.6] });
  for (let i = 0; i < n; i++) out.push({ kind: 'freestanding', rect: [i * 10 + 3, 4, i * 10 + 7, 5.6] });
  out.push({ kind: 'single', rect: [1.5, 10.5, 3, 12] });
  if (side === 'south') return out;
  return out.map(({ kind, rect: [x0, y0, x1, y1] }) => ({ kind, rect: [x0, 14 - y1, x1, 14 - y0] }));
}

const OBJECTS_PER_CASE: Record<CaseKind, number> = { wall: 3, freestanding: 2, single: 1 };
const CAPACITY = { gallery: 40, special: 60 };

export function generateMuseum(options: MuseumGenOptions): MuseumArchive {
  const id = (key: string) => makeUuid(options.seed, key);
  const [lng0, lat0] = options.origin;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 110_540;
  const round = (v: number) => Math.round(v * 1e8) / 1e8;
  const ll = ([x, y]: XY): XY => [
    round(lng0 + (x - WIDTH / 2) / mPerLng),
    round(lat0 + (y - DEPTH / 2) / mPerLat),
  ];
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

  const building = feature('building', 'building/main', null, {
    category: 'unspecified',
    name: { ja: '本館', en: 'Main building', zh: '主楼' },
  });
  const levels: RawFeature[] = [];
  const units: RawFeature[] = [];
  const openings: RawFeature[] = [];
  const space: RawFeature[] = EXHIBITIONS.map((e) =>
    feature('museum_exhibition', `exhibition/${e.code}`, null, { code: e.code, name: e.name, kind: e.kind }),
  );
  const cases: RawFeature[] = [];
  const objects: RawFeature[] = [];
  const devices: RawFeature[] = [];
  const routes: RawFeature[] = [];

  const unit = (key: string, levelId: string, rect: Rect, category: string, name: LabelMap | null) => {
    const f = feature('unit', `unit/${key}`, polygon(rect), { category, level_id: levelId, name });
    units.push(f);
    return f.id;
  };
  const device = (code: string, kind: DeviceKind, levelId: string, unitId: string, at: XY) =>
    devices.push(
      feature(
        'museum_device',
        `device/${code}`,
        { type: 'Point', coordinates: ll(at) },
        {
          code,
          kind,
          level_id: levelId,
          unit_id: unitId,
        },
      ),
    );

  interface Placed {
    spec: RoomSpec;
    levelId: string;
    unitId: string;
    rect: Rect;
    door: XY;
    hall: XY;
    center: XY;
    cases: { unitId: string; code: string; kind: CaseKind; rect: Rect }[];
  }
  const placed: Placed[] = [];
  const cores = new Map<string, Placed>();

  for (const floor of FLOORS) {
    const levelId = id(`level/${floor.short}`);
    levels.push(
      feature('level', `level/${floor.short}`, polygon([0, 0, WIDTH, DEPTH]), {
        category: 'unspecified',
        ordinal: floor.ordinal,
        outdoor: false,
        name: floor.name,
        short_name: { ja: floor.short, en: floor.short, zh: floor.short },
        building_ids: [building.id],
      }),
    );
    unit(`${floor.short}/hall`, levelId, [0, 14, 60, 20], 'walkway', null);
    unit(`${floor.short}/landing`, levelId, [60, 14, WIDTH, 20], 'walkway', null);
    unit(`${floor.short}/stairs`, levelId, [60, 20, WIDTH, DEPTH], 'stairs', {
      ja: '階段',
      en: 'Stairs',
      zh: '楼梯',
    });
    opening(`${floor.short}/stairs`, levelId, [CORE_X - 1, 20], [CORE_X + 1, 20]);

    const elevator: Rect = [60, 0, WIDTH, 14];
    const elevatorId = unit(`${floor.short}/elevator`, levelId, elevator, 'elevator', {
      ja: 'エレベーター',
      en: 'Elevator',
      zh: '电梯',
    });
    opening(`${floor.short}/elevator`, levelId, [CORE_X - 1, 14], [CORE_X + 1, 14]);
    const core: Placed = {
      spec: { code: `CORE-${floor.short}`, kind: 'core', x0: 60, x1: WIDTH, side: 'south', name: {} },
      levelId,
      unitId: elevatorId,
      rect: elevator,
      door: [CORE_X, 13],
      hall: [CORE_X, HALL_Y],
      center: [CORE_X, 7],
      cases: [],
    };
    cores.set(levelId, core);

    for (const spec of floor.rooms) {
      const south = spec.side === 'south';
      const rect: Rect = south ? [spec.x0, 0, spec.x1, 14] : [spec.x0, 20, spec.x1, DEPTH];
      const cx = (spec.x0 + spec.x1) / 2;
      const category =
        spec.kind === 'gallery' || spec.kind === 'special'
          ? 'room'
          : spec.kind === 'storage' || spec.kind === 'fumigation'
            ? 'storage'
            : spec.kind === 'loading'
              ? 'nonpublic'
              : spec.kind === 'office'
                ? 'office'
                : spec.kind === 'cafe'
                  ? 'foodservice'
                  : spec.kind === 'lounge'
                    ? 'lounge'
                    : 'lobby';
      const unitId = unit(`${floor.short}/${spec.code}`, levelId, rect, category, spec.name);
      const doorY = south ? 14 : 20;
      opening(`${spec.code}`, levelId, [cx - 1, doorY], [cx + 1, doorY]);
      const room: Placed = {
        spec,
        levelId,
        unitId,
        rect,
        door: [cx, south ? 13 : 21],
        hall: [cx, HALL_Y],
        center: [cx, south ? 7 : 27],
        cases: [],
      };
      if (spec.materials) {
        const counts: Record<CaseKind, number> = { wall: 0, freestanding: 0, single: 0 };
        for (const c of caseLayout(spec.x1 - spec.x0, spec.side)) {
          const n = ++counts[c.kind];
          const code = `${spec.code}-${{ wall: 'W', freestanding: 'F', single: 'S' }[c.kind]}${n}`;
          const caseRect: Rect = [
            spec.x0 + c.rect[0],
            rect[1] + c.rect[1],
            spec.x0 + c.rect[2],
            rect[1] + c.rect[3],
          ];
          const caseId = unit(`case/${code}`, levelId, caseRect, 'unspecified', null);
          room.cases.push({ unitId: caseId, code, kind: c.kind, rect: caseRect });
        }
      }
      placed.push(room);
    }
  }

  function opening(key: string, levelId: string, a: XY, b: XY, category = 'pedestrian') {
    openings.push(
      feature(
        'opening',
        `opening/${key}`,
        { type: 'LineString', coordinates: [ll(a), ll(b)] },
        {
          category,
          level_id: levelId,
        },
      ),
    );
  }
  const lobby = placed.find((p) => p.spec.code === 'LOBBY')!;
  opening('entrance', lobby.levelId, [12, DEPTH], [18, DEPTH], 'pedestrian.principal');

  // 房间和展示柜
  for (const room of [...placed, ...cores.values()]) {
    const { spec } = room;
    const isGallery = spec.kind === 'gallery' || spec.kind === 'special';
    space.push(
      feature('museum_room', `room/${spec.code}`, null, {
        unit_id: room.unitId,
        code: spec.code,
        kind: spec.kind,
        access: ['storage', 'fumigation', 'loading', 'office'].includes(spec.kind) ? 'staff' : 'public',
        capacity: isGallery ? CAPACITY[spec.kind as 'gallery' | 'special'] : null,
        exhibition: spec.exhibition ?? null,
        door: ll(room.door),
        hall: ll(room.hall),
      }),
    );
    for (const c of room.cases) {
      cases.push(
        feature('museum_case', `case/${c.code}`, null, {
          unit_id: c.unitId,
          code: c.code,
          room_id: room.unitId,
          kind: c.kind,
          // 壁柜和单品柜是气密柜；独立柜不是，柜内湿度跟着展示室走
          sealed: c.kind !== 'freestanding',
        }),
      );
    }
  }

  // 藏品：每个展示柜放几件；同系列的替换品和其他藏品放在收藏库
  const byCode = new Map(placed.map((p) => [p.spec.code, p]));
  let objectSeq = 0;
  let printNo = 0;
  const themeSeq = new Map<Theme, number>();
  const addObject = (
    theme: Theme,
    material: Material,
    status: ObjectStatus,
    location: string | null,
    extra: { designated?: boolean } = {},
  ) => {
    const code = `MC-${String(++objectSeq).padStart(4, '0')}`;
    const k = themeSeq.get(theme) ?? 0;
    themeSeq.set(theme, k + 1);
    let title: LabelMap;
    let series: string | null = null;
    if (theme === 'prints') {
      const n = ++printNo;
      title = {
        ja: `港百景 第${n}景`,
        en: `One Hundred Views of the Harbor, no. ${n}`,
        zh: `港百景 第${n}景`,
      };
      series = 'minato-100';
    } else {
      const titles = TITLES[theme];
      title = lm(titles[k % titles.length]!);
      // 日本画、书迹、染织的同题作品互为替换品
      if (theme === 'nihonga' || theme === 'calligraphy' || theme === 'textile')
        series = `${theme}-${k % titles.length}`;
    }
    const artist = ANONYMOUS.includes(theme) ? UNKNOWN : ARTISTS[(k * 7 + objectSeq) % ARTISTS.length]!;
    objects.push(
      feature('museum_object', `object/${code}`, null, {
        code,
        title,
        artist: lm(artist),
        period: lm(PERIODS[theme]),
        material,
        designated: extra.designated ?? false,
        status,
        location,
        series,
      }),
    );
  };
  // 指定文化财（虚构）：日本画、书迹和企划展各一件
  const designatedCases = new Set(['G6-W1', 'G7-W2', 'SP2-W2']);
  for (const room of placed) {
    const { theme, materials } = room.spec;
    if (!theme || !materials) continue;
    room.cases.forEach((c, i) => {
      const material = materials[i % materials.length]!;
      for (let k = 0; k < OBJECTS_PER_CASE[c.kind]; k++) {
        addObject(theme, material, 'display', c.unitId, {
          designated: k === 0 && designatedCases.has(c.code),
        });
      }
    });
  }
  const storage = (code: string) => byCode.get(code)!.unitId;
  // 收藏中的替换品：版画、日本画、书迹、染织各几件
  for (let i = 0; i < 12; i++) addObject('prints', 'paper', 'storage', storage('ST-B'));
  for (const theme of ['nihonga', 'calligraphy', 'textile'] as const) {
    const material = theme === 'textile' ? 'textile' : 'paper';
    for (let i = 0; i < TITLES[theme].length; i++) addObject(theme, material, 'storage', storage('ST-B'));
  }
  for (let i = 0; i < 8; i++) addObject('ceramics', 'ceramic', 'storage', storage('ST-A'));
  for (let i = 0; i < 6; i++) addObject('archaeology', i % 2 ? 'metal' : 'stone', 'storage', storage('ST-C'));
  addObject('modern', 'painting', 'conservation', storage('TMP'));
  addObject('craft', 'lacquer', 'conservation', storage('TMP'));
  addObject('modern', 'painting', 'loan', null);
  addObject('textile', 'textile', 'loan', null);

  // 设备
  const levelOf = (room: Placed) => room.levelId;
  for (const room of placed) {
    const { spec } = room;
    const [x0, y0, x1, y1] = room.rect;
    const lid = levelOf(room);
    const code = spec.code;
    const south = spec.side === 'south';
    const inner = (dx: number, dy: number): XY => [x0 + dx, south ? y0 + dy : y1 - dy];
    const isGallery = spec.kind === 'gallery' || spec.kind === 'special';
    if (isGallery) {
      device(`TH-${code}`, 'climate', lid, room.unitId, inner(x1 - x0 - 1, 4));
      device(`LX-${code}`, 'light', lid, room.unitId, inner(x1 - x0 - 1, 5));
      device(`CO2-${code}`, 'co2', lid, room.unitId, inner(x1 - x0 - 1, 6));
      device(`PIR-${code}`, 'motion', lid, room.unitId, inner(x1 - x0 - 1, 12));
      device(`CNT-${code}`, 'counter', lid, room.unitId, [room.door[0] + 1.5, room.door[1]]);
      device(`RFID-${code}`, 'rfid', lid, room.unitId, [room.door[0] - 1.5, room.door[1]]);
      device(`BCN-${code}-1`, 'beacon', lid, room.unitId, inner((x1 - x0) / 4, 9));
      device(`BCN-${code}-2`, 'beacon', lid, room.unitId, inner(((x1 - x0) * 3) / 4, 9));
      for (const c of room.cases) {
        const [cx0, cy0, cx1, cy1] = c.rect;
        const mid: XY = [(cx0 + cx1) / 2, (cy0 + cy1) / 2];
        device(`TH-${c.code}`, 'climate', lid, c.unitId, [cx0 + 0.3, mid[1]]);
        if (
          spec.materials!.some(
            (m) => m === 'paper' || m === 'textile' || m === 'painting' || m === 'lacquer' || m === 'wood',
          )
        )
          device(`LX-${c.code}`, 'light', lid, c.unitId, [cx0 + 0.6, mid[1]]);
        device(`DOOR-${c.code}`, 'door', lid, c.unitId, [cx1 - 0.3, mid[1]]);
        device(`VIB-${c.code}`, 'vibration', lid, c.unitId, [cx1 - 0.6, mid[1]]);
        if (c.kind !== 'wall')
          device(`PRX-${c.code}`, 'proximity', lid, c.unitId, [mid[0], south ? cy1 : cy0]);
      }
    } else if (spec.kind === 'storage' || spec.kind === 'fumigation' || spec.kind === 'loading') {
      if (spec.kind === 'storage') device(`TH-${code}`, 'climate', lid, room.unitId, inner(2, 4));
      device(`PIR-${code}`, 'motion', lid, room.unitId, inner(2, 6));
      device(`RFID-${code}`, 'rfid', lid, room.unitId, [room.door[0] - 1.5, room.door[1]]);
    } else if (spec.kind === 'lobby') {
      device(`TH-${code}`, 'climate', lid, room.unitId, inner(2, 4));
      device(`CO2-${code}`, 'co2', lid, room.unitId, inner(2, 5));
      // 入馆计数：大厅北面的正门
      device(`CNT-${code}`, 'counter', lid, room.unitId, [15, DEPTH - 1]);
    }
  }

  // 路线：警卫巡逻（每间房门外一个检查点）和来馆者导览（按展示室顺序走）
  const point = (levelId: string, xy: XY) => ({ level_id: levelId, coord: ll(xy) });
  const patrol = (code: string, name: LabelMap, minutes: number, floors: string[]) => {
    const path: { level_id: string; coord: XY }[] = [];
    const stops: { unit_id: string; index: number; code: string }[] = [];
    floors.forEach((short, i) => {
      const levelId = id(`level/${short}`);
      const core = cores.get(levelId)!;
      if (i > 0) path.push(point(levelId, core.center));
      path.push(point(levelId, core.hall));
      const rooms = placed.filter((p) => p.levelId === levelId).sort((a, b) => b.hall[0] - a.hall[0]);
      for (const room of rooms) {
        // 同一个 x 的南北两间共用一个检查点前后两次经过
        stops.push({ unit_id: room.unitId, index: path.length, code: `CP-${room.spec.code}` });
        path.push(point(levelId, room.hall));
      }
      path.push(point(levelId, core.hall));
      path.push(point(levelId, core.center));
    });
    routes.push(
      feature('museum_route', `route/${code}`, null, { code, kind: 'patrol', name, minutes, path, stops }),
    );
  };
  patrol(
    'PATROL-A',
    { ja: '巡回ルート A（B1・1F）', en: 'Patrol route A (B1, 1F)', zh: '巡更路线 A（B1、1F）' },
    30,
    ['1F', 'B1'],
  );
  patrol(
    'PATROL-B',
    { ja: '巡回ルート B（2F・3F）', en: 'Patrol route B (2F, 3F)', zh: '巡更路线 B（2F、3F）' },
    40,
    ['2F', '3F'],
  );

  const tour = (code: string, name: LabelMap, minutes: number, roomCodes: string[]) => {
    const stopsAt = [lobby, ...roomCodes.map((c) => byCode.get(c)!)];
    const path: { level_id: string; coord: XY }[] = [point(lobby.levelId, lobby.center)];
    const stops: { unit_id: string; index: number; code: string }[] = [];
    for (let i = 1; i < stopsAt.length; i++) {
      const a = stopsAt[i - 1]!;
      const b = stopsAt[i]!;
      const legs: [string, XY][] = [
        [a.levelId, a.door],
        [a.levelId, a.hall],
      ];
      if (a.levelId !== b.levelId) {
        const ca = cores.get(a.levelId)!;
        const cb = cores.get(b.levelId)!;
        legs.push([a.levelId, ca.hall], [a.levelId, ca.center], [b.levelId, cb.center], [b.levelId, cb.hall]);
      }
      legs.push([b.levelId, b.hall], [b.levelId, b.door], [b.levelId, b.center]);
      for (const [levelId, xy] of legs) path.push(point(levelId, xy));
      stops.push({ unit_id: b.unitId, index: path.length - 1, code: b.spec.code });
    }
    routes.push(
      feature('museum_route', `route/${code}`, null, { code, kind: 'tour', name, minutes, path, stops }),
    );
  };
  tour('TOUR-HIGHLIGHTS', { ja: '60 分ハイライト', en: '60-minute highlights', zh: '60 分钟精华路线' }, 60, [
    'SP1',
    'G1',
    'G3',
    'G5',
    'G6',
    'G9',
  ]);
  tour(
    'TOUR-JAPAN',
    { ja: '日本の書画と染織コース', en: 'Japanese painting and textiles', zh: '日本书画与染织专线' },
    45,
    ['G6', 'G7', 'G8', 'G9'],
  );
  tour('TOUR-SPECIAL', { ja: '企画展コース', en: 'Special exhibition route', zh: '特展路线' }, 30, [
    'SP1',
    'SP2',
  ]);

  const venue = feature('venue', 'venue', polygon([-8, -8, WIDTH + 8, DEPTH + 8]), {
    category: 'museum',
    name: options.name,
    alt_name: null,
    display_point: { type: 'Point', coordinates: ll([WIDTH / 2, DEPTH / 2]) },
  });

  return {
    manifest: {
      version: '1.0.0',
      created: '2026-01-01T00:00:00Z',
      language: 'ja',
      generator: 'indoorkit venue-gen',
    },
    venue: fc([venue]),
    building: fc([building]),
    level: fc(levels),
    unit: fc(units),
    opening: fc(openings),
    fixture: fc([]),
    amenity: fc([]),
    'museum-space': fc(space),
    'museum-case': fc(cases),
    'museum-object': fc(objects),
    'museum-device': fc(devices),
    'museum-route': fc(routes),
  };
}
