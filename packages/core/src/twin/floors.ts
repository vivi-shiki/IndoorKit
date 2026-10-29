import type { VenueModel } from '@indoorkit/imdf';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { type BufferGeometry, ExtrudeGeometry, Shape, ShapeGeometry, Vector2 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** 赤道周长（米），和 MapLibre 的 MercatorCoordinate 一致 */
const EARTH_CIRCUMFERENCE = 40_075_016.686;

const mercatorX = (lng: number) => (180 + lng) / 360;
const mercatorY = (lat: number) =>
  (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

/**
 * 经纬度 → 模型的本地米制坐标（+X 东，+Z 南），和 twin 图层的变换矩阵互逆。
 * 只用于场馆尺度，按原点纬度取一个比例。
 */
export function localMetres(origin: [number, number]) {
  const ox = mercatorX(origin[0]);
  const oy = mercatorY(origin[1]);
  const metres = EARTH_CIRCUMFERENCE * Math.cos((origin[1] * Math.PI) / 180);
  return (p: Position) => [(mercatorX(p[0]!) - ox) * metres, (mercatorY(p[1]!) - oy) * metres] as const;
}

export interface FloorGeometry {
  ordinal: number;
  /** 楼板顶面的高度（米） */
  elevation: number;
  /** 按类别合并的房间地面，颜色由主题决定 */
  units: Map<string, BufferGeometry>;
  walls: BufferGeometry | null;
}

/** 地面略高于楼板，避免和外观模型的楼板重叠闪烁 */
const FLOOR_LIFT = 0.06;

function shapesOf(geometry: Polygon | MultiPolygon, toLocal: ReturnType<typeof localMetres>): Shape[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.map(([outer, ...holes]) => {
    // Shape 在 XY 平面，Y 向北；旋转到水平面后 Y 变成 -Z
    const ring = (r: Position[]) => r.map((p) => new Vector2(toLocal(p)[0], -toLocal(p)[1]));
    const shape = new Shape(ring(outer!));
    shape.holes = holes.map((h) => new Shape(ring(h)));
    return shape;
  });
}

/** 把 XY 平面上的几何放平，Y 向上 */
function layFlat(geometry: BufferGeometry, elevation: number) {
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, elevation, 0);
  return geometry;
}

/** 由 IMDF 生成每层的地面和墙体，和外观模型共用坐标系 */
export function buildFloors(
  venue: VenueModel,
  options: { origin: [number, number]; floorHeight: number; wallHeight: number },
): Map<string, FloorGeometry> {
  const toLocal = localMetres(options.origin);
  const floors = new Map<string, FloorGeometry>();
  for (const level of venue.levels) {
    const elevation = level.ordinal * options.floorHeight;
    const byCategory = new Map<string, BufferGeometry[]>();
    for (const unit of venue.features.units.features) {
      if (unit.properties.level_id !== level.id) continue;
      const list = byCategory.get(unit.properties.category) ?? [];
      list.push(layFlat(new ShapeGeometry(shapesOf(unit.geometry, toLocal)), elevation + FLOOR_LIFT));
      byCategory.set(unit.properties.category, list);
    }
    const walls = venue.features.fixtures.features
      .filter((f) => f.properties.level_id === level.id && f.properties.category === 'wall')
      .map((f) =>
        layFlat(
          new ExtrudeGeometry(shapesOf(f.geometry, toLocal), {
            depth: options.wallHeight,
            bevelEnabled: false,
          }),
          elevation,
        ),
      );
    const units = new Map<string, BufferGeometry>();
    for (const [category, list] of byCategory) {
      units.set(category, mergeGeometries(list));
      for (const g of list) g.dispose();
    }
    const merged = walls.length > 0 ? mergeGeometries(walls) : null;
    for (const g of walls) g.dispose();
    floors.set(level.id, { ordinal: level.ordinal, elevation, units, walls: merged });
  }
  return floors;
}
