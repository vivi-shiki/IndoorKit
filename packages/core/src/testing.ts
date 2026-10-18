import type { FilterSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { MapFactory, MapLike, MapListener } from './types';

/** 不依赖 WebGL 的 MapLike 实现，用于单元测试 */
export class FakeMap implements MapLike {
  removed = false;
  onRemove?: () => void;
  #sources = new Map<string, { spec: SourceSpecification; data: unknown }>();
  #layers = new Map<string, LayerSpecification>();
  #filters = new Map<string, FilterSpecification | null>();
  #listeners = new Map<string, Set<MapListener>>();

  constructor() {
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
      },
    };
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
  return () => {
    const map = new FakeMap();
    onCreate?.(map);
    return map;
  };
}
