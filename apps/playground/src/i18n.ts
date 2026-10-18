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
};

export const messages: Record<Locale, Messages> = { zh, en, ja };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** 保存的语言优先，其次按浏览器语言前缀匹配，最后回退到英文 */
export function detectLocale(storage: StorageLike, languages: readonly string[]): Locale {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // 隐私模式等情况下 storage 不可用
  }
  for (const lang of languages) {
    const prefix = lang.toLowerCase().split('-')[0];
    if (isLocale(prefix)) return prefix;
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
  let locale = detectLocale(options.storage, options.languages);
  const listeners = new Set<(locale: Locale) => void>();
  return {
    get locale() {
      return locale;
    },
    t(key, params) {
      const template = messages[locale][key];
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
    },
    setLocale(next) {
      if (next === locale) return;
      locale = next;
      try {
        options.storage.setItem(STORAGE_KEY, next);
      } catch {
        // 保存失败时本次会话仍然生效
      }
      for (const listener of [...listeners]) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
