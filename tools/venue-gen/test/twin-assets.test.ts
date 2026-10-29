import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Document, type Node, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { describe, expect, it } from 'vitest';

const MODELS = resolve(import.meta.dirname, '../../../apps/playground/public/models');
const CC0 = resolve(import.meta.dirname, '../assets/cc0');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

interface Manifest {
  origin: [number, number];
  bounds: [[number, number], [number, number]];
  ground: [[number, number], [number, number]];
  floorHeight: number;
  buildings: { id: string; node: string; center: [number, number]; height: number }[];
  budgets: Record<'high' | 'low', { triangles: number; meshes: number; bytes: number; instances: number }>;
}

const read = async (name: string) => {
  const root = `${MODELS}/${name}`;
  const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8')) as Manifest;
  const site = JSON.parse(await readFile(`${root}/site.geojson`, 'utf8')) as GeoJSON.FeatureCollection;
  const docs = {
    high: await io.readBinary(await readFile(`${root}/scene.glb`)),
    low: await io.readBinary(await readFile(`${root}/scene-low.glb`)),
  };
  return { root, manifest, site, docs };
};

const nodes = (doc: Document) => doc.getRoot().listNodes();
const named = (doc: Document, name: string) => nodes(doc).filter((n) => n.getName().startsWith(name));
const instances = (node: Node) =>
  // biome-ignore lint/suspicious/noExplicitAny: 扩展属性没有公开类型
  ((node.getExtension('EXT_mesh_gpu_instancing') as any)?.getAttribute('TRANSLATION')?.getCount() as
    | number
    | undefined) ?? 0;
const instanceCount = (doc: Document) => nodes(doc).reduce((sum, n) => sum + instances(n), 0);

/** 节点在场景中的水平包围盒（米，+X 东，+Z 南） */
function boxOf(doc: Document, node: Node) {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  node.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    const m = n.getWorldMatrix();
    // 实例化的道具只看摆放位置
    // biome-ignore lint/suspicious/noExplicitAny: 扩展属性没有公开类型
    const placed = (n.getExtension('EXT_mesh_gpu_instancing') as any)?.getAttribute('TRANSLATION');
    const points: number[][] = [];
    if (placed) for (let i = 0; i < placed.getCount(); i++) points.push(placed.getElement(i, [0, 0, 0]));
    else
      for (const p of mesh.listPrimitives()) {
        const pos = p.getAttribute('POSITION')!;
        for (let i = 0; i < pos.getCount(); i++) points.push(pos.getElement(i, [0, 0, 0]));
      }
    for (const [x, y, z] of points) {
      const wx = m[0] * x! + m[4] * y! + m[8] * z! + m[12];
      const wz = m[2] * x! + m[6] * y! + m[10] * z! + m[14];
      box.minX = Math.min(box.minX, wx);
      box.maxX = Math.max(box.maxX, wx);
      box.minZ = Math.min(box.minZ, wz);
      box.maxZ = Math.max(box.maxZ, wz);
    }
  });
  void doc;
  return box;
}

describe('vendored CC0 props', () => {
  it('match their recorded checksums and are credited', async () => {
    const sources = JSON.parse(await readFile(`${CC0}/sources.json`, 'utf8')) as {
      file: string;
      sha256: string;
      licence: string;
      pack: string;
    }[];
    expect(sources.length).toBeGreaterThanOrEqual(8);
    const notices = await readFile(resolve(import.meta.dirname, '../../../THIRD_PARTY_NOTICES.md'), 'utf8');
    for (const s of sources) {
      const bytes = await readFile(`${CC0}/${s.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(s.sha256);
      expect(s.licence).toBe('CC0-1.0');
      expect(notices).toContain(s.pack);
    }
  });
});

describe('committed editable campuses', () => {
  for (const name of ['hospital', 'parking', 'museum']) {
    describe(name, () => {
      it('stays within the download budget and keeps a lighter low-quality file', async () => {
        const { root, manifest, docs } = await read(name);
        const high = await readFile(`${root}/scene.glb`);
        const low = await readFile(`${root}/scene-low.glb`);
        expect(high.subarray(0, 4).toString()).toBe('glTF');
        expect(high.length).toBeLessThanOrEqual(4_000_000);
        expect(low.length).toBeLessThanOrEqual(1_500_000);
        expect(manifest.budgets.high.bytes).toBe(high.length);
        expect(manifest.budgets.low.triangles).toBeLessThan(manifest.budgets.high.triangles);
        for (const quality of ['high', 'low'] as const) {
          const scene = docs[quality].getRoot().listScenes()[0]!;
          expect(scene.getExtras()).toMatchObject({ metres: true, kind: name, quality });
          expect(manifest.budgets[quality].meshes).toBeLessThan(140);
          expect(manifest.budgets[quality].triangles).toBeLessThan(120_000);
        }
      });

      it('places CC0 trees and vehicles as GPU instances, about half as many in the low file', async () => {
        const { manifest, docs } = await read(name);
        for (const group of ['Trees', 'Vehicles']) {
          expect(named(docs.high, group).some((n) => n.listChildren().some((c) => instances(c) > 0))).toBe(
            true,
          );
        }
        const high = instanceCount(docs.high);
        const low = instanceCount(docs.low);
        expect(manifest.budgets.high.instances).toBe(high);
        expect(low).toBeGreaterThan(high * 0.35);
        expect(low).toBeLessThan(high * 0.65);
        expect(
          docs.high
            .getRoot()
            .listExtensionsUsed()
            .map((e) => e.extensionName),
        ).toContain('EXT_mesh_gpu_instancing');
      });

      it('gives every building windows on all four facades and baked ambient occlusion', async () => {
        const { manifest, docs } = await read(name);
        expect(manifest.buildings.length).toBeGreaterThan(0);
        for (const b of manifest.buildings) {
          const node = nodes(docs.high).find((n) => n.getName() === b.node)!;
          expect(node, b.node).toBeDefined();
          const facades = node.getExtras().facades as Record<string, number> | undefined;
          if (b.height > 0 && facades) {
            for (const side of ['north', 'south', 'east', 'west'])
              expect(facades[side], `${b.node} ${side}`).toBeGreaterThan(0);
          }
          const shell = node.listChildren().find((c) => c.getName().endsWith('Shell'));
          if (!shell) continue;
          const colors = shell
            .getMesh()!
            .listPrimitives()
            .map((p) => p.getAttribute('COLOR_0'));
          expect(colors.every(Boolean), `${b.node} AO`).toBe(true);
          const shades = new Set<number>();
          for (const c of colors)
            for (let i = 0; i < c!.getCount(); i++)
              shades.add(Math.round(c!.getElement(i, [0, 0, 0, 0])[0]! * 20));
          expect(shades.size, `${b.node} AO gradient`).toBeGreaterThan(2);
        }
      });

      it('surrounds the campus with ground, sidewalks, crossings and a context neighbourhood', async () => {
        const { manifest, site, docs } = await read(name);
        const surfaces = new Set(site.features.map((f) => f.properties!.surface));
        for (const s of ['ground', 'sidewalk', 'crossing', 'grass', 'road']) expect(surfaces).toContain(s);
        const span = (b: [[number, number], [number, number]]) => (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]);
        expect(span(manifest.ground)).toBeGreaterThan(span(manifest.bounds) * 4);
        const context = named(docs.high, 'Context')[0]!;
        expect(context).toBeDefined();
        const box = boxOf(docs.high, context);
        const site0 = boxOf(docs.high, named(docs.high, 'Site')[0]!);
        // 周边建筑在场地之外
        expect(
          box.minX < site0.minX || box.maxX > site0.maxX || box.minZ < site0.minZ || box.maxZ > site0.maxZ,
        ).toBe(true);
      });

      it('lists its buildings in the manifest so labels and focus can find them', async () => {
        const { manifest } = await read(name);
        for (const b of manifest.buildings) {
          expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
          expect(b.center.every(Number.isFinite)).toBe(true);
          expect(b.center[0]).toBeGreaterThan(manifest.bounds[0][0]);
          expect(b.center[0]).toBeLessThan(manifest.bounds[1][0]);
        }
      });
    });
  }

  it('keeps the museum water garden clear of the building', async () => {
    const { docs, manifest } = await read('museum');
    const pond = boxOf(docs.high, named(docs.high, 'Water garden')[0]!);
    for (const b of manifest.buildings) {
      const box = boxOf(docs.high, nodes(docs.high).find((n) => n.getName() === b.node)!);
      const overlap =
        pond.minX < box.maxX && pond.maxX > box.minX && pond.minZ < box.maxZ && pond.maxZ > box.minZ;
      expect(overlap, b.node).toBe(false);
    }
  });
});
