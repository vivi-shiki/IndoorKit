import type { VenueModel } from '@indoorkit/imdf';
import type {
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { EventBus } from './event-bus';

// biome-ignore lint/suspicious/noExplicitAny: MapLibre 的监听器参数随事件类型变化
export type MapListener = (...args: any[]) => void;

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
  project(lngLat: [number, number]): { x: number; y: number };
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
}

export type MapFactory = (options: MapFactoryOptions) => MapLike | Promise<MapLike>;

export type LifecyclePhase = 'init' | 'load' | 'ready' | 'destroy';

/** 核心事件；插件可以通过声明合并扩展 */
export interface IndoorEvents {
  lifecycle: { phase: LifecyclePhase };
  'floor:change': { levelId: string; previous: string | null };
  'marker:change': { count: number };
  'language:change': { languages: readonly string[] };
  'theme:change': { name: string };
  'positions:update': PositionBatch;
  'geofence:enter': GeofenceEvent;
  'geofence:exit': GeofenceEvent;
}

/** 一个定位标签在某一时刻的位置 */
export interface TagPosition {
  id: string;
  levelId: string;
  coord: [number, number];
  /** 标签随位置一起上报的状态，如设备的 running / offline、人员的 sos */
  status?: string;
}

/** 一次上报：time 为数据源时间（毫秒） */
export interface PositionBatch {
  time: number;
  positions: TagPosition[];
}

/** 实时位置数据源；模拟器、WebSocket 等都实现这个接口 */
export interface DataProvider {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  subscribe(listener: (batch: PositionBatch) => void): () => void;
  /** 停止并释放全部资源（定时器、Worker），之后不能再使用 */
  dispose(): void;
}

export interface GeofenceEvent {
  type: 'enter' | 'exit';
  fenceId: string;
  tagId: string;
  time: number;
  /** 触发事件时标签所在位置 */
  coord: [number, number];
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
