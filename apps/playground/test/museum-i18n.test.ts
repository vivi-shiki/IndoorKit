import {
  ALARM_RULES,
  ALARM_TIERS,
  CASE_KINDS,
  DEVICE_KINDS,
  MATERIALS,
  METRICS,
  OBJECT_STATUSES,
  ROOM_KINDS,
  SENSITIVITIES,
} from '@indoorkit/museum';
import { describe, expect, it } from 'vitest';
import { BUDGET_STATES, CROWD_STATES, ENV_STATES } from '../src/museum/adapters/live';
import { MUSEUM_MESSAGES, type MuseumKey } from '../src/museum/messages';
import { MUSEUM_GROUPS, MUSEUM_PAGES } from '../src/museum/routes';

const LOCALES = ['zh', 'en', 'ja'] as const;
const text = (locale: (typeof LOCALES)[number], key: string) => MUSEUM_MESSAGES[locale][key as MuseumKey];
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('museum messages', () => {
  it('has every key in all three languages, with the same placeholders', () => {
    const keys = Object.keys(MUSEUM_MESSAGES.zh).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(MUSEUM_MESSAGES[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(text(locale, key), `${locale} ${key}`).not.toBe('');
        expect(params(text(locale, key)), `${locale} ${key}`).toEqual(params(text('zh', key)));
      }
    }
  });

  it('names every page, view, rule, tier, room, case, material, status, device and map state', () => {
    const keys = [
      ...MUSEUM_PAGES.flatMap((p) => [`page.${p}.title`, `page.${p}.desc`]),
      ...MUSEUM_GROUPS.map((g) => `group.${g.id}.title`),
      ...Object.keys(ALARM_RULES).map((r) => `rule.${r}`),
      ...ALARM_TIERS.map((t) => `tier.${t}`),
      ...ROOM_KINDS.map((k) => `room.${k}`),
      ...CASE_KINDS.map((k) => `case.${k}`),
      ...MATERIALS.map((m) => `material.${m}`),
      ...SENSITIVITIES.map((s) => `sensitivity.${s}`),
      ...OBJECT_STATUSES.map((s) => `status.${s}`),
      ...DEVICE_KINDS.map((k) => `device.${k}`),
      ...METRICS.map((m) => `metric.${m}`),
      ...ENV_STATES.map((s) => `env.${s}`),
      ...CROWD_STATES.map((s) => `crowd.${s}`),
      ...BUDGET_STATES.map((s) => `budget.${s}`),
      ...['passed', 'late', 'missed', 'upcoming'].map((s) => `checkpoint.${s}`),
      ...['done', 'wrong-place', 'pending', 'overdue'].map((s) => `move.${s}`),
    ];
    for (const key of keys) expect(MUSEUM_MESSAGES.zh, key).toHaveProperty([key]);
  });
});

describe('museum terminology', () => {
  // 三种语言各用本国博物馆、保存科学和安防行业的说法，不互相照搬
  const TERMS = {
    'app.name': { zh: '博物馆管理演示', en: 'Museum Operations Demo', ja: 'ミュージアム管理デモ' },
    'group.curator.title': { zh: '策展与藏品管理', en: 'Curator', ja: '学芸員' },
    'group.operations.title': { zh: '运营与安保', en: 'Operations & Security', ja: '運営・警備' },
    'group.visitor.title': { zh: '观众', en: 'Visitor', ja: '来館者' },
    'page.environment.title': { zh: '保存环境', en: 'Environmental Monitoring', ja: '保存環境' },
    'page.collection.title': { zh: '藏品与光照', en: 'Collection & Light Exposure', ja: '収蔵品・露光管理' },
    'page.visitors.title': { zh: '观众与客流', en: 'Visitors & Crowding', ja: '来館者・混雑' },
    'page.security.title': { zh: '安防与巡逻', en: 'Security & Patrols', ja: '警備・巡回' },
    'page.guide.title': { zh: '参观导览', en: 'Visitor Guide', ja: '館内ガイド' },
    'room.gallery': { zh: '展厅', en: 'Gallery', ja: '展示室' },
    'room.storage': { zh: '库房', en: 'Storage', ja: '収蔵庫' },
    'room.fumigation': { zh: '熏蒸室', en: 'Fumigation room', ja: '燻蒸室' },
    'case.wall': { zh: '沿墙通柜', en: 'Wall case', ja: '壁付ケース' },
    'case.freestanding': { zh: '独立展柜', en: 'Freestanding case', ja: '独立ケース' },
    'metric.humidity': { zh: '相对湿度', en: 'Relative humidity', ja: '相対湿度' },
    'metric.illuminance': { zh: '照度', en: 'Illuminance', ja: '照度' },
    'exposure.label': { zh: '累计光照量', en: 'Cumulative light exposure', ja: '積算露光量' },
    'status.loan': { zh: '外借中', en: 'On loan', ja: '貸出中' },
    'designated.label': {
      zh: '重要文化财（虚构）',
      en: 'Important Cultural Property (fictional)',
      ja: '重要文化財（架空）',
    },
    'rule.humidity-swing': { zh: '湿度日波动过大', en: 'Daily humidity fluctuation', ja: '湿度の日変動' },
    'rule.missed-checkpoint': { zh: '漏巡', en: 'Missed checkpoint', ja: '巡回漏れ' },
    'rule.after-hours': { zh: '闭馆后入侵', en: 'After-hours intrusion', ja: '閉館後の侵入' },
    'checkpoint.label': { zh: '巡更点', en: 'Checkpoint', ja: '巡回ポイント' },
    'device.door': { zh: '展柜门磁', en: 'Case door sensor', ja: 'ケース扉センサー' },
    'device.motion': { zh: '人体感应器', en: 'Motion sensor', ja: '人感センサー' },
    'device.rfid': { zh: 'RFID 读写器', en: 'RFID reader', ja: 'RFIDリーダー' },
    'capacity.label': { zh: '承载量', en: 'Capacity', ja: '定員' },
    'dwell.label': { zh: '停留时长', en: 'Dwell time', ja: '滞在時間' },
    // 处理流程与另外两个演示相同
    'state.open': { zh: '未处理', en: 'Open', ja: '未対応' },
    'state.acknowledged': { zh: '已确认', en: 'Acknowledged', ja: '確認済み' },
    'state.resolved': { zh: '已解决', en: 'Resolved', ja: '解決済み' },
  } as const;

  it('uses the agreed terms', () => {
    for (const [key, values] of Object.entries(TERMS)) {
      for (const locale of LOCALES) expect(text(locale, key), `${locale} ${key}`).toBe(values[locale]);
    }
  });

  it('avoids words the trade does not use', () => {
    const banned = {
      zh: /报警|提醒|访客|游客|学艺员|展示室|展示柜/,
      en: /alarm|notice|colour|centre|showcase|exhibition room|lux-hours/i,
      ja: /警報|通知|ギャラリー|ショーケース|観客/,
    };
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(MUSEUM_MESSAGES[locale])) {
        expect(value, `${locale} ${key}`).not.toMatch(banned[locale]);
      }
    }
  });

  it('says the museum, objects and people are fictional, and where visitor counts come from', () => {
    expect(text('ja', 'note.fictional')).toContain('架空');
    expect(text('en', 'note.fictional')).toMatch(/fictional/i);
    expect(text('zh', 'note.fictional')).toContain('虚构');
    expect(text('ja', 'visitors.source')).toContain('30');
    expect(text('en', 'visitors.source')).toContain('30');
    expect(text('zh', 'visitors.source')).toContain('30');
  });
});
