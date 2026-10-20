import { describe, expect, it, vi } from 'vitest';
import { createI18n, detectLocale, LOCALES, messages, STORAGE_KEY } from '../src/i18n';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}

describe('messages', () => {
  it('has every key in all three languages', () => {
    const keys = Object.keys(messages.zh).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(keys);
      for (const key of keys) expect(messages[locale][key as keyof typeof messages.zh]).not.toBe('');
    }
  });
});

describe('terminology', () => {
  // 同一个系统事件在三种语言里各用一个词：告警 / Alert / アラート
  const TERMS = {
    'page.alerts.title': { zh: '区域告警', en: 'Zone Alerts', ja: 'エリアアラート' },
    'trail.alarms': { zh: '沿途告警', en: 'Alerts Along the Route', ja: '経路上のアラート' },
    'layer.fence': { zh: '电子围栏', en: 'Geofence', ja: 'ジオフェンス' },
    'metric.alerts': { zh: '告警', en: 'Alerts', ja: 'アラート' },
    // 热力图统计的是定位上报次数，不是人数
    'page.occupancy.title': {
      zh: '位置分布热力图',
      en: 'Location Report Heatmap',
      ja: '位置情報ヒートマップ',
    },
    'metric.heatPoints': {
      zh: '选定时段内的定位上报次数',
      en: 'Location reports in the selected period',
      ja: '選択期間内の測位回数',
    },
    'busy.title': {
      zh: '定位上报次数最多的区域',
      en: 'Areas with the most location reports',
      ja: '測位回数の多いエリア',
    },
    // 「本科室」容易被理解成当前用户的科室
    'place.outsideOwn': { zh: '位于所属科室外', en: 'Outside assigned department', ja: '所属診療科外' },
    'metric.outside': { zh: '位于所属科室外', en: 'Outside assigned department', ja: '所属診療科外' },
    'control.departments': { zh: '科室区域', en: 'Department areas', ja: '診療科エリア' },
    'asset.monitor': { zh: '监护仪', en: 'Patient monitor', ja: '生体モニター' },
    'trail.range': { zh: '时间范围', en: 'Time range', ja: '時間範囲' },
    'trail.speed': { zh: '回放速度', en: 'Playback speed', ja: '再生速度' },
    'status.maintenance': { zh: '维修中', en: 'Under maintenance', ja: '保守中' },
    'group.people.title': { zh: '人员视图', en: 'People View', ja: '人の位置・移動' },
    'control.roles': { zh: '角色', en: 'Roles', ja: '人物区分' },
    // 按使用者划分的视图：中文用角色词，日文用「〜向け」
    'scenario.parking.operator.title': { zh: '运营视图', en: 'Operator View', ja: '運営者向け' },
    'scenario.parking.driver.title': { zh: '车主视图', en: 'Driver View', ja: 'ドライバー向け' },
    'scenario.museum.curator.title': { zh: '策展视图', en: 'Curator View', ja: '学芸員向け' },
    'scenario.museum.operations.title': {
      zh: '运营与安保视图',
      en: 'Operations and Security View',
      ja: '運営・警備向け',
    },
    'scenario.museum.visitor.title': { zh: '观众视图', en: 'Visitor View', ja: '来館者向け' },
    'home.comingSoon': { zh: '开发中', en: 'Coming soon', ja: '開発中' },
  } as const;

  it('uses the agreed terms', () => {
    for (const [key, values] of Object.entries(TERMS)) {
      for (const locale of LOCALES) {
        expect(messages[locale][key as keyof typeof messages.zh], `${locale} ${key}`).toBe(values[locale]);
      }
    }
  });

  it('does not mix in other words for the same alert', () => {
    const banned = { zh: /提醒|报警|本科室|拥挤/, en: /notice|alarm|crowd|busiest/i, ja: /通知|警報|混雑/ };
    for (const locale of LOCALES) {
      for (const [key, text] of Object.entries(messages[locale])) {
        expect(text, `${locale} ${key}`).not.toMatch(banned[locale]);
      }
    }
  });
});

describe('home page copy', () => {
  // 首页、场景卡片和菜单是 React 改版时新写的文案，按上一版已审过的文案统一写法
  const isNewCopy = (key: string) => /^(home|scenario|nav)\./.test(key);
  const entries = (locale: (typeof LOCALES)[number]) =>
    Object.entries(messages[locale]).filter(([key]) => isNewCopy(key));

  it('writes Japanese without half-width spaces around numbers and Latin letters', () => {
    const cjk = '[\\u3040-\\u30ff\\u4e00-\\u9fff]';
    const spaced = new RegExp(`${cjk} [A-Za-z0-9{]|[A-Za-z0-9}] ${cjk}`);
    for (const [key, text] of entries('ja')) expect(text, key).not.toMatch(spaced);
  });

  it('uses American spelling in English, as the rest of the app does', () => {
    for (const [key, text] of entries('en'))
      expect(text, key).not.toMatch(/licence|utilis|colour|centre|organis/i);
  });

  it('uses Chinese words rather than Japanese ones', () => {
    for (const [key, text] of entries('zh')) {
      expect(text, key).not.toMatch(/满空|入出库|学艺员|来馆|展示室|警备|收藏库|解说/);
    }
  });

  it('says what the SDK and the application layer each do, with no negatives', () => {
    const intro = {
      zh: 'SDK 负责室内地图、场馆数据和实时位置；应用层负责各场景的业务功能和页面。',
      en: 'The SDK handles the indoor map, venue data and real-time positions. The application layer handles the features and screens for each use case.',
      ja: 'SDKは屋内地図、施設データ、リアルタイムの位置情報を担い、アプリケーション層は各シーンの業務機能と画面を担います。',
    };
    for (const locale of LOCALES) expect(messages[locale]['home.intro'], locale).toBe(intro[locale]);
  });

  it('describes the parking and museum demos the way the reviewed hospital copy does', () => {
    for (const id of ['hospital', 'parking', 'museum'] as const) {
      const key = `scenario.${id}.desc` as const;
      expect(messages.zh[key], key).toMatch(/^以虚构的“.+”为例，展示.+。$/);
      expect(messages.en[key], key).toMatch(/^Explore .+, in the fictional .+\.$/);
      expect(messages.ja[key], key).toMatch(/^架空の「.+」を舞台に、.+を確認できるデモです。$/);
    }
  });

  it('notes that every venue is fictional without naming only the hospital', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['home.note'], locale).not.toMatch(/樱花|Sakura|さくら/);
    }
  });
});

describe('detectLocale', () => {
  it('prefers a saved locale', () => {
    expect(detectLocale(memoryStorage({ [STORAGE_KEY]: 'ja' }), ['en-US'])).toBe('ja');
  });

  it('ignores an invalid saved value', () => {
    expect(detectLocale(memoryStorage({ [STORAGE_KEY]: 'fr' }), ['ja-JP'])).toBe('ja');
  });

  it('matches the browser language by prefix', () => {
    expect(detectLocale(memoryStorage(), ['zh-TW', 'en'])).toBe('zh');
    expect(detectLocale(memoryStorage(), ['de-DE', 'ja'])).toBe('ja');
  });

  it('falls back to English', () => {
    expect(detectLocale(memoryStorage(), ['fr-FR'])).toBe('en');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(detectLocale(broken, ['ja'])).toBe('ja');
  });
});

describe('createI18n', () => {
  it('translates with parameters', () => {
    const i18n = createI18n({ storage: memoryStorage(), languages: ['en'] });
    expect(i18n.locale).toBe('en');
    expect(i18n.t('page.tracking.title')).toBe('Live Map');
    expect(i18n.t('control.minutes', { value: 15 })).toBe('Last 15 min');
  });

  it('saves the new locale and notifies listeners', () => {
    const storage = memoryStorage();
    const i18n = createI18n({ storage, languages: ['en'] });
    const listener = vi.fn();
    i18n.subscribe(listener);
    i18n.setLocale('ja');
    expect(i18n.locale).toBe('ja');
    expect(storage.data.get(STORAGE_KEY)).toBe('ja');
    expect(listener).toHaveBeenCalledWith('ja');
  });

  it('restores the saved locale in a new session', () => {
    const storage = memoryStorage();
    createI18n({ storage, languages: ['en'] }).setLocale('zh');
    expect(createI18n({ storage, languages: ['en'] }).locale).toBe('zh');
  });

  it('does not notify when the locale is unchanged', () => {
    const i18n = createI18n({ storage: memoryStorage(), languages: ['en'] });
    const listener = vi.fn();
    i18n.subscribe(listener);
    i18n.setLocale('en');
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('language requested by a link (?lang=)', () => {
  it('wins over the saved locale and the browser language, and is saved', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'en' });
    const i18n = createI18n({ storage, languages: ['en-US'], requested: 'ja' });
    expect(i18n.locale).toBe('ja');
    expect(storage.data.get(STORAGE_KEY)).toBe('ja');
  });

  it('is ignored when it is not a supported language', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'zh' });
    expect(createI18n({ storage, languages: ['en'], requested: 'fr' }).locale).toBe('zh');
    expect(createI18n({ storage, languages: ['en'], requested: null }).locale).toBe('zh');
  });
});
