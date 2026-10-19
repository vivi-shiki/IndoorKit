import { createChoice, readChoice, type StorageLike } from './settings';

export const LOCALES = ['zh', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English', ja: '日本語' };
export const STORAGE_KEY = 'indoorkit.locale';
const DEFAULT_LOCALE: Locale = 'en';

const zh = {
  'app.name': '院内定位管理平台',
  'language.label': '语言',
  'gallery.subtitle': '医院室内定位与资产管理演示',
  'gallery.note': '地图与人员均为虚构数据，场馆为「さくら総合病院」。',
  'page.tracking.title': '人员实时定位',
  'page.tracking.desc': '全院人员与设备的实时位置，点击可回放 10 分钟轨迹',
  'page.assets.title': '设备资产分布',
  'page.assets.desc': '按楼层查看设备聚集情况，数字为该处设备数量',
  'page.alerts.title': '禁入区域告警',
  'page.alerts.desc': '人员进出 ICU 等受限区域时实时告警',
  'page.occupancy.title': '人流密度分析',
  'page.occupancy.desc': '按时间段查看各楼层的人员密集区域',
  'floor.label': '楼层',
  'theme.dark': '暗色',
  'theme.light': '亮色',
  'control.tags': '定位标签',
  'control.window': '时间段',
  'control.minutes': '近 {value} 分钟',
  'metric.fps': 'FPS',
  'metric.frameMs': '帧间隔 (ms)',
  'metric.tags': '在线标签',
  'metric.clusters': '聚集点',
  'metric.assets': '本层设备',
  'metric.alerts': '告警',
  'metric.heatPoints': '时间段内定位次数',
  'hint.replay': '点击地图上的标签回放轨迹',
  'fence.icu': 'ICU 禁入区',
  'alert.enter': '{tag} 进入 {fence}',
  'alert.exit': '{tag} 离开 {fence}',
} as const;

export type MessageKey = keyof typeof zh;
type Messages = Record<MessageKey, string>;

const en: Messages = {
  'app.name': 'Hospital RTLS Console',
  'language.label': 'Language',
  'gallery.subtitle': 'Indoor positioning and asset management for hospitals',
  'gallery.note': 'All map and people data is fictional; the venue is "Sakura General Hospital".',
  'page.tracking.title': 'Real-time Tracking',
  'page.tracking.desc':
    'Live positions of staff and equipment across the hospital; click one to replay its last 10 minutes',
  'page.assets.title': 'Asset Distribution',
  'page.assets.desc': 'Where equipment is concentrated on each floor; numbers show how many items are there',
  'page.alerts.title': 'Restricted Zone Alerts',
  'page.alerts.desc': 'Real-time alerts when people enter or leave restricted areas such as the ICU',
  'page.occupancy.title': 'Occupancy Heatmap',
  'page.occupancy.desc': 'Crowded areas on each floor over a chosen time window',
  'floor.label': 'Floor',
  'theme.dark': 'Dark',
  'theme.light': 'Light',
  'control.tags': 'Tags',
  'control.window': 'Time window',
  'control.minutes': 'Last {value} min',
  'metric.fps': 'FPS',
  'metric.frameMs': 'Frame interval (ms)',
  'metric.tags': 'Tags online',
  'metric.clusters': 'Clusters',
  'metric.assets': 'Assets on floor',
  'metric.alerts': 'Alerts',
  'metric.heatPoints': 'Position reports in window',
  'hint.replay': 'Click a tag on the map to replay its trail',
  'fence.icu': 'ICU restricted area',
  'alert.enter': '{tag} entered {fence}',
  'alert.exit': '{tag} left {fence}',
};

const ja: Messages = {
  'app.name': '院内位置情報管理システム',
  'language.label': '言語',
  'gallery.subtitle': '病院向け屋内測位・資産管理デモ',
  'gallery.note': '地図と人物はすべて架空のデータです。施設は「さくら総合病院」です。',
  'page.tracking.title': 'リアルタイム位置監視',
  'page.tracking.desc': '院内のスタッフと機器の現在位置。クリックで直近 10 分の軌跡を再生',
  'page.assets.title': '医療機器の分布',
  'page.assets.desc': 'フロアごとの機器の集まり具合。数字はその場所の台数',
  'page.alerts.title': '立入制限エリア警報',
  'page.alerts.desc': 'ICU など立入制限エリアへの出入りをリアルタイムで警報',
  'page.occupancy.title': '混雑状況ヒートマップ',
  'page.occupancy.desc': '時間帯ごとに各フロアの混雑エリアを表示',
  'floor.label': 'フロア',
  'theme.dark': 'ダーク',
  'theme.light': 'ライト',
  'control.tags': 'タグ数',
  'control.window': '時間帯',
  'control.minutes': '直近 {value} 分',
  'metric.fps': 'FPS',
  'metric.frameMs': 'フレーム間隔 (ms)',
  'metric.tags': 'オンラインのタグ',
  'metric.clusters': '集まり',
  'metric.assets': 'このフロアの機器',
  'metric.alerts': '警報',
  'metric.heatPoints': '時間帯内の測位回数',
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
