import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  Document,
  type Material as GltfMaterial,
  type Node,
  NodeIO,
  type Texture,
} from '@gltf-transform/core';
import { EXTMeshGPUInstancing } from '@gltf-transform/extensions';
import type { ImdfArchive } from '@indoorkit/imdf';
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadProp, type Prop } from './twin-props';

type Kind = 'hospital' | 'parking' | 'museum';
/** [西, 北, 东, 南]，本地米制坐标 */
type Rect = [number, number, number, number];

const COLORS = {
  facade: '#eef0ec',
  stone: '#d8d1c2',
  stoneDark: '#b9b09f',
  concrete: '#c8c6bf',
  roof: '#a9aca8',
  glass: '#33535e',
  frame: '#46515a',
  metal: '#6c7780',
  wood: '#947052',
  grass: '#7da26c',
  leaf: '#4f8a57',
  leaf2: '#76a05a',
  leafDark: '#3b6a52',
  bark: '#6e5a46',
  flower: '#cf5a4f',
  rock: '#9b968c',
  road: '#3e4950',
  line: '#ecede6',
  water: '#4b8ea0',
  paving: '#d9d3c5',
  sidewalk: '#d7d4cc',
  kerb: '#aeaba3',
  solar: '#203d55',
  lamp: '#fff2d2',
  context: '#e4e7ea',
  vehicle: '#ffffff',
};
type Material = keyof typeof COLORS;

/** 粗糙度和金属度；玻璃和水靠环境反射显出质感 */
const SURFACE: Partial<Record<Material, [roughness: number, metallic: number]>> = {
  glass: [0.06, 0.35],
  water: [0.08, 0.1],
  metal: [0.45, 0.6],
  frame: [0.5, 0.5],
  solar: [0.2, 0.4],
  vehicle: [0.45, 0.15],
  lamp: [0.4, 0],
};

/** CC0 道具（tools/venue-gen/assets/cc0）：原材质名 → 本生成器的材质 */
const NATURE: Record<string, Material> = {
  leafsGreen: 'leaf',
  leafsDark: 'leafDark',
  woodBark: 'bark',
  woodBarkDark: 'bark',
  grass: 'leaf2',
  colorRed: 'flower',
  dirt: 'rock',
  stone: 'stone',
  stoneDark: 'stoneDark',
  _defaultMat: 'stone',
};
const TREES = ['tree_oak', 'tree_fat', 'tree_dark', 'tree_pine'] as const;
const SHRUBS = ['bush', 'bush_large', 'flower_red', 'rock_large'] as const;
const CARS = ['sedan', 'suv', 'hatchback_sports', 'taxi', 'van'] as const;
const SERVICE = ['ambulance', 'delivery_van'] as const;
const CONTEXT = [
  'building_a',
  'building_c',
  'building_e',
  'building_g',
  'skyscraper_a',
  'skyscraper_b',
] as const;
const PROPS = [...TREES, ...SHRUBS, ...CARS, ...SERVICE, ...CONTEXT, 'obelisk'] as const;
type PropName = (typeof PROPS)[number];

/** 道具缩放到真实尺寸：树高约 7 m，车长约 4.5 m，周边建筑 20–90 m */
const PROP_SCALE: Record<PropName, number> = {
  tree_oak: 5.8,
  tree_fat: 5.6,
  tree_dark: 4.6,
  tree_pine: 4.8,
  bush: 4,
  bush_large: 5,
  flower_red: 3,
  rock_large: 2.2,
  sedan: 1.8,
  suv: 1.75,
  hatchback_sports: 1.6,
  taxi: 1.65,
  van: 1.75,
  ambulance: 1.85,
  delivery_van: 1.85,
  building_a: 20,
  building_c: 22,
  building_e: 18,
  building_g: 19,
  skyscraper_a: 19,
  skyscraper_b: 18,
  obelisk: 6,
};

/** 可复现的随机数（mulberry32） */
function random(seed: string) {
  let a = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const linear = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  // glTF factors are linear, unlike CSS colours.
  const c = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return [c(((n >> 16) & 255) / 255), c(((n >> 8) & 255) / 255), c((n & 255) / 255), 1];
};

const overlaps = (a: Rect, b: Rect, margin = 0) =>
  a[0] < b[2] + margin && a[2] > b[0] - margin && a[1] < b[3] + margin && a[3] > b[1] - margin;

interface Instance {
  position: Vector3;
  yaw: number;
  scale: number;
}

interface BuildingInfo {
  id: string;
  node: string;
  rects: Rect[];
  height: number;
}

/** GLB uses metres, +Y up, +X east, +Z south. Every material batch retains its building/floor/site name. */
export async function writeCampus(
  archive: ImdfArchive,
  kind: Kind,
  target: string,
  textureDir: string,
  propDir: string,
) {
  const origin = archive.venue.features[0]!.properties.display_point.coordinates as [number, number];
  const mx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const xy = (p: number[]) => [(p[0]! - origin[0]) * mx, -(p[1]! - origin[1]) * 111320] as const;
  const ll = (x: number, z: number): [number, number] => [origin[0] + x / mx, origin[1] - z / 111320];
  const rect = (ring: number[][]): Rect => {
    const p = ring.map(xy);
    return [
      Math.min(...p.map((v) => v[0])),
      Math.min(...p.map((v) => v[1])),
      Math.max(...p.map((v) => v[0])),
      Math.max(...p.map((v) => v[1])),
    ];
  };
  const floorHeight = kind === 'parking' ? 3.2 : kind === 'museum' ? 5 : 4;
  const floors = archive.level.features.filter((f) => f.properties.ordinal >= 0 && !f.properties.outdoor);
  const numFloors = kind === 'hospital' ? floors.length : kind === 'museum' ? 3 : 4;

  // 地面层的轮廓按建筑分组；医院三栋共用一层，连廊单独成组，其余按从西到东对应 A、B、C 栋
  const buildings: BuildingInfo[] = archive.building.features.map((b, i) => ({
    id: b.id,
    node: `Building ${String.fromCharCode(65 + i)}`,
    rects: [],
    height: 0,
  }));
  const links: Rect[] = [];
  for (const level of archive.level.features.filter((l) => l.properties.ordinal === 0)) {
    const g = level.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    const rects = (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => rect(p[0]!));
    const ids: string[] = level.properties.building_ids ?? [];
    if (ids.length === 1) {
      const b = buildings.find((x) => x.id === ids[0])!;
      b.rects.push(...rects);
      b.height = level.properties.outdoor ? 0 : numFloors * floorHeight;
      continue;
    }
    const wings = rects.filter((r) => r[3] - r[1] >= 5).sort((a, b) => a[0] - b[0]);
    links.push(...rects.filter((r) => r[3] - r[1] < 5));
    if (wings.length !== ids.length)
      throw new Error(`${kind}: ${wings.length} wings for ${ids.length} buildings`);
    wings.forEach((r, i) => {
      const b = buildings.find((x) => x.id === ids[i])!;
      b.rects.push(r);
      b.height = numFloors * floorHeight;
    });
  }
  const footprints = [...buildings.flatMap((b) => b.rects), ...links];
  const all = footprints.flatMap((r) => [
    [r[0], r[1]],
    [r[2], r[3]],
  ]);
  const halfX = Math.max(100, ...all.map((p) => Math.abs(p[0]!) + 38));
  const halfZ = Math.max(76, ...all.map((p) => Math.abs(p[1]!) + 48));
  const campus: Rect = [-halfX, -halfZ, halfX, halfZ];
  const outerX = halfX * 3.2;
  const outerZ = halfZ * 3.2;

  // ---- 2D 总平面（MapLibre 的室外底图），与 GLB 用同一套尺寸 ----
  const site: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [] };
  const siteRect = (name: string, r: Rect, surface: string) =>
    site.features.push({
      type: 'Feature',
      properties: { name, surface },
      geometry: {
        type: 'Polygon',
        coordinates: [[ll(r[0], r[1]), ll(r[2], r[1]), ll(r[2], r[3]), ll(r[0], r[3]), ll(r[0], r[1])]],
      },
    });
  siteRect('Surrounding ground', [-outerX, -outerZ, outerX, outerZ], 'ground');
  const streets: Rect[] = [
    [-outerX, -halfZ - 22, outerX, -halfZ - 8],
    [-outerX, halfZ + 8, outerX, halfZ + 22],
    [-halfX - 22, -outerZ, -halfX - 8, outerZ],
    [halfX + 8, -outerZ, halfX + 22, outerZ],
  ];
  for (const r of streets) siteRect('City street', r, 'road');
  siteRect('Campus ground', campus, 'grass');
  for (const r of footprints) siteRect('Building footprint', r, 'stone');
  const roads: Rect[] = [
    [-halfX, halfZ - 18, halfX, halfZ - 8],
    [-halfX + 8, -halfZ + 8, -halfX + 18, halfZ - 8],
    [halfX - 18, -halfZ + 8, halfX - 8, halfZ - 8],
    [-halfX + 8, -halfZ + 8, halfX - 8, -halfZ + 18],
  ];
  for (const r of roads) siteRect('Campus road', r, 'road');
  // 校内道路内侧的人行道
  const sidewalks: Rect[] = [
    [-halfX + 18, halfZ - 21, halfX - 18, halfZ - 18],
    [-halfX + 18, -halfZ + 18, halfX - 18, -halfZ + 21],
    [-halfX + 18, -halfZ + 21, -halfX + 21, halfZ - 21],
    [halfX - 21, -halfZ + 21, halfX - 18, halfZ - 21],
  ];
  for (const r of sidewalks) siteRect('Sidewalk', r, 'sidewalk');
  const driveways: Rect[] = archive.opening.features
    .filter((o) => o.properties.category === 'automobile')
    .map((o) => {
      const [a, b] = (o.geometry as GeoJSON.LineString).coordinates.map(xy) as [
        readonly [number, number],
        readonly [number, number],
      ];
      return [Math.min(a[0], b[0]), a[1], Math.max(a[0], b[0]), halfZ - 13];
    });
  for (const r of driveways) siteRect('Access driveway', r, 'road');
  const entrances = archive.opening.features
    .filter((d) => d.properties.category === 'pedestrian.principal')
    .map((door) => {
      const points = (door.geometry as GeoJSON.LineString).coordinates.map(xy);
      return { x: (points[0]![0] + points[1]![0]) / 2, z: (points[0]![1] + points[1]![1]) / 2 };
    });
  // 人行横道：从主入口一侧穿过最近的校内道路，停车场在每条车道出入口
  const crossings: Rect[] = [
    ...entrances.map(
      ({ x, z }): Rect =>
        z > 0 ? [x - 2.5, halfZ - 18, x + 2.5, halfZ - 8] : [x - 2.5, -halfZ + 8, x + 2.5, -halfZ + 18],
    ),
    ...driveways.map((r): Rect => [r[0] - 4.5, halfZ - 18, r[0] - 0.5, halfZ - 8]),
  ];
  for (const r of crossings) siteRect('Pedestrian crossing', r, 'crossing');

  // ---- 道具位置，高低两档共用，低档取一半 ----
  const rand = random(kind);
  const blocked = [
    ...footprints.map((r): Rect => [r[0] - 6, r[1] - 6, r[2] + 6, r[3] + 6]),
    ...driveways,
    ...crossings,
  ];
  const free = (x: number, z: number, margin = 3) =>
    !blocked.some((r) => x > r[0] - margin && x < r[2] + margin && z > r[1] - margin && z < r[3] + margin);
  const placed = new Map<PropName, Instance[]>(PROPS.map((p) => [p, []]));
  const put = (prop: PropName, x: number, y: number, z: number, yaw = rand() * Math.PI * 2, jitter = 0.15) =>
    placed.get(prop)!.push({ position: new Vector3(x, y, z), yaw, scale: 1 + (rand() * 2 - 1) * jitter });
  const treeSpots: [number, number][] = [];
  for (let x = -halfX + 25; x < halfX - 20; x += 12) treeSpots.push([x, -halfZ + 25], [x, halfZ - 26]);
  for (let z = -halfZ + 38; z < halfZ - 30; z += 13) treeSpots.push([-halfX + 26, z], [halfX - 26, z]);
  const islands: [number, number][] = treeSpots.filter(([x, z]) => free(x, z));
  for (const [x, z] of islands) put(TREES[Math.floor(rand() * TREES.length)]!, x, 0.28, z);
  // 楼前的灌木和花坛，避开入口
  for (const b of buildings.filter((b) => b.height > 0)) {
    for (const r of b.rects) {
      if (r[2] - r[0] < 10) continue;
      for (let x = r[0] + 2; x < r[2] - 2; x += 3.2) {
        for (const z of [r[1] - 2.2, r[3] + 2.2]) {
          if (entrances.some((e) => Math.abs(e.x - x) < 6 && Math.abs(e.z - z) < 8)) continue;
          put(rand() < 0.75 ? 'bush' : rand() < 0.5 ? 'bush_large' : 'flower_red', x, 0.12, z);
        }
      }
    }
  }
  for (const e of entrances)
    for (const dx of [-5.5, 5.5])
      for (let k = 0; k < 4; k++)
        put('flower_red', e.x + dx + (k % 2) * 0.8, 0.12, e.z + Math.sign(e.z) * (6 + k));
  const pond = { x: halfX * 0.42, z: halfZ * 0.6, rx: 16.8, rz: 7.8 };
  // 水池不能压到建筑上
  while (
    footprints.some((r) =>
      overlaps(r, [pond.x - pond.rx, pond.z - pond.rz, pond.x + pond.rx, pond.z + pond.rz], 4),
    )
  )
    pond.x -= 4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    put('rock_large', pond.x + Math.cos(a) * (pond.rx + 1.2), 0.1, pond.z + Math.sin(a) * (pond.rz + 1.2));
  }
  const sculpture = { x: -halfX * 0.46, z: halfZ * 0.47 };
  put('obelisk', sculpture.x, 1, sculpture.z, 0, 0);

  // 车辆：路边车位、平面停车场与屋顶车位、主入口的急救车或货车
  const carAt = (x: number, y: number, z: number, yaw: number) =>
    put(CARS[Math.floor(rand() * CARS.length)]!, x, y, z, yaw, 0.03);
  for (let i = 0; i < 12; i++)
    if (kind !== 'parking' || i % 3 !== 1) carAt(-halfX + 36 + i * 8.5, 0.07, -halfZ + 12, Math.PI / 2);
  const outdoorBays = archive.unit.features.filter(
    (u) =>
      u.properties.category === 'parking' &&
      archive.level.features.find((l) => l.id === u.properties.level_id)!.properties.outdoor,
  );
  // 室外车位只停八辆左右：整车约两千三角形，再多就超出高模预算
  const occupancy = Math.min(1, 8 / Math.max(1, outdoorBays.length));
  for (const unit of outdoorBays) {
    const level = archive.level.features.find((l) => l.id === unit.properties.level_id)!;
    if (rand() >= occupancy) continue;
    const r = rect((unit.geometry as GeoJSON.Polygon).coordinates[0]!);
    const yaw = r[2] - r[0] > r[3] - r[1] ? Math.PI / 2 : 0;
    carAt(
      (r[0] + r[2]) / 2,
      level.properties.ordinal * floorHeight + 0.45,
      (r[1] + r[3]) / 2,
      yaw + (rand() < 0.5 ? Math.PI : 0),
    );
  }
  for (const e of entrances)
    put(
      kind === 'hospital' ? 'ambulance' : 'delivery_van',
      e.x + 9,
      0.07,
      e.z + Math.sign(e.z) * 9,
      Math.PI / 2,
      0,
    );
  if (kind === 'parking') put('delivery_van', halfX - 13, 0.07, 0, 0, 0);

  // 周边街区：场地外一圈白模
  for (let gx = -outerX + 30; gx < outerX - 20; gx += 46) {
    for (let gz = -outerZ + 30; gz < outerZ - 20; gz += 46) {
      if (Math.abs(gx) < halfX + 40 && Math.abs(gz) < halfZ + 40) continue;
      if (streets.some((r) => overlaps(r, [gx - 16, gz - 16, gx + 16, gz + 16]))) continue;
      // 周边白模只取一半左右，控制在高模三角形预算内
      if (Math.hypot(gx / outerX, gz / outerZ) > 0.95 || rand() < 0.55) continue;
      const near = Math.abs(gx) < halfX + 90 && Math.abs(gz) < halfZ + 90;
      const pick = near ? CONTEXT.slice(0, 4) : CONTEXT;
      put(pick[Math.floor(rand() * pick.length)]!, gx, 0, gz, Math.floor(rand() * 4) * (Math.PI / 2), 0.1);
    }
  }

  const props = new Map<PropName, Prop>();
  for (const name of PROPS) props.set(name, await loadProp(propDir, name));

  await mkdir(target, { recursive: true });
  const budgets: Record<string, { triangles: number; meshes: number; bytes: number; instances: number }> = {};
  for (const low of [false, true]) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene(`${kind}-campus`);
    const instancing = doc.createExtension(EXTMeshGPUInstancing).setRequired(true);
    const palette = Object.fromEntries(
      Object.entries(COLORS).map(([name, hex]) => {
        const [roughness, metallic] = SURFACE[name as Material] ?? [0.85, 0];
        return [
          name,
          doc
            .createMaterial(name)
            .setBaseColorFactor(linear(hex) as [number, number, number, number])
            .setRoughnessFactor(roughness)
            .setMetallicFactor(metallic),
        ];
      }),
    ) as Record<Material, GltfMaterial>;
    if (!low) {
      palette.paving
        .setBaseColorFactor([1, 1, 1, 1])
        .setBaseColorTexture(
          doc
            .createTexture('ambientCG PavingStones036 CC0')
            .setImage(await readFile(join(textureDir, 'paving-color-512.jpg')))
            .setMimeType('image/jpeg'),
        )
        .setNormalTexture(
          doc
            .createTexture('Paving normal')
            .setImage(await readFile(join(textureDir, 'paving-normal-512.jpg')))
            .setMimeType('image/jpeg'),
        );
    }

    /** group → material → geometries */
    const batches = new Map<string, Map<Material, BufferGeometry[]>>();
    let group = 'Site';
    const add = (geometry: BufferGeometry, material: Material, matrix: Matrix4) => {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      if (g !== geometry) geometry.dispose();
      g.applyMatrix4(matrix);
      const byMaterial = batches.get(group) ?? new Map<Material, BufferGeometry[]>();
      byMaterial.set(material, [...(byMaterial.get(material) ?? []), g]);
      batches.set(group, byMaterial);
    };
    const at = (x: number, y: number, z: number, q = new Quaternion(), s = new Vector3(1, 1, 1)) =>
      new Matrix4().compose(new Vector3(x, y, z), q, s);
    const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
    // 标线只有顶面看得见，用一个面片代替盒子
    const box = (material: Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
      if (material === 'line') return add(new PlaneGeometry(w, d), material, at(x, y + h / 2, z, FLAT));
      // 外墙底部 3.6 米分三段，烘焙的环境光遮蔽才有渐变；上面整块
      const plinth = group.endsWith('/Shell') ? Math.min(h, 3.6) : 0;
      if (plinth === 0) return add(new BoxGeometry(w, h, d), material, at(x, y, z));
      const bottom = y - h / 2;
      add(new BoxGeometry(w, plinth, d, 1, 3, 1), material, at(x, bottom + plinth / 2, z));
      if (h > plinth)
        add(new BoxGeometry(w, h - plinth, d), material, at(x, bottom + plinth + (h - plinth) / 2, z));
    };
    const slab = (r: Rect, y: number, h: number, material: Material) =>
      box(material, (r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2, r[2] - r[0], h, r[3] - r[1]);

    // ---- 场地 ----
    group = 'Site';
    slab(campus, -0.45, 0.8, 'grass');
    for (const r of roads) slab(r, 0.015, 0.06, 'road');
    for (const r of sidewalks) {
      slab(r, 0.06, 0.12, 'sidewalk');
      // 路缘石
      const horizontal = r[2] - r[0] > r[3] - r[1];
      if (horizontal)
        for (const z of [r[1], r[3]]) box('kerb', (r[0] + r[2]) / 2, 0.09, z, r[2] - r[0], 0.18, 0.2);
      else for (const x of [r[0], r[2]]) box('kerb', x, 0.09, (r[1] + r[3]) / 2, 0.2, 0.18, r[3] - r[1]);
    }
    for (let x = -halfX + 20; x < halfX - 20; x += 8) {
      box('line', x, 0.06, halfZ - 13, 3.6, 0.025, 0.16);
      box('line', x, 0.06, -halfZ + 13, 3.6, 0.025, 0.16);
    }
    for (const r of crossings) {
      const vertical = r[3] - r[1] > r[2] - r[0];
      for (let t = 0.5; t < (vertical ? r[3] - r[1] : r[2] - r[0]); t += 1)
        if (vertical) box('line', (r[0] + r[2]) / 2, 0.07, r[1] + t, r[2] - r[0], 0.02, 0.5);
        else box('line', r[0] + t, 0.07, (r[1] + r[3]) / 2, 0.5, 0.02, r[3] - r[1]);
    }
    slab([-halfX + 30, -halfZ + 31, halfX - 30, halfZ - 31], 0.01, 0.12, 'paving');
    for (const r of driveways) slab(r, 0.1, 0.08, 'road');
    for (const [x, z] of islands) slab([x - 2.5, z - 2.5, x + 2.5, z + 2.5], 0.15, 0.25, 'grass');

    group = 'Water garden';
    add(
      new CylinderGeometry(1, 1, 0.18, low ? 20 : 48),
      'stone',
      at(pond.x, 0.15, pond.z, undefined, new Vector3(pond.rx + 1.2, 1, pond.rz + 1.2)),
    );
    add(
      new CylinderGeometry(1, 1, 0.2, low ? 20 : 48),
      'water',
      at(pond.x, 0.23, pond.z, undefined, new Vector3(pond.rx, 1, pond.rz)),
    );
    group = 'Sculpture garden';
    box('stone', sculpture.x, 0.5, sculpture.z, 5, 1, 5);

    group = 'Street furniture';
    for (let x = -halfX + 32; x < halfX - 30; x += 24) {
      box('metal', x, 3, halfZ - 22, 0.15, 6, 0.15);
      box('frame', x, 6, halfZ - 21.6, 0.3, 0.2, 1);
      box('lamp', x, 5.86, halfZ - 21.3, 0.26, 0.08, 0.5);
      if (!low) {
        box('wood', x + 4, 0.65, halfZ - 29, 2.5, 0.12, 0.7);
        box('wood', x + 4, 0.95, halfZ - 29.3, 2.5, 0.5, 0.08);
        box('metal', x + 3.2, 0.3, halfZ - 29, 0.1, 0.6, 0.6);
        box('metal', x + 4.8, 0.3, halfZ - 29, 0.1, 0.6, 0.6);
      }
    }

    // ---- 建筑 ----
    const facades = new Map<string, Record<'north' | 'south' | 'east' | 'west', number>>();
    for (const b of buildings) {
      const count = { north: 0, south: 0, east: 0, west: 0 };
      facades.set(b.node, count);
      b.rects.forEach((r, part) => {
        const width = r[2] - r[0];
        const depth = r[3] - r[1];
        const cx = (r[0] + r[2]) / 2;
        const cz = (r[1] + r[3]) / 2;
        const height = b.height;
        if (height === 0) {
          group = `${b.node}/Surface`;
          slab(r, 0.13, 0.2, 'road');
          return;
        }
        const core = kind === 'museum' && width < 8;
        if (kind === 'parking') {
          group = `${b.node}/Shell`;
          for (let f = 0; f < numFloors; f++) {
            // A continuous open ramp well stays clear of floor slabs.
            slab([r[0], r[1], r[2] - 6, r[3]], f * floorHeight + 0.2, 0.4, 'concrete');
            for (let x = r[0] + 3; x < r[2] - 7; x += 8)
              for (const z of [r[1] + 1, r[3] - 1])
                box('concrete', x, f * floorHeight + floorHeight / 2, z, 0.6, floorHeight, 0.6);
          }
          box('concrete', r[0] + 0.3, (numFloors * floorHeight) / 2, cz, 0.6, numFloors * floorHeight, depth);
          group = `${b.node}/Facade`;
          for (let f = 0; f < numFloors; f++) {
            const y = f * floorHeight + 1.15;
            for (const z of [r[1] - 0.1, r[3] + 0.1]) box('metal', cx - 3, y, z, width - 6, 0.9, 0.08);
            box('metal', r[0] - 0.1, y, cz, 0.08, 0.9, depth);
            if (f < numFloors - 1) {
              for (let x = r[0] + 1; x < r[2] - 7; x += 1.6) {
                for (const z of [r[1] - 0.2, r[3] + 0.2])
                  box('frame', x, f * floorHeight + floorHeight / 2 + 0.4, z, 0.12, floorHeight - 0.8, 0.25);
                count.north++;
                count.south++;
              }
              for (let z = r[1] + 1; z < r[3] - 1; z += 1.6) {
                box(
                  'frame',
                  r[0] - 0.2,
                  f * floorHeight + floorHeight / 2 + 0.4,
                  z,
                  0.25,
                  floorHeight - 0.8,
                  0.12,
                );
                count.west++;
              }
            }
          }
          const rampX = r[2] - 3;
          group = `${b.node}/Vehicle ramps`;
          for (let f = 0; f < numFloors - 1; f++) {
            const a = new Vector3(rampX - 1.5, f * floorHeight + 0.35, cz + 10);
            const m = new Vector3(rampX - 1.5, f * floorHeight + floorHeight / 2 + 0.35, cz - 10);
            const c = new Vector3(rampX + 1.5, (f + 1) * floorHeight + 0.35, cz + 10);
            for (const [start, end] of [
              [a, m],
              [new Vector3(rampX + 1.5, m.y, m.z), c],
            ] as const) {
              const mid = start.clone().add(end).multiplyScalar(0.5);
              const dir = end.clone().sub(start);
              add(
                new BoxGeometry(2.8, 0.25, dir.length()),
                'concrete',
                at(
                  mid.x,
                  mid.y,
                  mid.z,
                  new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir.normalize()),
                ),
              );
            }
            box('concrete', rampX, m.y, m.z, 6, 0.25, 3);
          }
          group = `${b.node}/Lift and stair towers`;
          for (const z of [r[1] + 2.5, r[3] - 2.5]) {
            box('glass', rampX, (numFloors * floorHeight) / 2, z, 5.5, numFloors * floorHeight + 1, 5);
            for (let f = 0; f <= numFloors; f++) box('frame', rampX, f * floorHeight + 0.1, z, 5.7, 0.2, 5.2);
          }
          count.east = numFloors * 2;
          return;
        }
        const wall: Material = kind === 'museum' ? 'stone' : 'facade';
        group = `${b.node}/Shell`;
        box(wall, cx, height / 2, cz, width, height, depth);
        if (kind === 'museum') {
          // 石材分缝
          for (let y = 1.2; y < height; y += 1.2) {
            for (const z of [r[1] - 0.02, r[3] + 0.02]) box('stoneDark', cx, y, z, width, 0.05, 0.04);
            for (const x of [r[0] - 0.02, r[2] + 0.02]) box('stoneDark', x, y, cz, 0.04, 0.05, depth);
          }
        }
        group = `${b.node}/Floors`;
        for (let f = 1; f < numFloors; f++)
          slab(
            [r[0] - 0.15, r[1] - 0.15, r[2] + 0.15, r[3] + 0.15],
            f * floorHeight,
            0.3,
            kind === 'museum' ? 'stoneDark' : 'stone',
          );
        if (!core) {
          group = `${b.node}/Windows`;
          const pitch = kind === 'museum' ? 3 : 1.6;
          const pane = kind === 'museum' ? 0.9 : 1.45;
          const sill = kind === 'museum' ? 0.35 : 0.5;
          for (let f = 0; f < numFloors; f++) {
            const y = f * floorHeight + floorHeight * 0.55;
            const h = floorHeight * (kind === 'museum' ? 0.62 : 0.5);
            // 南北立面：医院是连续带窗加竖框，博物馆是竖向窄窗
            for (const [z, side] of [
              [r[1] - 0.04, 'north'],
              [r[3] + 0.04, 'south'],
            ] as const) {
              if (kind === 'hospital') box('glass', cx, y, z, width - 1.2, h, 0.06);
              for (let x = r[0] + 1.2; x < r[2] - 1; x += pitch) {
                if (kind === 'museum') box('glass', x, y, z, pane, h, 0.06);
                else if (!low)
                  box('frame', x, y, z + (side === 'north' ? -0.03 : 0.03), 0.07, h + 0.05, 0.05);
                count[side]++;
              }
              box('frame', cx, y - h / 2 - sill / 2 + 0.25, z, width - 1, 0.08, 0.1);
            }
            for (const [x, side] of [
              [r[0] - 0.04, 'west'],
              [r[2] + 0.04, 'east'],
            ] as const) {
              if (kind === 'hospital') box('glass', x, y, cz, 0.06, h, depth - 1.2);
              for (let z = r[1] + 1.2; z < r[3] - 1; z += pitch) {
                if (kind === 'museum') box('glass', x, y, z, 0.06, h, pane);
                else if (!low) box('frame', x + (side === 'west' ? -0.03 : 0.03), y, z, 0.05, h + 0.05, 0.07);
                count[side]++;
              }
            }
          }
        }
        group = `${b.node}/Roof`;
        slab([r[0] + 0.3, r[1] + 0.3, r[2] - 0.3, r[3] - 0.3], height + 0.08, 0.16, 'roof');
        // 女儿墙
        for (const z of [r[1] + 0.15, r[3] - 0.15]) box(wall, cx, height + 0.55, z, width, 1.1, 0.3);
        for (const x of [r[0] + 0.15, r[2] - 0.15]) box(wall, x, height + 0.55, cz, 0.3, 1.1, depth);
        if (!core && part === 0) {
          box('metal', cx - width * 0.2, height + 0.9, cz, 3, 1.6, 3);
          box('facade', cx + width * 0.2, height + 1.4, cz, 4.5, 2.6, 3);
          if (kind === 'museum') {
            box('glass', cx, height + 0.75, cz, width * 0.45, 0.7, depth * 0.4);
            box('frame', cx, height + 1.12, cz, width * 0.45 + 0.2, 0.06, depth * 0.4 + 0.2);
          } else
            for (let x = r[0] + 4; x < r[2] - 4; x += 4.2)
              add(
                new BoxGeometry(3.6, 0.08, 2.2),
                'solar',
                at(x, height + 0.7, r[1] + 3, new Quaternion().setFromEuler(new Euler(-0.35, 0, 0))),
              );
        }
      });
    }
    group = 'Links';
    for (const r of links) {
      const height = numFloors * floorHeight;
      const cx = (r[0] + r[2]) / 2;
      const cz = (r[1] + r[3]) / 2;
      box('glass', cx, height / 2, cz, r[2] - r[0], height, r[3] - r[1]);
      for (let f = 0; f <= numFloors; f++)
        box('frame', cx, f * floorHeight, cz, r[2] - r[0] + 0.1, 0.25, r[3] - r[1] + 0.2);
    }

    // Door geometry is derived from IMDF, not an unrelated ornamental entrance.
    group = 'Accessible entrance';
    for (const { x, z } of entrances) {
      const side = z > 0 ? 1 : -1;
      box('glass', x, 1.6, z + side * 0.12, 5, 3.2, 0.12);
      for (const dx of [-2.5, 0, 2.5]) box('frame', x + dx, 1.6, z + side * 0.16, 0.12, 3.2, 0.1);
      box('facade', x, 3.6, z + side * 2.4, 8, 0.35, 4.8);
      box('frame', x, 3.38, z + side * 4.75, 8, 0.12, 0.12);
      for (const dx of [-3.6, 3.6]) box('metal', x + dx, 1.7, z + side * 4.4, 0.18, 3.4, 0.18);
      slab([x - 3, Math.min(z, z + side * 13), x + 3, Math.max(z, z + side * 13)], 0.08, 0.08, 'paving');
    }
    // Surface and roof markings share the actual bay footprints.
    if (kind === 'parking') {
      for (const unit of archive.unit.features.filter((u) => u.properties.category === 'parking')) {
        const level = archive.level.features.find((l) => l.id === unit.properties.level_id)!;
        if (!level.properties.outdoor) continue;
        const r = rect((unit.geometry as GeoJSON.Polygon).coordinates[0]!);
        const y = level.properties.ordinal * floorHeight + 0.43;
        group = `Bays/${level.properties.short_name.en}`;
        for (const x of [r[0], r[2]]) box('line', x, y, (r[1] + r[3]) / 2, 0.08, 0.02, r[3] - r[1]);
        box('line', (r[0] + r[2]) / 2, y, r[1], r[2] - r[0], 0.02, 0.08);
      }
    }

    // ---- 写出静态几何：顶层节点 → 子节点（组）→ 每种材质一个 primitive ----
    const tops = new Map<string, Node>();
    const top = (name: string) => {
      let node = tops.get(name);
      if (!node) {
        node = doc.createNode(name);
        tops.set(name, node);
        scene.addChild(node);
      }
      return node;
    };
    let triangles = 0;
    let meshes = 0;
    for (const [name, byMaterial] of batches) {
      const mesh = doc.createMesh(name);
      const shell = name.endsWith('/Shell');
      for (const [material, geometries] of byMaterial) {
        // 只有铺装用贴图；其余去掉 UV，再合并重复顶点写成索引几何
        if (material !== 'paving') for (const g of geometries) g.deleteAttribute('uv');
        const merged = mergeGeometries(geometries);
        if (!merged) throw new Error(`Cannot merge ${name}/${material}`);
        const geometry = mergeVertices(merged, 1e-4);
        merged.dispose();
        const primitive = doc.createPrimitive().setMaterial(palette[material]);
        for (const [attribute, semantic, type] of [
          ['position', 'POSITION', 'VEC3'],
          ['normal', 'NORMAL', 'VEC3'],
          ['uv', 'TEXCOORD_0', 'VEC2'],
        ] as const) {
          if (!geometry.hasAttribute(attribute)) continue;
          const values = new Float32Array(geometry.getAttribute(attribute).array);
          if (attribute === 'uv') for (let i = 0; i < values.length; i++) values[i] = values[i]! * 24;
          primitive.setAttribute(
            semantic,
            doc.createAccessor().setType(type).setArray(values).setBuffer(buffer),
          );
        }
        const index = geometry.index!.array;
        const vertexCount = geometry.getAttribute('position').count;
        primitive.setIndices(
          doc
            .createAccessor()
            .setType('SCALAR')
            .setArray(vertexCount < 65_536 ? Uint16Array.from(index) : Uint32Array.from(index))
            .setBuffer(buffer),
        );
        if (shell) {
          // 烘焙的环境光遮蔽：贴近地面的墙面更暗
          const position = geometry.getAttribute('position');
          const ao = new Float32Array(position.count * 4);
          for (let i = 0; i < position.count; i++) {
            const t = Math.min(1, Math.max(0, position.getY(i) / 3.5));
            const v = 0.58 + 0.42 * t * t * (3 - 2 * t);
            ao.set([v, v, v, 1], i * 4);
          }
          primitive.setAttribute(
            'COLOR_0',
            doc.createAccessor().setType('VEC4').setArray(ao).setBuffer(buffer),
          );
        }
        triangles += index.length / 3;
        mesh.addPrimitive(primitive);
        meshes++;
        geometry.dispose();
        for (const g of geometries) g.dispose();
      }
      const parent = top(name.split('/')[0]!);
      if (name === 'Links') parent.setExtras({ indoorHidden: true });
      if (name === 'Accessible entrance') parent.setExtras({ indoorKeepMaterial: 'paving' });
      if (name.includes('/')) {
        const child = doc.createNode(name).setMesh(mesh);
        if (name.startsWith('Bays/')) {
          const level = archive.level.features.find((l) => l.properties.short_name.en === name.slice(5));
          if (level && level.properties.ordinal > 0) child.setExtras({ indoorHidden: true });
        }
        parent.addChild(child);
      } else parent.setMesh(mesh);
    }

    // ---- CC0 道具：每个原型一个网格，用 EXT_mesh_gpu_instancing 摆放 ----
    const vehicleTextures = new Map<string, Texture>();
    const vehicleMaterial = (image: Uint8Array, mimeType: string) => {
      const key = createHash('sha256').update(image).digest('hex');
      let texture = vehicleTextures.get(key);
      if (!texture) {
        texture = doc
          .createTexture(`Kenney vehicle colormap ${vehicleTextures.size + 1}`)
          .setImage(image)
          .setMimeType(mimeType);
        vehicleTextures.set(key, texture);
      }
      return texture;
    };
    const vehicleMaterials = new Map<Texture, GltfMaterial>();
    let instanceTotal = 0;
    for (const [name, list] of placed) {
      const chosen = low ? list.filter((_, i) => i % 2 === 0) : list;
      if (chosen.length === 0) continue;
      const prop = props.get(name)!;
      const isCar =
        (CARS as readonly string[]).includes(name) || (SERVICE as readonly string[]).includes(name);
      const isContext = (CONTEXT as readonly string[]).includes(name);
      const groupName = isCar
        ? 'Vehicles'
        : isContext
          ? 'Context'
          : name === 'obelisk'
            ? 'Sculpture garden'
            : 'Trees';
      const mesh = doc.createMesh(`${groupName}/${name}`);
      const s = PROP_SCALE[name];
      // 原型放在地面上：底部对齐 y=0
      const lift = -prop.min.y * s;
      for (const part of prop.parts) {
        let material: GltfMaterial;
        if (isContext) material = palette.context;
        else if (part.texture) {
          const texture = vehicleMaterial(part.texture.image, part.texture.mimeType);
          material =
            vehicleMaterials.get(texture) ??
            doc
              .createMaterial('vehicle')
              .setBaseColorTexture(texture)
              .setRoughnessFactor(0.45)
              .setMetallicFactor(0.15);
          vehicleMaterials.set(texture, material);
        } else material = palette[NATURE[part.material] ?? 'stone'];
        const positions = part.positions.map((v) => v * s);
        for (let i = 1; i < positions.length; i += 3) positions[i] = positions[i]! + lift;
        const primitive = doc
          .createPrimitive()
          .setMaterial(material)
          .setAttribute(
            'POSITION',
            doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer),
          )
          .setAttribute(
            'NORMAL',
            doc.createAccessor().setType('VEC3').setArray(part.normals).setBuffer(buffer),
          )
          .setIndices(
            doc
              .createAccessor()
              .setType('SCALAR')
              .setArray(positions.length / 3 < 65_536 ? Uint16Array.from(part.indices) : part.indices)
              .setBuffer(buffer),
          );
        if (part.uvs && part.texture)
          primitive.setAttribute(
            'TEXCOORD_0',
            doc.createAccessor().setType('VEC2').setArray(part.uvs).setBuffer(buffer),
          );
        mesh.addPrimitive(primitive);
        meshes++;
        triangles += (part.indices.length / 3) * chosen.length;
      }
      const translation = new Float32Array(chosen.length * 3);
      const rotation = new Float32Array(chosen.length * 4);
      const scale = new Float32Array(chosen.length * 3);
      const q = new Quaternion();
      chosen.forEach((inst, i) => {
        inst.position.toArray(translation, i * 3);
        q.setFromAxisAngle(new Vector3(0, 1, 0), inst.yaw).toArray(rotation, i * 4);
        scale.set([inst.scale, inst.scale, inst.scale], i * 3);
      });
      const batch = instancing
        .createInstancedMesh()
        .setAttribute(
          'TRANSLATION',
          doc.createAccessor().setType('VEC3').setArray(translation).setBuffer(buffer),
        )
        .setAttribute('ROTATION', doc.createAccessor().setType('VEC4').setArray(rotation).setBuffer(buffer))
        .setAttribute('SCALE', doc.createAccessor().setType('VEC3').setArray(scale).setBuffer(buffer));
      // 道具组带标记，渲染器按画质开关整组显示或隐藏
      if (groupName !== 'Sculpture garden')
        top(groupName).setExtras({ props: true, ...(isCar ? { indoorHideAbove: 1 } : {}) });
      top(groupName).addChild(
        doc.createNode(`${groupName}/${name}`).setMesh(mesh).setExtension('EXT_mesh_gpu_instancing', batch),
      );
      instanceTotal += chosen.length;
    }
    for (const b of buildings)
      top(b.node).setExtras({
        buildingId: b.id,
        height: b.height,
        facades: b.height > 0 ? facades.get(b.node) : undefined,
      });

    scene.setExtras({
      origin,
      bearing: kind === 'museum' ? 156 : -24,
      metres: true,
      axes: 'X east, Y up, Z south',
      kind,
      quality: low ? 'low' : 'high',
      floorHeight,
    });
    const glb = await new NodeIO().registerExtensions([EXTMeshGPUInstancing]).writeBinary(doc);
    await writeFile(join(target, low ? 'scene-low.glb' : 'scene.glb'), glb);
    budgets[low ? 'low' : 'high'] = {
      triangles: Math.round(triangles),
      meshes,
      bytes: glb.byteLength,
      instances: instanceTotal,
    };
  }
  await writeFile(join(target, 'site.geojson'), JSON.stringify(site));
  const centre = (rects: Rect[]) => {
    const x0 = Math.min(...rects.map((r) => r[0]));
    const z0 = Math.min(...rects.map((r) => r[1]));
    const x1 = Math.max(...rects.map((r) => r[2]));
    const z1 = Math.max(...rects.map((r) => r[3]));
    return ll((x0 + x1) / 2, (z0 + z1) / 2);
  };
  const manifest = {
    origin,
    bearing: kind === 'museum' ? 156 : -24,
    bounds: [ll(-halfX, halfZ), ll(halfX, -halfZ)],
    ground: [ll(-outerX, outerZ), ll(outerX, -outerZ)],
    floorHeight,
    buildings: buildings.map((b) => ({ id: b.id, node: b.node, center: centre(b.rects), height: b.height })),
    counts: {
      buildings: archive.building.features.length,
      floors: archive.level.features.length,
      trees: islands.length,
      surfaces: Object.keys(COLORS).length,
    },
    budgets,
  };
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
