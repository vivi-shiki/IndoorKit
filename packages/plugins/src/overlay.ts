import type { PluginContext } from '@indoorkit/core';
import type { Feature, FeatureCollection } from 'geojson';
import type { LayerSpecification } from 'maplibre-gl';
import type { FloorApi } from './floor';

interface GeoJsonSourceLike {
  setData(data: FeatureCollection): void;
}

type OverlayLayer = Omit<LayerSpecification, 'source' | 'filter'> & { type: LayerSpecification['type'] };

/**
 * 插件自己的 GeoJSON 图层：登记 source 和图层，只显示当前楼层，提供 setData。
 * 要素需要带 level_id 属性。
 *
 * MapLibre 重新加载瓦片时，不会等待或取消同一瓦片正在进行的解析；两次解析交错后，
 * 瓦片会把一次的要素索引和另一次的数据配在一起，queryRenderedFeatures 随之抛出
 * "feature index out of bounds"。所以这个 source 只会因为自己的 setData 重新加载，
 * 而且同一时间只有一次在路上：
 * - 楼层在数据里过滤，不用图层过滤条件（改过滤条件也会让瓦片重新解析）；
 * - 上一次还没加载完时，新数据先存着，加载完再发最新的一份。
 */
export function floorOverlay(ctx: PluginContext, sourceId: string, layers: OverlayLayer[]) {
  const floor = ctx.get<FloorApi>('floor');
  ctx.trackSource(sourceId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const layer of layers) ctx.trackLayer({ ...layer, source: sourceId } as LayerSpecification);

  let all: Feature[] = [];
  let dirty = false;
  let loading = false;
  const send = () => {
    if (!dirty) return;
    const levelId = floor.current().id;
    dirty = false;
    loading = true;
    (ctx.map.getSource(sourceId) as GeoJsonSourceLike).setData({
      type: 'FeatureCollection',
      features: all.filter((f) => f.properties!.level_id === levelId),
    });
  };
  const update = () => {
    dirty = true;
    if (!loading) send();
  };
  ctx.onMap('sourcedata', (event) => {
    const { sourceId: id } = event as { sourceId?: string };
    if (id !== sourceId || !loading || !ctx.map.isSourceLoaded(sourceId)) return;
    loading = false;
    send();
  });
  ctx.on('floor:change', update);
  return {
    floor,
    setData(features: Feature[]) {
      all = features;
      update();
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
