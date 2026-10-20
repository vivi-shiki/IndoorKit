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
