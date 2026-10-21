import type { LabelMap, VenueModel } from '@indoorkit/imdf';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import Flatbush from 'flatbush';
import type { MultiPolygon, Polygon } from 'geojson';

export interface UnitInfo {
  id: string;
  levelId: string;
  category: string;
  name: LabelMap;
  /** 外包矩形的中心 */
  center: [number, number];
  geometry: Polygon | MultiPolygon;
}

export interface Location {
  unitId: string;
}

export interface VenueIndex {
  /** 坐标所在的区块（嵌套时取最里层的）；不在任何区块内时为 null */
  locate(levelId: string, coord: [number, number]): Location | null;
  unit(id: string): UnitInfo;
}

/** 区块的空间索引：每层一个 Flatbush 筛候选，再做点在多边形内判断 */
export function createVenueIndex(venue: VenueModel): VenueIndex {
  const units = new Map<string, UnitInfo>();
  const byLevel = new Map<string, UnitInfo[]>();
  const boxes = new Map<string, [number, number, number, number]>();
  for (const f of venue.features.units.features) {
    const p = f.properties;
    const name: LabelMap = {};
    for (const [key, value] of Object.entries(p)) {
      if (key.startsWith('label_')) name[key.slice(6)] = value as string;
    }
    const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const xs = rings.flatMap((r) => r[0]!.map((c) => c[0]!));
    const ys = rings.flatMap((r) => r[0]!.map((c) => c[1]!));
    const box: [number, number, number, number] = [
      Math.min(...xs),
      Math.min(...ys),
      Math.max(...xs),
      Math.max(...ys),
    ];
    const info: UnitInfo = {
      id: p.id,
      levelId: p.level_id,
      category: p.category,
      name,
      center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
      geometry: f.geometry,
    };
    units.set(info.id, info);
    boxes.set(info.id, box);
    byLevel.set(info.levelId, [...(byLevel.get(info.levelId) ?? []), info]);
  }
  const indexes = new Map<string, { index: Flatbush; units: UnitInfo[] }>();
  for (const [levelId, list] of byLevel) {
    const index = new Flatbush(list.length);
    for (const u of list) index.add(...boxes.get(u.id)!);
    index.finish();
    indexes.set(levelId, { index, units: list });
  }
  const unit = (id: string) => {
    const u = units.get(id);
    if (!u) throw new Error(`unknown unit "${id}"`);
    return u;
  };

  return {
    locate(levelId, coord) {
      const entry = indexes.get(levelId);
      if (!entry) return null;
      // 区块可以嵌套（房间里的小区块）：取外包矩形最小的那个，也就是最里层的
      let found: UnitInfo | null = null;
      let foundArea = Infinity;
      for (const i of entry.index.search(coord[0], coord[1], coord[0], coord[1])) {
        const u = entry.units[i]!;
        const [x0, y0, x1, y1] = boxes.get(u.id)!;
        const area = (x1 - x0) * (y1 - y0);
        if (area < foundArea && booleanPointInPolygon(coord, u.geometry)) {
          found = u;
          foundArea = area;
        }
      }
      return found && { unitId: found.id };
    },
    unit,
  };
}
