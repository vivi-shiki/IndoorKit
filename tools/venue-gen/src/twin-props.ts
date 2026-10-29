import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Accessor, type Material, NodeIO, type Primitive, type TextureInfo } from '@gltf-transform/core';
import { ALL_EXTENSIONS, type Transform } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Matrix3, Matrix4, Vector2, Vector3 } from 'three';

/** CC0 道具的一个部件：已经展开节点变换和量化，单位为原模型单位，+Y 向上 */
export interface PropPart {
  /** 原材质名，生成器按它换成自己的材质 */
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array | null;
  indices: Uint32Array;
  /** 原贴图（只有车辆用 Kenney 的配色图集） */
  texture: { image: Uint8Array; mimeType: string } | null;
}

export interface Prop {
  name: string;
  parts: PropPart[];
  /** 包围盒，原模型单位 */
  min: Vector3;
  max: Vector3;
}

const floats = (accessor: Accessor, size: number) => {
  const out = new Float32Array(accessor.getCount() * size);
  const el: number[] = [];
  for (let i = 0; i < accessor.getCount(); i++) {
    accessor.getElement(i, el);
    for (let k = 0; k < size; k++) out[i * size + k] = el[k]!;
  }
  return out;
};

/** KHR_texture_transform 写在材质上；展开到 UV 里，输出模型不再依赖这个扩展 */
function applyTextureTransform(uvs: Float32Array, info: TextureInfo | null) {
  const t = info?.getExtension<Transform>('KHR_texture_transform');
  if (!t) return;
  const [ox, oy] = t.getOffset();
  const [sx, sy] = t.getScale();
  const r = t.getRotation();
  const v = new Vector2();
  for (let i = 0; i < uvs.length; i += 2) {
    v.set(uvs[i]! * sx, uvs[i + 1]! * sy).rotateAround(new Vector2(), -r);
    uvs[i] = v.x + ox;
    uvs[i + 1] = v.y + oy;
  }
}

function partOf(primitive: Primitive, world: Matrix4): PropPart {
  const position = primitive.getAttribute('POSITION')!;
  const normal = primitive.getAttribute('NORMAL');
  const uv = primitive.getAttribute('TEXCOORD_0');
  const positions = floats(position, 3);
  const normals = normal ? floats(normal, 3) : new Float32Array(positions.length);
  const v = new Vector3();
  const normalMatrix = new Matrix3().getNormalMatrix(world);
  for (let i = 0; i < positions.length; i += 3) {
    v.fromArray(positions, i).applyMatrix4(world).toArray(positions, i);
    v.fromArray(normals, i).applyMatrix3(normalMatrix).normalize().toArray(normals, i);
  }
  const material = primitive.getMaterial() as Material | null;
  const uvs = uv ? floats(uv, 2) : null;
  if (uvs) applyTextureTransform(uvs, material?.getBaseColorTextureInfo() ?? null);
  const texture = material?.getBaseColorTexture();
  const index = primitive.getIndices();
  return {
    material: material?.getName() ?? 'default',
    positions,
    normals,
    uvs,
    indices: index
      ? Uint32Array.from(index.getArray()!)
      : Uint32Array.from({ length: position.getCount() }, (_, i) => i),
    texture: texture ? { image: texture.getImage()!, mimeType: texture.getMimeType() } : null,
  };
}

/** 读入 assets/cc0 里的一个道具，解开 meshopt 压缩和量化 */
export async function loadProp(dir: string, name: string): Promise<Prop> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.readBinary(await readFile(join(dir, `${name}.glb`)));
  const parts: PropPart[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = new Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of mesh.listPrimitives()) parts.push(partOf(primitive, world));
  }
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i += 3) {
      v.fromArray(p.positions, i);
      min.min(v);
      max.max(v);
    }
  return { name, parts, min, max };
}
