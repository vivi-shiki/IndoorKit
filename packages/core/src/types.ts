import type { VenueModel } from '@indoorkit/imdf';
import type { Geometry } from 'geojson';
import type {
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';

/** 插件和应用用到的 MapLibre 规范类型，由核心统一转出，其他包不直接依赖 maplibre-gl */
export type {
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';

import type { EventBus } from './event-bus';

// biome-ignore lint/suspicious/noExplicitAny: MapLibre 的监听器参数随事件类型变化
export type MapListener = (...args: any[]) => void;

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** queryRenderedFeatures 返回的要素中 SDK 读取的部分 */
export interface RenderedFeature {
  geometry: Geometry;
  properties: Record<string, unknown>;
  layer: { id: string };
}

/** SDK 用到的 MapLibre Map 子集；测试时可以替换为假实现 */
export interface MapLike {
  addSource(id: string, source: SourceSpecification): unknown;
  getSource(id: string): unknown;
  removeSource(id: string): unknown;
  /** source 的数据和瓦片是否都已加载完 */
  isSourceLoaded(id: string): boolean;
  addLayer(layer: LayerSpecification, beforeId?: string): unknown;
  getLayer(id: string): unknown;
  removeLayer(id: string): unknown;
  setFilter(layerId: string, filter: FilterSpecification | null): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
  setPaintProperty(layerId: string, name: string, value: unknown): unknown;
  /** 经纬度到容器像素坐标 */
  project(lngLat: [number, number]): ScreenPoint;
  /** 画在屏幕上的要素；不看图层的 minzoom / maxzoom，调用方自己判断 */
  queryRenderedFeatures(
    geometry: [[number, number], [number, number]] | undefined,
    options: { layers: string[] },
  ): RenderedFeature[];
  easeTo(options: { center: [number, number]; duration: number }): unknown;
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: { padding: Padding; pitch: number; bearing: number; duration: number },
  ): unknown;
  getZoom(): number;
  getPitch(): number;
  getBearing(): number;
  triggerRepaint(): void;
  getContainer(): HTMLElement;
  on(type: string, listener: MapListener): unknown;
  off(type: string, listener: MapListener): unknown;
  once(type: string, listener: MapListener): unknown;
  remove(): void;
}

export interface MapFactoryOptions {
  container: HTMLElement | string;
  style: StyleSpecification;
  center: [number, number];
  zoom: number;
  /** 未指定 zoom 时按场馆范围取景 */
  bounds?: [[number, number], [number, number]];
  pitch: number;
  bearing: number;
  /** 多重采样抗锯齿；创建后不能再改 */
  antialias: boolean;
}

export type MapFactory = (options: MapFactoryOptions) => MapLike | Promise<MapLike>;

export type LifecyclePhase = 'init' | 'load' | 'ready' | 'destroy';

/** 核心事件；插件可以通过声明合并扩展 */
/** 核心事件；插件可以通过声明合并扩展 */
export interface IndoorEvents {
  lifecycle: { phase: LifecyclePhase };
  'floor:change': { levelId: string; previous: string | null };
  'marker:change': { count: number };
  'language:change': { languages: readonly string[] };
  'theme:change': { name: string };
  /** 点击地图：容器像素坐标和对应的经纬度 */
  'map:click': { point: ScreenPoint; coord: [number, number] };
}

export interface PluginContext {
  map: MapLike;
  venue: VenueModel;
  events: EventBus<IndoorEvents>;
  /** 当前标注语言优先级，随 setLanguages 变化 */
  readonly languages: readonly string[];
  /** 随楼层切换的室内图层 */
  indoorLayerIds: readonly string[];
  track<T>(value: T, dispose: (value: T) => void, label?: string): T;
  trackSource(id: string, source: SourceSpecification): string;
  trackLayer(layer: LayerSpecification, beforeId?: string): string;
  on<K extends keyof IndoorEvents>(type: K, handler: (payload: IndoorEvents[K]) => void): void;
  onMap(type: string, listener: MapListener): void;
  get<T>(name: string): T;
  /**
   * 这些图层当前画出的要素；around 给出时只取该像素周围 radius 以内的。
   * 跳过当前缩放级别下不显示的图层（queryRenderedFeatures 自己不看 minzoom / maxzoom）。
   */
  queryRendered(
    layerIds: readonly string[],
    around?: { point: ScreenPoint; radius: number },
  ): RenderedFeature[];
}

export interface PluginDef<N extends string = string, A = unknown> {
  name: N;
  deps?: readonly string[];
  setup(ctx: PluginContext): A | Promise<A>;
}

// biome-ignore lint/suspicious/noExplicitAny: 插件 API 类型由各插件推导
export type AnyPlugin = PluginDef<string, any>;

export type PluginApis<P extends readonly AnyPlugin[]> = {
  [K in P[number] as K['name']]: Awaited<ReturnType<K['setup']>>;
};
