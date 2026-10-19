import { levelFilter, type PluginContext } from '@indoorkit/core';
import type { Feature, FeatureCollection } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import type { FloorApi } from './floor';

interface GeoJsonSourceLike {
  setData(data: FeatureCollection): void;
}

type OverlayLayer = Omit<LayerSpecification, 'source' | 'filter'> & { type: LayerSpecification['type'] };

/**
 * 插件自己的 GeoJSON 图层：登记 source 和图层，随楼层切换过滤，提供 setData。
 * 要素需要带 level_id 属性。
 */
export function floorOverlay(ctx: PluginContext, sourceId: string, layers: OverlayLayer[]) {
  const floor = ctx.get<FloorApi>('floor');
  const filter = () => levelFilter(floor.current().id);
  ctx.trackSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const layer of layers) {
    ctx.trackLayer({ ...layer, source: sourceId, filter: filter() } as LayerSpecification);
  }
  ctx.on('floor:change', () => {
    for (const layer of layers) ctx.map.setFilter(layer.id, filter());
  });
  return {
    floor,
    setData(features: Feature[]) {
      (ctx.map.getSource(sourceId) as GeoJsonSourceLike).setData({ type: 'FeatureCollection', features });
    },
  };
}

const M_PER_LAT = 110_540;

/** 以 origin 为原点的局部平面坐标（米），小范围内足够精确 */
export function localProjection([lng0, lat0]: [number, number]) {
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  return {
    toMeters: ([lng, lat]: [number, number]): [number, number] => [
      (lng - lng0) * mPerLng,
      (lat - lat0) * M_PER_LAT,
    ],
    toLngLat: ([x, y]: [number, number]): [number, number] => [lng0 + x / mPerLng, lat0 + y / M_PER_LAT],
  };
}

/** 两点距离（米），以第一个点的纬度换算经度 */
export function distanceMeters(a: [number, number], b: [number, number]): number {
  const { toMeters } = localProjection(a);
  const [x, y] = toMeters(b);
  return Math.hypot(x, y);
}
