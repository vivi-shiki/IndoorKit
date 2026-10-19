import { createChoice, readChoice, type StorageLike } from './settings';

export const LOCALES = ['zh', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English', ja: '日本語' };
export const STORAGE_KEY = 'vivi-map.locale';
const DEFAULT_LOCALE: Locale = 'en';

const zh = {
  'language.label': '语言',
  'gallery.subtitle': '开源 TypeScript 室内地图 SDK 的示例画廊',
  'gallery.basic.title': '1 · 基础地图',
  'gallery.basic.desc': '虚构医院、楼层切换、标记',
  'gallery.memory.title': '2 · 内存实验室',
  'gallery.memory.desc': '反复创建/销毁地图，观察堆与未释放资源',
  'gallery.note': '地图数据为虚构的「さくら総合病院」。',
  'demo.basic.title': '1 · 基础地图',
  'demo.memory.title': '2 · 内存实验室',
  'floor.label': '楼层',
  'metric.firstRender': '首屏',
  'metric.markers': '标记',
  'metric.cycles': '轮数',
  'metric.heap': 'JS 堆',
  'metric.unreleased': '未释放资源',
  'metric.ms': '{value} ms',
  'action.addMarker': '添加标记',
  'action.runCycles': '运行 10 轮',
  'chart.heap': '每轮 JS 堆 (MB)，最大 {value}',
  'demo.realtime.title': '3 · 实时定位',
  'demo.realtime.desc': '数千个模拟标签在 Worker 里实时上报，平滑移动，点击回放轨迹',
  'demo.cluster.title': '4 · 万级聚合对比',
  'demo.cluster.desc': '同一批点分别用双重循环和空间索引聚合，比较耗时',
  'demo.geofence.title': '7 · 电子围栏与告警',
  'demo.geofence.desc': '标签进出 ICU 禁入区时告警',
  'demo.heatmap.title': '10 · 热力图',
  'demo.heatmap.desc': '按时间窗口统计人员密度',
  'theme.dark': '暗色',
  'theme.light': '亮色',
  'control.tags': '标签数量',
  'control.points': '点数',
  'control.window': '时间窗口',
  'control.minutes': '{value} 分钟',
  'metric.fps': 'FPS',
  'metric.frameMs': '帧间隔 (ms)',
  'metric.tags': '标签',
  'metric.naive': '双重循环',
  'metric.indexed': '空间索引',
  'metric.speedup': '倍数',
  'metric.clusters': '聚合组',
  'metric.alerts': '告警',
  'metric.checkMs': '每批检测',
  'metric.heatPoints': '窗口内样本',
  'action.runCompare': '运行对比',
  'hint.replay': '点击地图上的标签回放轨迹',
  'fence.icu': 'ICU 禁入区',
  'alert.enter': '{tag} 进入 {fence}',
  'alert.exit': '{tag} 离开 {fence}',
} as const;

export type MessageKey = keyof typeof zh;
type Messages = Record<MessageKey, string>;

const en: Messages = {
  'language.label': 'Language',
  'gallery.subtitle': 'Demo gallery of an open-source TypeScript indoor map SDK',
  'gallery.basic.title': '1 · Basic map',
  'gallery.basic.desc': 'Fictional hospital, floor switching, markers',
  'gallery.memory.title': '2 · Memory lab',
  'gallery.memory.desc': 'Create and destroy the map repeatedly; watch the heap and unreleased resources',
  'gallery.note': 'Map data is the fictional "Sakura General Hospital".',
  'demo.basic.title': '1 · Basic map',
  'demo.memory.title': '2 · Memory lab',
  'floor.label': 'Floor',
  'metric.firstRender': 'First render',
  'metric.markers': 'Markers',
  'metric.cycles': 'Cycles',
  'metric.heap': 'JS heap',
  'metric.unreleased': 'Unreleased',
  'metric.ms': '{value} ms',
  'action.addMarker': 'Add marker',
  'action.runCycles': 'Run 10 cycles',
  'chart.heap': 'JS heap per cycle (MB), max {value}',
  'demo.realtime.title': '3 · Live location',
  'demo.realtime.desc':
    'Thousands of simulated tags reported from a Worker, moving smoothly; click one to replay its trail',
  'demo.cluster.title': '4 · Clustering comparison',
  'demo.cluster.desc':
    'Cluster the same points with a double loop and with a spatial index, and compare the time',
  'demo.geofence.title': '7 · Geofence and alerts',
  'demo.geofence.desc': 'Alerts when tags enter or leave the ICU restricted area',
  'demo.heatmap.title': '10 · Heatmap',
  'demo.heatmap.desc': 'People density over a time window',
  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'control.tags': 'Tags',
  'control.points': 'Points',
  'control.window': 'Time window',
  'control.minutes': '{value} min',
  'metric.fps': 'FPS',
  'metric.frameMs': 'Frame interval (ms)',
  'metric.tags': 'Tags',
  'metric.naive': 'Double loop',
  'metric.indexed': 'Spatial index',
  'metric.speedup': 'Speed-up',
  'metric.clusters': 'Clusters',
  'metric.alerts': 'Alerts',
  'metric.checkMs': 'Check per batch',
  'metric.heatPoints': 'Samples in window',
  'action.runCompare': 'Run comparison',
  'hint.replay': 'Click a tag on the map to replay its trail',
  'fence.icu': 'ICU restricted area',
  'alert.enter': '{tag} entered {fence}',
  'alert.exit': '{tag} left {fence}',
};

const ja: Messages = {
  'language.label': '言語',
  'gallery.subtitle': 'オープンソース TypeScript 屋内地図 SDK のデモギャラリー',
  'gallery.basic.title': '1 · 基本の地図',
  'gallery.basic.desc': '架空の病院、フロア切替、マーカー',
  'gallery.memory.title': '2 · メモリラボ',
  'gallery.memory.desc': '地図の生成と破棄を繰り返し、ヒープと未解放リソースを観察',
  'gallery.note': '地図データは架空の「さくら総合病院」です。',
  'demo.basic.title': '1 · 基本の地図',
  'demo.memory.title': '2 · メモリラボ',
  'floor.label': 'フロア',
  'metric.firstRender': '初回表示',
  'metric.markers': 'マーカー',
  'metric.cycles': 'ラウンド',
  'metric.heap': 'JS ヒープ',
  'metric.unreleased': '未解放リソース',
  'metric.ms': '{value} ms',
  'action.addMarker': 'マーカーを追加',
  'action.runCycles': '10 ラウンド実行',
  'chart.heap': 'ラウンドごとの JS ヒープ (MB)、最大 {value}',
  'demo.realtime.title': '3 · リアルタイム測位',
  'demo.realtime.desc': 'Worker で数千のタグをシミュレーションし滑らかに表示、クリックで軌跡を再生',
  'demo.cluster.title': '4 · クラスタリング比較',
  'demo.cluster.desc': '同じ点を二重ループと空間インデックスでクラスタリングし、時間を比較',
  'demo.geofence.title': '7 · ジオフェンスと警報',
  'demo.geofence.desc': 'ICU 立入制限エリアへの出入りで警報',
  'demo.heatmap.title': '10 · ヒートマップ',
  'demo.heatmap.desc': '時間枠ごとの人の密度',
  'theme.dark': 'ダーク',
  'theme.light': 'ライト',
  'control.tags': 'タグ数',
  'control.points': '点の数',
  'control.window': '時間枠',
  'control.minutes': '{value} 分',
  'metric.fps': 'FPS',
  'metric.frameMs': 'フレーム間隔 (ms)',
  'metric.tags': 'タグ',
  'metric.naive': '二重ループ',
  'metric.indexed': '空間インデックス',
  'metric.speedup': '倍率',
  'metric.clusters': 'クラスタ',
  'metric.alerts': '警報',
  'metric.checkMs': 'バッチごとの判定',
  'metric.heatPoints': '時間枠内のサンプル',
  'action.runCompare': '比較を実行',
  'hint.replay': '地図上のタグをクリックすると軌跡を再生',
  'fence.icu': 'ICU 立入制限エリア',
  'alert.enter': '{tag} が {fence} に入りました',
  'alert.exit': '{tag} が {fence} から出ました',
};

export const messages: Record<Locale, Messages> = { zh, en, ja };

export type { StorageLike };

/** 保存的语言优先，其次按浏览器语言前缀匹配，最后回退到英文 */
export function detectLocale(storage: StorageLike, languages: readonly string[]): Locale {
  const saved = readChoice(storage, STORAGE_KEY, LOCALES);
  if (saved) return saved;
  for (const lang of languages) {
    const prefix = lang.toLowerCase().split('-')[0] as Locale;
    if (LOCALES.includes(prefix)) return prefix;
  }
  return DEFAULT_LOCALE;
}

export interface I18n {
  readonly locale: Locale;
  t(key: MessageKey, params?: Record<string, string | number>): string;
  setLocale(locale: Locale): void;
  subscribe(listener: (locale: Locale) => void): () => void;
}

export function createI18n(options: { storage: StorageLike; languages: readonly string[] }): I18n {
  const choice = createChoice({
    storage: options.storage,
    key: STORAGE_KEY,
    initial: detectLocale(options.storage, options.languages),
  });
  return {
    get locale() {
      return choice.value;
    },
    t(key, params) {
      const template = messages[choice.value][key];
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
    },
    setLocale: (next) => choice.set(next),
    subscribe: (listener) => choice.subscribe(listener),
  };
}
