import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';

describe('committed editable campuses', () => {
  for (const name of ['hospital', 'parking', 'museum']) {
    it(`${name} exports self-contained metre-scale glTF with a bounded low-quality version`, async () => {
      const root = resolve(import.meta.dirname, '../../../apps/playground/public/models', name);
      const manifest = JSON.parse(await readFile(`${root}/manifest.json`, 'utf8'));
      for (const quality of ['high', 'low']) {
        const bytes = await readFile(`${root}/${quality === 'low' ? 'scene-low' : 'scene'}.glb`);
        expect(bytes.subarray(0, 4).toString()).toBe('glTF');
        expect(bytes.length).toBeLessThan(7_000_000);
        const doc = await new NodeIO().readBinary(bytes);
        const scene = doc.getRoot().listScenes()[0]!;
        expect(scene.getExtras()).toMatchObject({ metres: true, kind: name, quality });
        expect(scene.listChildren().some((n) => n.getName().includes('Building'))).toBe(true);
        expect(scene.listChildren().some((n) => n.getName().includes('Water garden'))).toBe(true);
        expect(
          doc
            .getRoot()
            .listTextures()
            .every((t) => t.getImage()!.byteLength > 0),
        ).toBe(true);
        expect(manifest.budgets[quality].triangles).toBeLessThan(30_000);
        expect(manifest.budgets[quality].meshes).toBeLessThan(110);
      }
      expect(manifest.budgets.low.triangles).toBeLessThan(manifest.budgets.high.triangles);
    });
  }
});
