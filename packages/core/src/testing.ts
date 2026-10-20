import type { FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { DataProvider, MapFactory, MapLike, MapListener, PositionBatch } from './types';

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

  constructor(baseLayers: LayerSpecification[] = []) {
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

export function fakeMapFactory(onCreate?: (map: FakeMap) => void): MapFactory {
  return (options) => {
    const map = new FakeMap(options.style.layers);
    onCreate?.(map);
    return map;
  };
}

/** 手动推送数据的 DataProvider，记录生命周期，便于测试 */
export function createManualProvider() {
  const listeners = new Set<(batch: PositionBatch) => void>();
  const state = { started: false, disposed: false };
  const provider: DataProvider & {
    readonly started: boolean;
    readonly disposed: boolean;
    emit(batch: PositionBatch): void;
    listenerCount(): number;
  } = {
    get started() {
      return state.started;
    },
    get disposed() {
      return state.disposed;
    },
    start() {
      if (state.disposed) throw new Error('provider is disposed');
      state.started = true;
    },
    stop() {
      state.started = false;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      state.started = false;
      state.disposed = true;
      listeners.clear();
    },
    emit(batch) {
      for (const l of [...listeners]) l(batch);
    },
    listenerCount: () => listeners.size,
  };
  return provider;
}
