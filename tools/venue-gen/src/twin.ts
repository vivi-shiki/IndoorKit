import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import type { ImdfArchive } from '@indoorkit/imdf';
import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Kind = 'hospital' | 'parking' | 'museum';
type Rect = [number, number, number, number];
const COLORS = {
  stone: '#d9d4c7',
  white: '#edf0e8',
  glass: '#487c87',
  metal: '#526571',
  wood: '#947052',
  grass: '#7c9d73',
  leaf: '#477b58',
  leaf2: '#739359',
  trunk: '#736451',
  road: '#414e58',
  line: '#e5e5d6',
  water: '#5c9eaa',
  paving: '#dad4c6',
  blue: '#3b789c',
  red: '#b66f57',
  solar: '#294d66',
};
type Material = keyof typeof COLORS;

/** GLB uses metres, +Y up, +X east, +Z south. Every material batch retains its floor/site name. */
export async function writeCampus(archive: ImdfArchive, kind: Kind, target: string, textureDir: string) {
  const origin = archive.venue.features[0]!.properties.display_point.coordinates as [number, number];
  const mx = 111320 * Math.cos((origin[1] * Math.PI) / 180);
  const xy = (p: number[]) => [(p[0]! - origin[0]) * mx, -(p[1]! - origin[1]) * 111320] as const;
  const ll = (x: number, z: number) => [origin[0] + x / mx, origin[1] - z / 111320];
  const rect = (ring: number[][]): Rect => {
    const p = ring.map(xy);
    return [
      Math.min(...p.map((v) => v[0])),
      Math.min(...p.map((v) => v[1])),
      Math.max(...p.map((v) => v[0])),
      Math.max(...p.map((v) => v[1])),
    ];
  };
  const ground = archive.level.features.filter((l) => l.properties.ordinal === 0);
  const footprints: Rect[] = ground.flatMap((l) => {
    const g = l.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((p) => rect(p[0]!));
  });
  const all = footprints.flatMap((r) => [
    [r[0], r[1]],
    [r[2], r[3]],
  ]);
  const halfX = Math.max(100, ...all.map((p) => Math.abs(p[0]!) + 38));
  const halfZ = Math.max(76, ...all.map((p) => Math.abs(p[1]!) + 48));
  const floorHeight = kind === 'parking' ? 3.2 : kind === 'museum' ? 5 : 4;
  const floors = archive.level.features.filter((f) => f.properties.ordinal >= 0 && !f.properties.outdoor);
  const numFloors = kind === 'hospital' ? floors.length : kind === 'museum' ? 3 : 4;
  const site: GeoJSON.FeatureCollection<GeoJSON.Polygon> = { type: 'FeatureCollection', features: [] };
  const siteRect = (name: string, r: Rect, surface: Material) =>
    site.features.push({
      type: 'Feature',
      properties: { name, surface },
      geometry: {
        type: 'Polygon',
        coordinates: [[ll(r[0], r[1]), ll(r[2], r[1]), ll(r[2], r[3]), ll(r[0], r[3]), ll(r[0], r[1])]],
      },
    });
  siteRect('Campus ground', [-halfX, -halfZ, halfX, halfZ], 'grass');
  for (const r of footprints) siteRect('Building footprint', r, 'stone');
  const roads: Rect[] = [
    [-halfX, halfZ - 18, halfX, halfZ - 8],
    [-halfX + 8, -halfZ + 8, -halfX + 18, halfZ - 8],
    [halfX - 18, -halfZ + 8, halfX - 8, halfZ - 8],
    [-halfX + 8, -halfZ + 8, halfX - 8, -halfZ + 18],
  ];
  for (const r of roads) siteRect('Campus road', r, 'road');
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
  const trees: [number, number][] = [];
  for (let x = -halfX + 25; x < halfX - 20; x += 12) {
    trees.push([x, -halfZ + 25], [x, halfZ - 26]);
  }
  for (let z = -halfZ + 38; z < halfZ - 30; z += 13) trees.push([-halfX + 26, z], [halfX - 26, z]);
  await mkdir(target, { recursive: true });
  const budgets: Record<string, { triangles: number; meshes: number; bytes: number }> = {};
  for (const low of [false, true]) {
    const doc = new Document();
    const buffer = doc.createBuffer();
    const scene = doc.createScene(`${kind}-campus`);
    const palette = Object.fromEntries(
      Object.entries(COLORS).map(([name, hex]) => {
        const n = Number.parseInt(hex.slice(1), 16);
        // glTF factors are linear, unlike CSS colours.
        const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return [
          name,
          doc
            .createMaterial(name)
            .setBaseColorFactor([
              linear(((n >> 16) & 255) / 255),
              linear(((n >> 8) & 255) / 255),
              linear((n & 255) / 255),
              1,
            ])
            .setRoughnessFactor(name === 'glass' || name === 'water' ? 0.25 : 0.85)
            .setMetallicFactor(name === 'metal' || name === 'solar' ? 0.45 : 0),
        ];
      }),
    ) as Record<Material, ReturnType<Document['createMaterial']>>;
    const paving = doc
      .createTexture('ambientCG PavingStones036 CC0')
      .setImage(await readFile(join(textureDir, 'paving-color.jpg')))
      .setMimeType('image/jpeg');
    palette.paving.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(paving);
    if (!low)
      palette.paving.setNormalTexture(
        doc
          .createTexture('Paving normal')
          .setImage(await readFile(join(textureDir, 'paving-normal.jpg')))
          .setMimeType('image/jpeg'),
      );
    const batches = new Map<string, BufferGeometry[]>();
    const materials = new Map<string, Material>();
    let group = 'Landscape';
    const add = (
      geometry: BufferGeometry,
      material: Material,
      x: number,
      y: number,
      z: number,
      scale: [number, number, number] = [1, 1, 1],
      rotation = new Quaternion(),
    ) => {
      const g = geometry.toNonIndexed();
      if (g !== geometry) geometry.dispose();
      g.applyMatrix4(new Matrix4().compose(new Vector3(x, y, z), rotation, new Vector3(...scale)));
      const key = `${group}/${material}`;
      const values = batches.get(key) ?? [];
      values.push(g);
      batches.set(key, values);
      materials.set(key, material);
    };
    const box = (material: Material, x: number, y: number, z: number, w: number, h: number, d: number) =>
      add(new BoxGeometry(w, h, d), material, x, y, z);
    const slab = (r: Rect, y: number, h: number, material: Material) =>
      box(material, (r[0] + r[2]) / 2, y, (r[1] + r[3]) / 2, r[2] - r[0], h, r[3] - r[1]);
    slab([-halfX, -halfZ, halfX, halfZ], -0.45, 0.8, 'grass');
    for (const r of roads) slab(r, 0.015, 0.06, 'road');
    for (let x = -halfX + 20; x < halfX - 20; x += 8) {
      box('line', x, 0.06, halfZ - 13, 3.6, 0.025, 0.16);
      box('line', x, 0.06, -halfZ + 13, 3.6, 0.025, 0.16);
    }
    slab([-halfX + 30, -halfZ + 31, halfX - 30, halfZ - 31], 0.01, 0.12, 'paving');
    for (const r of driveways) {
      slab(r, 0.1, 0.08, 'road');
      for (let x = r[0] + 0.5; x < r[2] - 0.3; x += 1) box('line', x, 0.15, halfZ - 26, 0.5, 0.02, 3);
    }
    // Planted islands keep paths, building footprints and emergency access clear.
    for (const [x, z] of trees.filter(
      ([x, z], i) =>
        (!low || i % 2 === 0) &&
        !driveways.some((r) => x > r[0] - 3 && x < r[2] + 3 && z > r[1] - 3 && z < r[3] + 3),
    )) {
      slab([x - 2.5, z - 2.5, x + 2.5, z + 2.5], 0.15, 0.25, 'grass');
      add(new CylinderGeometry(0.18, 0.3, 3.2, 6), 'trunk', x, 1.7, z);
      add(new SphereGeometry(2.2, low ? 5 : 8, low ? 3 : 6), 'leaf', x, 4.2, z, [1, 1.3, 1]);
      if (!low) add(new SphereGeometry(1.7, 8, 5), 'leaf2', x + 1, 5.1, z - 0.6);
    }
    group = 'Water garden';
    add(
      new CylinderGeometry(1, 1, 0.18, low ? 20 : 40),
      'stone',
      halfX * 0.42,
      0.15,
      halfZ * 0.48,
      [18, 1, 9],
    );
    add(
      new CylinderGeometry(1, 1, 0.2, low ? 20 : 40),
      'water',
      halfX * 0.42,
      0.23,
      halfZ * 0.48,
      [16.8, 1, 7.8],
    );
    group = 'Sculpture garden';
    box('stone', -halfX * 0.46, 0.5, halfZ * 0.47, 5, 1, 5);
    add(
      new TorusGeometry(2, 0.38, 6, low ? 12 : 28),
      'metal',
      -halfX * 0.46,
      3.3,
      halfZ * 0.47,
      [1, 1.2, 1],
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.5),
    );
    group = 'Street furniture';
    for (let x = -halfX + 32; x < halfX - 30; x += 24) {
      box('metal', x, 3, halfZ - 22, 0.15, 6, 0.15);
      box('white', x, 6, halfZ - 22, 1.4, 0.18, 0.6);
      if (!low) {
        box('wood', x + 4, 0.65, halfZ - 29, 2.5, 0.15, 0.7);
        box('metal', x + 3.2, 0.3, halfZ - 29, 0.12, 0.6, 0.6);
        box('metal', x + 4.8, 0.3, halfZ - 29, 0.12, 0.6, 0.6);
      }
    }
    const car = (x: number, z: number, y = 0, color: Material = 'blue') => {
      box(color, x, y + 0.7, z, 1.8, 0.8, 4.1);
      box('glass', x, y + 1.3, z - 0.15, 1.5, 0.65, 2.1);
      if (!low)
        for (const dx of [-0.83, 0.83])
          for (const dz of [-1.3, 1.3])
            add(
              new CylinderGeometry(0.34, 0.34, 0.22, 8),
              'road',
              x + dx,
              y + 0.35,
              z + dz,
              [1, 1, 1],
              new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2),
            );
    };
    group = 'Vehicles';
    for (let i = 0; i < (low ? 4 : 10); i++)
      car(-halfX + 36 + i * 9, -halfZ + 12, 0, i % 3 === 0 ? 'red' : i % 3 === 1 ? 'white' : 'blue');

    footprints.forEach((r, index) => {
      const width = r[2] - r[0];
      const depth = r[3] - r[1];
      const cx = (r[0] + r[2]) / 2;
      const cz = (r[1] + r[3]) / 2;
      const surface = kind === 'parking' && index > 0;
      const bridge = kind === 'hospital' && depth < 5;
      const escapeCore = kind === 'museum' && width < 8;
      group = `Building ${index + 1}`;
      if (surface) {
        slab(r, 0.13, 0.2, 'road');
      } else {
        const height = numFloors * floorHeight;
        if (kind !== 'parking') {
          box(
            bridge ? 'glass' : kind === 'museum' ? 'stone' : 'white',
            cx,
            height / 2,
            cz,
            width,
            height,
            depth,
          );
          for (let f = 0; f < numFloors; f++) {
            group = `Building ${index + 1}/Floor ${f + 1}`;
            slab([r[0] - 0.18, r[1] - 0.18, r[2] + 0.18, r[3] + 0.18], f * floorHeight + 0.16, 0.32, 'stone');
            if (!escapeCore) {
              for (let x = r[0] + 1.2; x < r[2] - 1; x += kind === 'museum' ? 3 : 2.5) {
                for (const z of [r[1] - 0.025, r[3] + 0.025])
                  box(
                    'glass',
                    x,
                    f * floorHeight + floorHeight * 0.55,
                    z,
                    kind === 'museum' ? 1 : 1.6,
                    floorHeight * 0.54,
                    0.08,
                  );
              }
            }
          }
          group = `Building ${index + 1}/Roof`;
          slab([r[0] - 0.4, r[1] - 0.4, r[2] + 0.4, r[3] + 0.4], height + 0.2, 0.4, 'stone');
          if (!bridge && !escapeCore) {
            box('metal', cx - width * 0.2, height + 0.8, cz, 3, 1.2, 3);
            box('white', cx + width * 0.2, height + 0.8, cz, 4, 1.2, 2);
            if (kind === 'museum') box('glass', cx, height + 0.65, cz, width * 0.45, 0.6, depth * 0.4);
            else
              for (let x = r[0] + 5; x < r[2] - 3; x += 5)
                box('solar', x, height + 0.5, r[1] + 3, 3.8, 0.25, 2.5);
          }
        } else {
          for (let f = 0; f < numFloors; f++) {
            group = `Building ${index + 1}/Floor ${f + 1}`;
            // A continuous open ramp well stays clear of floor slabs.
            slab([r[0], r[1], r[2] - 6, r[3]], f * floorHeight + 0.2, 0.4, 'stone');
            for (let x = r[0] + 3; x < r[2] - 7; x += 8)
              for (const z of [r[1] + 1, r[3] - 1])
                box('white', x, f * floorHeight + floorHeight / 2, z, 0.6, floorHeight, 0.6);
            for (const z of [r[1], r[3]]) box('metal', cx - 3, f * floorHeight + 0.8, z, width - 6, 1, 0.18);
          }
          const rampX = r[2] - 3;
          group = 'Vehicle ramps';
          for (let f = 0; f < numFloors - 1; f++) {
            const a = new Vector3(rampX - 1.5, f * floorHeight + 0.35, cz + 10);
            const b = new Vector3(rampX - 1.5, f * floorHeight + floorHeight / 2 + 0.35, cz - 10);
            const c = new Vector3(rampX + 1.5, (f + 1) * floorHeight + 0.35, cz + 10);
            for (const [start, end] of [
              [a, b],
              [new Vector3(rampX + 1.5, b.y, b.z), c],
            ] as const) {
              const midpoint = start.clone().add(end).multiplyScalar(0.5);
              const direction = end.clone().sub(start);
              add(
                new BoxGeometry(2.8, 0.25, direction.length()),
                'road',
                midpoint.x,
                midpoint.y,
                midpoint.z,
                [1, 1, 1],
                new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), direction.normalize()),
              );
            }
            box('road', rampX, b.y, b.z, 6, 0.25, 3);
          }
          group = 'Lift and stair towers';
          for (const z of [r[1] + 2.5, r[3] - 2.5])
            box('glass', rampX, (numFloors * floorHeight) / 2, z, 5.5, numFloors * floorHeight + 1, 5);
        }
      }
    });
    // Door geometry is derived from IMDF, not an unrelated ornamental entrance.
    for (const door of archive.opening.features.filter(
      (d) => d.properties.category === 'pedestrian.principal',
    )) {
      const points = (door.geometry as GeoJSON.LineString).coordinates.map(xy);
      const x = (points[0]![0] + points[1]![0]) / 2;
      const z = (points[0]![1] + points[1]![1]) / 2;
      const side = z > 0 ? 1 : -1;
      group = 'Accessible entrance';
      box('glass', x, 1.5, z + side * 0.1, 2.4, 3, 0.2);
      box('white', x, 3.4, z + side * 2.3, 7, 0.3, 4.8);
      for (const dx of [-2.8, 2.8]) box('metal', x + dx, 1.7, z + side * 4, 0.16, 3.4, 0.16);
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
        for (const x of [r[0], r[2]]) box('line', x, y, (r[1] + r[3]) / 2, 0.07, 0.02, r[3] - r[1]);
        box('line', (r[0] + r[2]) / 2, y, r[1], r[2] - r[0], 0.02, 0.07);
        if (!low && archive.unit.features.indexOf(unit) % 3 === 0)
          car((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, y, 'white');
      }
    }
    let triangles = 0;
    for (const [name, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      if (!geometry) throw new Error(`Cannot merge ${name}`);
      const primitive = doc.createPrimitive().setMaterial(palette[materials.get(name)!]);
      for (const [attribute, semantic, type] of [
        ['position', 'POSITION', 'VEC3'],
        ['normal', 'NORMAL', 'VEC3'],
        ['uv', 'TEXCOORD_0', 'VEC2'],
      ] as const) {
        const data = geometry.getAttribute(attribute);
        const values = new Float32Array(data.array);
        if (attribute === 'uv' && materials.get(name) === 'paving')
          for (let i = 0; i < values.length; i++) values[i] = values[i]! * 24;
        primitive.setAttribute(
          semantic,
          doc.createAccessor().setType(type).setArray(values).setBuffer(buffer),
        );
      }
      triangles += geometry.getAttribute('position').count / 3;
      scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));
      geometry.dispose();
      for (const g of geometries) g.dispose();
    }
    scene.setExtras({
      origin,
      bearing: kind === 'museum' ? 156 : -24,
      metres: true,
      axes: 'X east, Y up, Z south',
      kind,
      quality: low ? 'low' : 'high',
      floorHeight,
    });
    const glb = await new NodeIO().writeBinary(doc);
    const filename = low ? 'scene-low.glb' : 'scene.glb';
    await writeFile(join(target, filename), glb);
    budgets[low ? 'low' : 'high'] = { triangles, meshes: batches.size, bytes: glb.byteLength };
  }
  await writeFile(join(target, 'site.geojson'), JSON.stringify(site));
  await writeFile(
    join(target, 'manifest.json'),
    `${JSON.stringify({ origin, bearing: kind === 'museum' ? 156 : -24, bounds: [ll(-halfX, halfZ), ll(halfX, -halfZ)], floorHeight, counts: { buildings: archive.building.features.length, floors: archive.level.features.length, trees: trees.length, surfaces: Object.keys(COLORS).length }, budgets }, null, 2)}\n`,
  );
}
