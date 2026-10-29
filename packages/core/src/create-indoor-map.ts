import type { VenueModel } from '@indoorkit/imdf';
import type { LayerSpecification, SourceSpecification, StyleSpecification } from 'maplibre-gl';
import { EventBus } from './event-bus';
import { sortPlugins } from './plugin';
import { ResourceTracker } from './resource-tracker';
import { buildIndoorStyle, labelExpression, type Theme, themePaint, themes } from './style';
import type {
  AnyPlugin,
  IndoorEvents,
  MapFactory,
  MapLike,
  MapListener,
  Padding,
  PluginApis,
  PluginContext,
  RenderedFeature,
  ScreenPoint,
} from './types';

export interface CreateIndoorMapOptions<P extends readonly AnyPlugin[]> {
  container: HTMLElement | string;
  venue: VenueModel;
  plugins?: P;
  theme?: Theme;
  /** 标注语言优先级 */
  languages?: readonly string[];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  mapFactory?: MapFactory;
  /** 多重采样抗锯齿，默认关闭；创建后不能再改 */
  antialias?: boolean;
  /** 字形（PBF）地址模板，默认 OpenFreeMap */
  glyphs?: string;
  on?: { [K in keyof IndoorEvents]?: (payload: IndoorEvents[K]) => void };
}

export interface IndoorMap<P extends readonly AnyPlugin[]> {
  /** 底层地图（MapLibre）。业务代码不直接使用，测试工具见 @indoorkit/core/testing */
  map: MapLike;
  venue: VenueModel;
  plugins: PluginApis<P>;
  events: EventBus<IndoorEvents>;
  indoorLayerIds: readonly string[];
  /** 当前标注语言优先级 */
  readonly languages: readonly string[];
  /** 切换地图内标注语言，不重建地图 */
  setLanguages(languages: readonly string[]): void;
  /** 当前主题 */
  readonly theme: Theme;
  /** 切换主题颜色，不重建地图 */
  setTheme(theme: Theme): void;
  /** 按名字取插件 API；插件没有加载时抛错 */
  plugin<T>(name: string): T;
  hasPlugin(name: string): boolean;
  camera: {
    /** 平移到一个坐标，不改变缩放、倾斜和方向；默认动画 500 ms */
    focus(coord: [number, number], options?: { durationMs?: number }): void;
    /** 让一个范围充满视口（留出 padding），保持当前倾斜和方向；默认动画 500 ms */
    fit(
      bounds: [[number, number], [number, number]],
      options: { padding: Padding; durationMs?: number },
    ): void;
  };
  /** 经纬度到地图容器内的像素坐标 */
  project(coord: [number, number]): ScreenPoint;
  /** 请求重绘，地图下一次空闲（瓦片和动画都完成）时完成 */
  idle(): Promise<void>;
  /** 下一帧画完时完成 */
  rendered(): Promise<void>;
  resources: { readonly size: number; labels(): string[] };
  readonly destroyed: boolean;
  /** 释放全部资源；有资源释放失败时，全部释放完后以 AggregateError 拒绝 */
  destroy(): Promise<void>;
}

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const defaultMapFactory: MapFactory = async ({ antialias, ...options }) => {
  const { Map: MapLibreMap } = await import('maplibre-gl');
  return new MapLibreMap({
    ...options,
    canvasContextAttributes: { antialias },
    fitBoundsOptions: { padding: 48 },
    attributionControl: false,
  }) as unknown as MapLike;
};

function baseStyle(theme: Theme, glyphs: string): StyleSpecification {
  return {
    version: 8,
    glyphs,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { ...themePaint(theme).background } }],
  };
}

export async function createIndoorMap<const P extends readonly AnyPlugin[] = []>(
  options: CreateIndoorMapOptions<P>,
): Promise<IndoorMap<P>> {
  let theme = options.theme ?? themes.light;
  let languages: readonly string[] = [...(options.languages ?? ['ja', 'en'])];
  const events = new EventBus<IndoorEvents>();
  const tracker = new ResourceTracker();
  for (const [type, handler] of Object.entries(options.on ?? {})) {
    events.on(type as keyof IndoorEvents, handler as (p: unknown) => void);
  }

  events.emit('lifecycle', { phase: 'init' });
  const factory = options.mapFactory ?? defaultMapFactory;
  const map = await factory({
    container: options.container,
    style: baseStyle(theme, options.glyphs ?? GLYPHS),
    center: options.venue.center,
    zoom: options.zoom ?? 18,
    bounds: options.zoom === undefined ? options.venue.bounds : undefined,
    pitch: options.pitch ?? 45,
    bearing: options.bearing ?? 0,
    antialias: options.antialias ?? false,
  });
  // 最先登记，最后释放
  tracker.track(map, (m) => m.remove(), 'map');

  let destroyed = false;
  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    events.emit('lifecycle', { phase: 'destroy' });
    const errors = tracker.disposeAll();
    events.clear();
    // 先释放完全部资源再报错，单个失败不会留下其余资源
    if (errors.length > 0) throw new AggregateError(errors, `${errors.length} resource(s) failed to release`);
  };

  try {
    await new Promise<void>((resolve) => map.once('load', () => resolve()));
    events.emit('lifecycle', { phase: 'load' });

    const trackSource = (id: string, spec: SourceSpecification) => {
      map.addSource(id, spec);
      tracker.track(id, (s) => map.getSource(s) && map.removeSource(s), `source:${id}`);
      return id;
    };
    /** 已添加图层的缩放范围，queryRendered 用它跳过当前缩放下不显示的图层 */
    const zoomRanges = new Map<string, [number, number]>();
    const trackLayer = (layer: LayerSpecification, beforeId?: string) => {
      map.addLayer(layer, beforeId);
      zoomRanges.set(layer.id, [layer.minzoom ?? 0, layer.maxzoom ?? 24]);
      tracker.track(
        layer.id,
        (l) => {
          zoomRanges.delete(l);
          if (map.getLayer(l)) map.removeLayer(l);
        },
        `layer:${layer.id}`,
      );
      return layer.id;
    };
    const queryRendered = (
      layerIds: readonly string[],
      around?: { point: ScreenPoint; radius: number },
    ): RenderedFeature[] => {
      const zoom = map.getZoom();
      const shown = layerIds.filter((id) => {
        const range = zoomRanges.get(id);
        if (!range) throw new Error(`layer "${id}" was not added through the SDK`);
        return zoom >= range[0] && zoom < range[1];
      });
      if (shown.length === 0) return [];
      const box: [[number, number], [number, number]] | undefined = around && [
        [around.point.x - around.radius, around.point.y - around.radius],
        [around.point.x + around.radius, around.point.y + around.radius],
      ];
      return map.queryRenderedFeatures(box, { layers: shown });
    };
    const onClick: MapListener = (e: { point: ScreenPoint; lngLat: { lng: number; lat: number } }) =>
      events.emit('map:click', {
        point: { x: e.point.x, y: e.point.y },
        coord: [e.lngLat.lng, e.lngLat.lat],
      });
    map.on('click', onClick);
    tracker.track(onClick, (l) => map.off('click', l), 'map.on:click');

    const style = buildIndoorStyle(options.venue, theme, languages);
    for (const s of style.sources) trackSource(s.id, s.spec);
    for (const l of style.layers) trackLayer(l);

    const apis: Record<string, unknown> = {};
    for (const plugin of sortPlugins(options.plugins ?? [])) {
      const ctx: PluginContext = {
        map,
        venue: options.venue,
        events,
        get languages() {
          return languages;
        },
        indoorLayerIds: style.levelLayerIds,
        track: (value, dispose, label) =>
          tracker.track(value, dispose, `${plugin.name}:${label ?? 'resource'}`),
        trackSource,
        trackLayer,
        on: (type, handler) => {
          tracker.track(events.on(type, handler), (off) => off(), `${plugin.name}:on:${type}`);
        },
        onMap: (type: string, listener: MapListener) => {
          map.on(type, listener);
          tracker.track(listener, (l) => map.off(type, l), `${plugin.name}:map.on:${type}`);
        },
        get: <T>(name: string) => {
          if (!(name in apis)) throw new Error(`plugin "${name}" is not available to "${plugin.name}"`);
          return apis[name] as T;
        },
        queryRendered,
      };
      apis[plugin.name] = await plugin.setup(ctx);
    }

    events.emit('lifecycle', { phase: 'ready' });
    return {
      map,
      venue: options.venue,
      plugins: apis as PluginApis<P>,
      events,
      indoorLayerIds: style.levelLayerIds,
      plugin<T>(name: string) {
        if (!(name in apis)) throw new Error(`plugin "${name}" is not loaded`);
        return apis[name] as T;
      },
      hasPlugin: (name) => name in apis,
      camera: {
        focus(coord, opts) {
          map.easeTo({ center: coord, duration: opts?.durationMs ?? 500 });
        },
        fit(bounds, opts) {
          map.fitBounds(bounds, {
            padding: opts.padding,
            pitch: map.getPitch(),
            bearing: map.getBearing(),
            duration: opts.durationMs ?? 500,
          });
        },
      },
      project: (coord) => map.project(coord),
      idle() {
        const done = new Promise<void>((resolve) => map.once('idle', () => resolve()));
        map.triggerRepaint();
        return done;
      },
      rendered: () => new Promise<void>((resolve) => map.once('render', () => resolve())),
      resources: tracker,
      get languages() {
        return languages;
      },
      setLanguages(next) {
        if (next.length === 0) throw new Error('setLanguages needs at least one language');
        languages = [...next];
        map.setLayoutProperty('indoor-labels', 'text-field', labelExpression(languages));
        events.emit('language:change', { languages });
      },
      get theme() {
        return theme;
      },
      setTheme(next) {
        theme = next;
        for (const [layerId, paint] of Object.entries(themePaint(theme))) {
          for (const [name, value] of Object.entries(paint)) map.setPaintProperty(layerId, name, value);
        }
        events.emit('theme:change', { name: theme.name });
      },
      get destroyed() {
        return destroyed;
      },
      destroy,
    };
  } catch (error) {
    destroyed = true;
    tracker.disposeAll();
    events.clear();
    throw error;
  }
}
