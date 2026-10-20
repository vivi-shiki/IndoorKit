import type { Feature, FeatureCollection, Point } from 'geojson';
import type {
  FilterSpecification,
  LayerSpecification,
  Map as MapLibreMap,
  SourceSpecification,
} from 'maplibre-gl';
import type { IndoorMap } from './create-indoor-map';
import type {
  AnyPlugin,
  MapFactory,
  MapFactoryOptions,
  MapLike,
  MapListener,
  RenderedFeature,
} from './types';

/** 不依赖 WebGL 的 MapLike 实现，用于单元测试 */
export class FakeMap implements MapLike {
  removed = false;
  onRemove?: () => void;
  #sources = new Map<string, { spec: SourceSpecification; data: unknown }>();
  #layers = new Map<string, LayerSpecification>();
  #filters = new Map<string, FilterSpecification | null>();
  #listeners = new Map<string, Set<MapListener>>();
  /** 底图样式里的图层（如 background）不计入 layerIds()，只记录 paint */
  #basePaint = new Map<string, Record<string, unknown>>();
  #offset = { x: 0, y: 0 };
  #container?: HTMLElement;
  /** setData 之后还没加载完的 source */
  #loading = new Set<string>();
  #updates = new Map<string, number>();
  /**
   * 默认 setData 立即加载完并触发 sourcedata。设为 true 时 source 保持加载中，
   * 直到 finishSourceLoad，用来模拟真实地图在 Worker 里重新切瓦片的那段时间。
   */
  holdSourceLoads = false;
  /** 相机调用记录 */
  cameraCalls: { method: 'easeTo' | 'fitBounds'; bounds?: unknown; options: unknown }[] = [];
  /** triggerRepaint 被调用的次数 */
  repaints = 0;
  #zoom: number;
  #pitch: number;
  #bearing: number;

  constructor(
    baseLayers: LayerSpecification[] = [],
    view: { zoom?: number; pitch?: number; bearing?: number } = {},
  ) {
    this.#zoom = view.zoom ?? 18;
    this.#pitch = view.pitch ?? 0;
    this.#bearing = view.bearing ?? 0;
    for (const layer of baseLayers) {
      this.#basePaint.set(layer.id, { ...('paint' in layer ? layer.paint : {}) });
    }
    // 与真实地图一样异步触发 load
    setTimeout(() => this.fire('load'), 0);
  }

  addSource(id: string, spec: SourceSpecification) {
    if (this.#sources.has(id)) throw new Error(`source "${id}" already exists`);
    const data = 'data' in spec ? spec.data : undefined;
    this.#sources.set(id, { spec, data });
  }
  getSource(id: string) {
    const entry = this.#sources.get(id);
    if (!entry) return undefined;
    return {
      setData: (data: unknown) => {
        entry.data = data;
        this.#updates.set(id, (this.#updates.get(id) ?? 0) + 1);
        if (this.holdSourceLoads) this.#loading.add(id);
        else this.fire('sourcedata', { type: 'sourcedata', sourceId: id });
      },
    };
  }
  isSourceLoaded(id: string) {
    if (!this.#sources.has(id)) throw new Error(`source "${id}" does not exist`);
    return !this.#loading.has(id);
  }
  /** 结束一次被 holdSourceLoads 挂起的加载 */
  finishSourceLoad(id: string) {
    if (!this.#loading.delete(id)) throw new Error(`source "${id}" is not loading`);
    this.fire('sourcedata', { type: 'sourcedata', sourceId: id });
  }
  /** source 收到过几次 setData */
  sourceUpdates(id: string) {
    return this.#updates.get(id) ?? 0;
  }
  getSourceData(id: string) {
    return this.#sources.get(id)?.data;
  }
  removeSource(id: string) {
    for (const layer of this.#layers.values()) {
      if ('source' in layer && layer.source === id)
        throw new Error(`source "${id}" is used by "${layer.id}"`);
    }
    this.#sources.delete(id);
  }
  addLayer(layer: LayerSpecification) {
    if (this.#layers.has(layer.id)) throw new Error(`layer "${layer.id}" already exists`);
    if ('source' in layer && !this.#sources.has(layer.source as string)) {
      throw new Error(`layer "${layer.id}" uses missing source`);
    }
    this.#layers.set(layer.id, layer);
    if ('filter' in layer && layer.filter) this.#filters.set(layer.id, layer.filter);
  }
  getLayer(id: string) {
    return this.#layers.get(id);
  }
  removeLayer(id: string) {
    this.#layers.delete(id);
    this.#filters.delete(id);
  }
  setFilter(id: string, filter: FilterSpecification | null) {
    if (!this.#layers.has(id)) throw new Error(`layer "${id}" does not exist`);
    this.#filters.set(id, filter);
  }
  setLayoutProperty(id: string, name: string, value: unknown) {
    const layer = this.#layers.get(id);
    if (!layer) throw new Error(`layer "${id}" does not exist`);
    (layer as { layout?: Record<string, unknown> }).layout = {
      ...(layer as { layout?: Record<string, unknown> }).layout,
      [name]: value,
    };
  }
  getLayoutProperty(id: string, name: string) {
    return (this.#layers.get(id) as { layout?: Record<string, unknown> } | undefined)?.layout?.[name];
  }
  setPaintProperty(id: string, name: string, value: unknown) {
    const base = this.#basePaint.get(id);
    if (base) {
      base[name] = value;
      return;
    }
    const layer = this.#layers.get(id) as { paint?: Record<string, unknown> } | undefined;
    if (!layer) throw new Error(`layer "${id}" does not exist`);
    layer.paint = { ...layer.paint, [name]: value };
  }
  getPaintProperty(id: string, name: string) {
    const base = this.#basePaint.get(id);
    if (base) return base[name];
    return (this.#layers.get(id) as { paint?: Record<string, unknown> } | undefined)?.paint?.[name];
  }
  /** 简单的线性投影：1e5 像素/度，加上可调偏移，用来模拟地图平移 */
  project([lng, lat]: [number, number]) {
    return { x: lng * 1e5 + this.#offset.x, y: -lat * 1e5 + this.#offset.y };
  }
  setProjectionOffset(x: number, y: number) {
    this.#offset = { x, y };
  }
  /**
   * 点要素按 project 投影后落在 geometry 范围内的算命中；隐藏（visibility none）的图层不返回。
   * 与真实地图一样不看图层的 minzoom / maxzoom。
   */
  queryRenderedFeatures(
    geometry: [[number, number], [number, number]] | undefined,
    options: { layers: string[] },
  ): RenderedFeature[] {
    const out: RenderedFeature[] = [];
    for (const id of options.layers) {
      const layer = this.#layers.get(id);
      if (!layer) throw new Error(`layer "${id}" does not exist`);
      if (this.getLayoutProperty(id, 'visibility') === 'none' || !('source' in layer)) continue;
      const data = this.#sources.get(layer.source as string)?.data as FeatureCollection | undefined;
      for (const f of (data?.features ?? []) as Feature[]) {
        if (f.geometry.type !== 'Point') continue;
        const { x, y } = this.project((f.geometry as Point).coordinates as [number, number]);
        if (geometry) {
          const [[x0, y0], [x1, y1]] = geometry;
          if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        }
        out.push({ geometry: f.geometry, properties: { ...f.properties }, layer: { id } });
      }
    }
    return out;
  }
  easeTo(options: { center: [number, number]; duration: number }) {
    this.cameraCalls.push({ method: 'easeTo', options });
  }
  fitBounds(bounds: [[number, number], [number, number]], options: unknown) {
    this.cameraCalls.push({ method: 'fitBounds', bounds, options });
  }
  getZoom() {
    return this.#zoom;
  }
  setZoom(zoom: number) {
    this.#zoom = zoom;
  }
  getPitch() {
    return this.#pitch;
  }
  getBearing() {
    return this.#bearing;
  }
  triggerRepaint() {
    this.repaints++;
  }
  getContainer() {
    this.#container ??= document.createElement('div');
    return this.#container;
  }
  getFilter(id: string) {
    return this.#filters.get(id);
  }
  on(type: string, listener: MapListener) {
    let set = this.#listeners.get(type);
    if (!set) {
      set = new Set();
      this.#listeners.set(type, set);
    }
    set.add(listener);
  }
  off(type: string, listener: MapListener) {
    this.#listeners.get(type)?.delete(listener);
  }
  once(type: string, listener: MapListener) {
    const wrapped: MapListener = (...args) => {
      this.off(type, wrapped);
      listener(...args);
    };
    this.on(type, wrapped);
  }
  fire(type: string, event: unknown = { type }) {
    for (const l of [...(this.#listeners.get(type) ?? [])]) l(event);
  }
  listenerCount(type: string) {
    return this.#listeners.get(type)?.size ?? 0;
  }
  layerIds() {
    return [...this.#layers.keys()];
  }
  sourceIds() {
    return [...this.#sources.keys()];
  }
  remove() {
    this.removed = true;
    this.onRemove?.();
  }
}

export function fakeMapFactory(onCreate?: (map: FakeMap, options: MapFactoryOptions) => void): MapFactory {
  return (options) => {
    const map = new FakeMap(options.style.layers, options);
    onCreate?.(map, options);
    return map;
  };
}

/**
 * 测试钩子用的只读视图：直接读真实 MapLibre 地图的样式和画出的要素。
 * 只给测试工具用，业务代码通过 SDK 的公开接口操作地图。
 */
export function inspect(indoor: IndoorMap<readonly AnyPlugin[]>) {
  const map = indoor.map as unknown as MapLibreMap;
  // queryRenderedFeatures 不看图层的 minzoom / maxzoom：刚缩放时还会返回保留着的其他级别瓦片里的要素，
  // 而绘制时会跳过当前缩放下隐藏的图层，所以这里按绘制的规则先判断一次
  const rendered = (layerId: string) =>
    map.getLayer(layerId)!.isHidden(map.getZoom()) ? [] : map.queryRenderedFeatures({ layers: [layerId] });
  return {
    rendered,
    styleLayerIds: () => map.getStyle().layers.map((layer) => layer.id),
    paint: (layerId: string, name: string) => map.getPaintProperty(layerId, name as never) as unknown,
    layout: (layerId: string, name: string) => map.getLayoutProperty(layerId, name as never) as unknown,
    zoom: () => map.getZoom(),
    setZoom(zoom: number) {
      map.jumpTo({ zoom });
    },
    container: () => map.getContainer(),
  };
}
