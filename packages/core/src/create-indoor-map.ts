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
  PluginApis,
  PluginContext,
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
  on?: { [K in keyof IndoorEvents]?: (payload: IndoorEvents[K]) => void };
}

export interface IndoorMap<P extends readonly AnyPlugin[]> {
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
  resources: { readonly size: number; labels(): string[] };
  readonly destroyed: boolean;
  /** 释放全部资源；有资源释放失败时，全部释放完后以 AggregateError 拒绝 */
  destroy(): Promise<void>;
}

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const defaultMapFactory: MapFactory = async (options) => {
  const { Map: MapLibreMap } = await import('maplibre-gl');
  return new MapLibreMap({
    ...options,
    fitBoundsOptions: { padding: 48 },
    attributionControl: false,
  }) as unknown as MapLike;
};

function baseStyle(theme: Theme): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
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
    style: baseStyle(theme),
    center: options.venue.center,
    zoom: options.zoom ?? 18,
    bounds: options.zoom === undefined ? options.venue.bounds : undefined,
    pitch: options.pitch ?? 45,
    bearing: options.bearing ?? 0,
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
    const trackLayer = (layer: LayerSpecification, beforeId?: string) => {
      map.addLayer(layer, beforeId);
      tracker.track(layer.id, (l) => map.getLayer(l) && map.removeLayer(l), `layer:${layer.id}`);
      return layer.id;
    };

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
