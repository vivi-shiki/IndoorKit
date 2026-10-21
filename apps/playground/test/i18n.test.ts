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
  // 术语按三语文案整改文档第 3 节统一：同一概念在三种语言里各用一个词
  const TERMS = {
    // 页面同时列出区域、围栏和状态告警，标题不限于“区域”
    'page.alerts.title': { zh: '告警中心', en: 'Alerts', ja: 'アラート一覧' },
    'trail.alarms': { zh: '沿途告警', en: 'Alerts along the route', ja: '経路上のアラート' },
    'layer.fence': { zh: '电子围栏', en: 'Geofence', ja: 'ジオフェンス' },
    'layer.department': { zh: '部门规则', en: 'Department rules', ja: '部門ルール' },
    'layer.status': { zh: '状态上报', en: 'Status reports', ja: '状態報告' },
    'metric.alerts': { zh: '告警', en: 'Alerts', ja: 'アラート' },
    // 热力图统计的是定位上报次数，不是人数
    'page.occupancy.title': {
      zh: '定位上报热力图',
      en: 'Location Report Heatmap',
      ja: '位置報告ヒートマップ',
    },
    'metric.heatPoints': {
      zh: '所选时段上报次数',
      en: 'Reports in selected period',
      ja: '選択期間の位置報告数',
    },
    'busy.title': {
      zh: '定位上报最多的房间（前 3）',
      en: 'Top 3 rooms by location reports',
      ja: '位置報告数の多い部屋（上位 3 件）',
    },
    // 部门包含护理部和行政部，不全是临床科室
    'place.outsideOwn': {
      zh: '位于所属部门范围外',
      en: 'Outside assigned department',
      ja: '所属部門のエリア外',
    },
    'metric.outside': { zh: '所属部门范围外', en: 'Outside assigned department', ja: '所属部門のエリア外' },
    'control.departments': { zh: '部门区域', en: 'Department areas', ja: '部門エリア' },
    'detail.department': { zh: '所属部门', en: 'Assigned department', ja: '所属部門' },
    'panel.departments': { zh: '部门', en: 'Departments', ja: '部門' },
    // 医生、患者等是人员类型，不是权限角色
    'control.roles': { zh: '人员类型', en: 'Person type', ja: '対象者の区分' },
    'detail.role': { zh: '人员类型', en: 'Person type', ja: '対象者の区分' },
    'asset.monitor': { zh: '监护仪', en: 'Patient monitor', ja: '生体モニター' },
    'trail.range': { zh: '时间范围', en: 'Time range', ja: '時間範囲' },
    'trail.speed': { zh: '回放速度', en: 'Playback speed', ja: '再生速度' },
    'status.maintenance': { zh: '维护中', en: 'Under maintenance', ja: 'メンテナンス中' },
    'group.efficiency.title': { zh: '设备', en: 'Equipment', ja: '機器' },
    'group.people.title': { zh: '人员', en: 'People', ja: '院内の人' },
    'page.trail.title': { zh: '轨迹回放', en: 'Movement Replay', ja: '移動履歴の再生' },
    // 处理流程：未处理 → 已确认 → 已解决；“未解决”统计包含已确认
    'state.open': { zh: '未处理', en: 'Open', ja: '未対応' },
    'state.acknowledged': { zh: '已确认', en: 'Acknowledged', ja: '確認済み' },
    'state.resolved': { zh: '已解决', en: 'Resolved', ja: '解決済み' },
    'metric.unhandled': { zh: '未解决', en: 'Unresolved', ja: '未解決' },
    // 按钮只改处理状态，不代表修好了
    'action.ack': { zh: '标记为已确认', en: 'Mark as acknowledged', ja: '確認済みにする' },
    'action.resolve': { zh: '标记为已解决', en: 'Mark as resolved', ja: '解決済みにする' },
    // ICU 按部门豁免，是限制区域而不是绝对禁区
    'fence.icu': { zh: 'ICU 限制区域', en: 'ICU restricted area', ja: 'ICU 立入制限エリア' },
    'alarm.forbid': { zh: '进入限制区域', en: 'Entered a restricted area', ja: '立入制限エリアに立ち入り' },
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

  it('uses American spelling in English', () => {
    for (const [key, text] of Object.entries(messages.en)) {
      expect(text, key).not.toMatch(/licence|utilis|colour|centre|organis|paediatric/i);
    }
  });

  it('says department everywhere, since departments include nursing and administration', () => {
    for (const [key, text] of Object.entries(messages.zh)) expect(text, key).not.toMatch(/科室/);
    for (const [key, text] of Object.entries(messages.ja)) expect(text, key).not.toMatch(/診療科/);
  });

  it('uses Chinese words rather than Japanese ones', () => {
    for (const [key, text] of Object.entries(messages.zh)) {
      expect(text, key).not.toMatch(/满空|入出库|学艺员|来馆|展示室|警备|收藏库|禁入|防盗/);
    }
  });
});

describe('home page copy', () => {
  it('introduces the SDK without negatives', () => {
    expect(messages.zh['home.intro']).not.toMatch(/不/);
    expect(messages.en['home.intro']).not.toMatch(/\bnot?\b|n’t|nothing/);
    expect(messages.ja['home.intro']).not.toMatch(/ません|ない/);
  });

  it('notes that every venue is fictional without naming only the hospital', () => {
    for (const locale of LOCALES) {
      expect(messages[locale]['home.note'], locale).not.toMatch(/樱花|Sakura|さくら/);
    }
  });

  it('names the carousel arrows after what they switch', () => {
    expect([messages.ja['home.previous'], messages.ja['home.next']]).toEqual([
      '前の活用シーン',
      '次の活用シーン',
    ]);
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
    expect(i18n.t('page.tracking.title')).toBe('Live People Tracking');
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
