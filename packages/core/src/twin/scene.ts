import type { VenueModel } from '@indoorkit/imdf';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import {
  Box3,
  BoxGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  type Texture,
  Vector3,
} from 'three';
import type { Theme } from '../style';
import { buildFloors, localMetres } from './floors';
import {
  type CutState,
  focusStyle,
  STATUS_COLORS,
  type StatusPaint,
  type TwinStatus,
  type TwinView,
} from './policy';

/** Building-owned geometry is separate from the terrain and instanced landscape props. */
export function campusEnvelopes(model: Object3D): Object3D[] {
  const parts: Object3D[] = [];
  model.traverse((node) => {
    if ((node.userData.buildingId && node.userData.height > 0) || node.userData.indoorHidden)
      parts.push(node);
    if (typeof node.userData.indoorKeepMaterial === 'string')
      node.traverse((part) => {
        if (
          part instanceof Mesh &&
          [part.material]
            .flat()
            .every((material: Material) => material.name !== node.userData.indoorKeepMaterial)
        )
          parts.push(part);
      });
  });
  return parts;
}

/** Keep the campus in place while exchanging the venue envelope for its indoor map. */
export function applyCampusView(model: Object3D, view: TwinView) {
  for (const node of campusEnvelopes(model)) node.visible = view === 'outdoor';
  // Elevated instances can belong to the envelope while the ground instances stay in place.
  for (const node of model.children) {
    const above = node.userData.indoorHideAbove as number | undefined;
    if (above === undefined) continue;
    node.traverse((part) => {
      if (!(part instanceof InstancedMesh)) return;
      part.userData.twinExteriorMatrices ??= part.instanceMatrix.array.slice();
      const original = part.userData.twinExteriorMatrices as Float32Array;
      const matrix = new Matrix4();
      for (let i = 0; i < part.count; i++) {
        if (original[i * 16 + 13]! <= above) continue;
        matrix.fromArray(original, i * 16);
        if (view === 'indoor') matrix.scale(new Vector3(0, 0, 0));
        part.setMatrixAt(i, matrix);
      }
      part.instanceMatrix.needsUpdate = true;
    });
  }
}

/** 释放一棵对象树里的几何、材质和贴图 */
export function disposeTree(root: Object3D, extra: Iterable<Material> = []) {
  const materials = new Set<Material>(extra);
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof LineSegments)) return;
    object.geometry.dispose();
    for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value && typeof value === 'object' && 'isTexture' in value) textures.add(value as Texture);
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
  }
  root.removeFromParent();
}

export interface PreparedBuilding {
  id: string;
  node: Object3D;
  /** 本地米制坐标里的包围盒，聚焦前计算 */
  box: Box3;
  materials: MeshStandardMaterial[];
}

/**
 * 加载后的外观模型：每栋楼的材质单独复制一份，聚焦时只改这栋楼；
 * 玻璃和灯头材质记下来，夜间发光。
 */
export function prepareModel(model: Object3D) {
  const shared = new Set<Material>();
  const buildings: PreparedBuilding[] = [];
  const glow: MeshStandardMaterial[] = [];
  let meshes = 0;
  let triangles = 0;
  model.updateMatrixWorld(true);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    meshes++;
    const count = object.geometry.index?.count ?? object.geometry.attributes.position!.count;
    triangles += (count / 3) * ((object as Mesh & { count?: number }).count ?? 1);
  });
  for (const node of model.children) {
    const id = node.userData.buildingId as string | undefined;
    if (!id) continue;
    const clones = new Map<Material, MeshStandardMaterial>();
    node.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const original = object.material as MeshStandardMaterial;
      shared.add(original);
      let clone = clones.get(original);
      if (!clone) {
        clone = original.clone();
        clones.set(original, clone);
      }
      object.material = clone;
    });
    buildings.push({ id, node, box: new Box3().setFromObject(node), materials: [...clones.values()] });
  }
  // 楼里不再用的原材质也要释放，交给 disposeTree 的 extra
  const unused = [...shared];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = object.material as MeshStandardMaterial;
    if (material.name === 'glass' || material.name === 'lamp') glow.push(material);
  });
  return { buildings, glow, unused, meshes, triangles: Math.round(triangles) };
}

/** 聚焦：其他楼压矮、变淡 */
export function applyFocus(buildings: readonly PreparedBuilding[], focused: string | null) {
  for (const b of buildings) {
    const style = focusStyle(focused, b.id);
    b.node.scale.y = style.scaleY;
    for (const m of b.materials) {
      m.transparent = style.opacity < 1;
      m.opacity = style.opacity;
      m.depthWrite = style.opacity === 1;
    }
  }
}

/** 夜间：玻璃透出暖光，路灯点亮 */
export function applyNight(glow: readonly MeshStandardMaterial[], night: boolean) {
  for (const m of glow) {
    m.emissive = new Color(m.name === 'lamp' ? '#ffd9a0' : '#ffcf8a');
    m.emissiveIntensity = night ? (m.name === 'lamp' ? 3 : 0.55) : 0;
  }
}

/** 建筑描边：外墙和屋顶的硬边 */
export function buildOutlines(buildings: readonly PreparedBuilding[], dark: boolean) {
  const material = new LineBasicMaterial({
    color: dark ? '#9fb3c8' : '#33404d',
    transparent: true,
    opacity: 0.55,
  });
  const edged: Mesh[] = [];
  for (const b of buildings)
    b.node.traverse((object) => {
      if (object instanceof Mesh && /\/(Shell|Roof)$/.test(object.name || object.parent?.name || ''))
        edged.push(object);
    });
  const lines = edged.map((mesh) => {
    const line = new LineSegments(new EdgesGeometry(mesh.geometry, 30), material);
    mesh.add(line);
    return line;
  });
  return {
    dispose() {
      for (const line of lines) {
        line.geometry.dispose();
        line.removeFromParent();
      }
      material.dispose();
    },
  };
}

export interface FloorStack {
  group: Group;
  /** 每层的网格和材质，剖切时按状态改 */
  levels: Map<
    string,
    { ordinal: number; elevation: number; meshes: Mesh[]; materials: MeshStandardMaterial[] }
  >;
}

/** 室内楼层：由 IMDF 生成的地面和墙，颜色来自主题 */
export function buildFloorStack(
  venue: VenueModel,
  origin: [number, number],
  floorHeight: number,
  theme: Theme,
): FloorStack {
  const group = new Group();
  group.name = 'Floors';
  const levels: FloorStack['levels'] = new Map();
  for (const [id, floor] of buildFloors(venue, { origin, floorHeight, wallHeight: theme.wallHeight })) {
    const meshes: Mesh[] = [];
    const materials: MeshStandardMaterial[] = [];
    const add = (geometry: Mesh['geometry'], category: string) => {
      const material = new MeshStandardMaterial({ roughness: 0.85 });
      material.userData.category = category;
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true;
      meshes.push(mesh);
      materials.push(material);
      group.add(mesh);
    };
    for (const [category, geometry] of floor.units) add(geometry, category);
    if (floor.walls) add(floor.walls, 'wall');
    levels.set(id, { ordinal: floor.ordinal, elevation: floor.elevation, meshes, materials });
  }
  const stack = { group, levels };
  recolourFloors(stack, theme);
  return stack;
}

/**
 * 剖切：选中楼层以上隐藏，本层交给 MapLibre 画（实体），以下半透明。
 * 整组下移到本层贴地，下面的楼层落在地面以下。
 */
export function applyCut(stack: FloorStack, cut: Record<number, CutState>, current: string | null) {
  const base = current ? (stack.levels.get(current)?.elevation ?? 0) : 0;
  stack.group.position.y = -base - 0.12;
  for (const level of stack.levels.values()) {
    const state = cut[level.ordinal] ?? 'hidden';
    // 本层由 MapLibre 画（标注、点选都在那边）；Three.js 再画一份会和它及园区地面挤在同一深度，手机上闪烁
    for (const mesh of level.meshes) mesh.visible = state === 'ghost';
    for (const m of level.materials) {
      m.transparent = state === 'ghost';
      m.opacity = state === 'ghost' ? 0.28 : 1;
      m.depthWrite = state !== 'ghost';
    }
  }
}

export function recolourFloors(stack: FloorStack, theme: Theme) {
  for (const level of stack.levels.values())
    for (const m of level.materials) {
      const category = m.userData.category as string;
      m.color.set(category === 'wall' ? theme.wall : (theme.unitColors[category] ?? theme.defaultUnitColor));
    }
}

type Ring = Position[];
const ringsOf = (g: Polygon | MultiPolygon): Ring[] =>
  g.type === 'Polygon' ? [g.coordinates[0]!] : g.coordinates.map((p) => p[0]!);

/** 一组坐标在本地米制坐标里的水平范围 */
function extent(rings: Ring[], toLocal: ReturnType<typeof localMetres>) {
  const box = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const ring of rings)
    for (const p of ring) {
      const [x, z] = toLocal(p);
      box.minX = Math.min(box.minX, x);
      box.maxX = Math.max(box.maxX, x);
      box.minZ = Math.min(box.minZ, z);
      box.maxZ = Math.max(box.maxZ, z);
    }
  return box;
}

/**
 * 状态着色：整层是一圈贴在立面上的发光色带，房间是插在屋顶上方的标记。
 * 返回的组由调用方挂到场景里，换数据时整组释放。
 */
export function buildStatusMarkers(
  venue: VenueModel,
  origin: [number, number],
  floorHeight: number,
  heights: Map<string, number>,
  items: readonly StatusPaint[],
) {
  const toLocal = localMetres(origin);
  const group = new Group();
  group.name = 'Status';
  const materials = new Map<TwinStatus, MeshStandardMaterial>();
  const material = (status: TwinStatus) => {
    let m = materials.get(status);
    if (!m) {
      m = new MeshStandardMaterial({
        color: STATUS_COLORS[status],
        emissive: STATUS_COLORS[status],
        emissiveIntensity: 0.6,
        transparent: true,
        opacity: 0.85,
      });
      materials.set(status, m);
    }
    return m;
  };
  for (const item of items) {
    const level = venue.levels.find((l) => l.id === item.levelId);
    if (!level) throw new Error(`status paint: unknown level ${item.levelId}`);
    if (item.unitId) {
      // 状态也可能落在 fixture 上（比如房间里的设施）
      const unit = [...venue.features.units.features, ...venue.features.fixtures.features].find(
        (u) => u.properties.id === item.unitId,
      );
      if (!unit) throw new Error(`status paint: unknown unit ${item.unitId}`);
      const box = extent(ringsOf(unit.geometry), toLocal);
      const top = Math.max(0, ...level.buildingIds.map((id) => heights.get(id) ?? 0)) + 2;
      const pin = new Group();
      pin.position.set((box.minX + box.maxX) / 2, top, (box.minZ + box.maxZ) / 2);
      const stem = new Mesh(new CylinderGeometry(0.12, 0.12, 4), material(item.status));
      stem.position.y = 2;
      const head = new Mesh(new SphereGeometry(1.1, 16, 12), material(item.status));
      head.position.y = 5;
      pin.add(stem, head);
      group.add(pin);
      continue;
    }
    const outline = venue.features.levels.features.find((f) => f.properties.level_id === item.levelId);
    if (!outline) throw new Error(`status paint: level ${item.levelId} has no outline`);
    const box = extent(ringsOf(outline.geometry), toLocal);
    const y = Math.max(0, level.ordinal) * floorHeight + floorHeight - 0.45;
    // 四条色带围住这一层，略凸出立面
    const w = box.maxX - box.minX + 1;
    const d = box.maxZ - box.minZ + 1;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    for (const [x, z, sx, sz] of [
      [cx, box.minZ - 0.5, w, 0.2],
      [cx, box.maxZ + 0.5, w, 0.2],
      [box.minX - 0.5, cz, 0.2, d],
      [box.maxX + 0.5, cz, 0.2, d],
    ] as const) {
      const band = new Mesh(new BoxGeometry(sx, 0.35, sz), material(item.status));
      band.position.set(x, y, z);
      group.add(band);
    }
  }
  return group;
}
