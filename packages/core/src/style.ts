import type { VenueModel } from '@indoorkit/imdf';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';

export interface Theme {
  name: string;
  background: string;
  floor: string;
  wall: string;
  wallHeight: number;
  door: string;
  label: string;
  labelHalo: string;
  marker: string;
  defaultUnitColor: string;
  unitColors: Record<string, string>;
  unitHeights: Record<string, number>;
}

export const themes: Record<'light' | 'dark', Theme> = {
  light: {
    name: 'light',
    background: '#eef1f4',
    floor: '#f7f7f5',
    wall: '#8d96a3',
    wallHeight: 2.4,
    door: '#ffffff',
    label: '#2f3a48',
    labelHalo: '#ffffff',
    marker: '#e5484d',
    defaultUnitColor: '#e3e7ec',
    unitColors: {
      room: '#cfe3f7',
      walkway: '#ffffff',
      elevator: '#f6d7a7',
      stairs: '#e8c9f2',
      restroom: '#c8ecd9',
      lobby: '#fff1c7',
    },
    unitHeights: { room: 0.2, elevator: 0.3, stairs: 0.3, restroom: 0.2, lobby: 0.1, walkway: 0 },
  },
  dark: {
    name: 'dark',
    background: '#11161d',
    floor: '#1c232d',
    wall: '#56606e',
    wallHeight: 2.4,
    door: '#2b3440',
    label: '#dbe3ec',
    labelHalo: '#11161d',
    marker: '#ff6b6f',
    defaultUnitColor: '#2a323d',
    unitColors: {
      room: '#29425c',
      walkway: '#232b35',
      elevator: '#5c4a2c',
      stairs: '#4c3a5a',
      restroom: '#2f5141',
      lobby: '#5a5230',
    },
    unitHeights: { room: 0.2, elevator: 0.3, stairs: 0.3, restroom: 0.2, lobby: 0.1, walkway: 0 },
  },
};

/** 主题决定的全部颜色：图层 id → paint 属性；生成样式和切换主题都只读这里 */
export function themePaint(theme: Theme): Record<string, Record<string, unknown>> {
  return {
    background: { 'background-color': theme.background },
    'indoor-floor': { 'fill-color': theme.floor, 'fill-outline-color': theme.wall },
    'indoor-units': { 'fill-extrusion-color': match(theme.unitColors, theme.defaultUnitColor) },
    'indoor-walls': { 'fill-extrusion-color': theme.wall },
    'indoor-openings': { 'line-color': theme.door },
    'indoor-labels': { 'text-color': theme.label, 'text-halo-color': theme.labelHalo },
  };
}

export interface IndoorStyle {
  sources: { id: string; spec: SourceSpecification }[];
  layers: LayerSpecification[];
  /** 需要按楼层过滤的图层 */
  levelLayerIds: string[];
}

function match(map: Record<string, string | number>, fallback: string | number): ExpressionSpecification {
  const pairs = Object.entries(map).flat();
  return ['match', ['get', 'category'], ...pairs, fallback] as unknown as ExpressionSpecification;
}

/** 按语言优先级读取 label_<lang> 属性的标注表达式 */
export function labelExpression(languages: readonly string[]): ExpressionSpecification {
  return ['coalesce', ...languages.map((l) => ['get', `label_${l}`])] as ExpressionSpecification;
}

/** 地图支持的界面语言，选中的语言排第一，其余作为缺失时的回退 */
export function languageFallbacks(locale: string): string[] {
  const order: Record<string, string[]> = {
    zh: ['zh', 'ja', 'en'],
    en: ['en', 'ja', 'zh'],
    ja: ['ja', 'en', 'zh'],
  };
  return order[locale] ?? [locale, 'en', 'ja', 'zh'];
}

/** 由数据类别和主题生成 MapLibre 图层，替代写死的大段样式 */
export function buildIndoorStyle(venue: VenueModel, theme: Theme, languages: readonly string[]): IndoorStyle {
  const walls = {
    ...venue.features.fixtures,
    features: venue.features.fixtures.features.filter((f) => f.properties.category === 'wall'),
  };
  const sources = [
    { id: 'indoor-levels', spec: { type: 'geojson', data: venue.features.levels } },
    { id: 'indoor-units', spec: { type: 'geojson', data: venue.features.units } },
    { id: 'indoor-walls', spec: { type: 'geojson', data: walls } },
    { id: 'indoor-openings', spec: { type: 'geojson', data: venue.features.openings } },
  ] satisfies IndoorStyle['sources'];

  const label = labelExpression(languages);
  const colors = themePaint(theme);

  const layers: LayerSpecification[] = [
    {
      id: 'indoor-floor',
      type: 'fill',
      source: 'indoor-levels',
      paint: { ...colors['indoor-floor'] },
    },
    {
      id: 'indoor-units',
      type: 'fill-extrusion',
      source: 'indoor-units',
      paint: {
        ...colors['indoor-units'],
        'fill-extrusion-height': match(theme.unitHeights, 0.1),
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.95,
      },
    },
    {
      id: 'indoor-walls',
      type: 'fill-extrusion',
      source: 'indoor-walls',
      paint: {
        ...colors['indoor-walls'],
        'fill-extrusion-height': theme.wallHeight,
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.9,
      },
    },
    {
      id: 'indoor-openings',
      type: 'line',
      source: 'indoor-openings',
      paint: { ...colors['indoor-openings'], 'line-width': 3 },
    },
    {
      id: 'indoor-labels',
      type: 'symbol',
      source: 'indoor-units',
      layout: {
        'text-field': label,
        'text-font': ['Noto Sans Regular'],
        'text-size': 12,
        'text-allow-overlap': false,
      },
      paint: { ...colors['indoor-labels'], 'text-halo-width': 1.2 },
    },
  ];

  return { sources, layers, levelLayerIds: layers.map((l) => l.id) };
}
