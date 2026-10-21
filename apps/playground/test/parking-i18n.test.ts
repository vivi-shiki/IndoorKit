import { ALARM_RULES, ALARM_TIERS, BAY_TYPES, DEVICE_KINDS } from '@indoorkit/parking';
import { describe, expect, it } from 'vitest';
import { PARKING_MESSAGES, type ParkingKey } from '../src/parking/messages';
import { PARKING_GROUPS, PARKING_PAGES } from '../src/parking/routes';

const LOCALES = ['zh', 'en', 'ja'] as const;
const text = (locale: (typeof LOCALES)[number], key: string) => PARKING_MESSAGES[locale][key as ParkingKey];
const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('parking messages', () => {
  it('has every key in all three languages, with the same placeholders', () => {
    const keys = Object.keys(PARKING_MESSAGES.zh).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(PARKING_MESSAGES[locale]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(text(locale, key), `${locale} ${key}`).not.toBe('');
        expect(params(text(locale, key)), `${locale} ${key}`).toEqual(params(text('zh', key)));
      }
    }
  });

  it('names every page, menu group, rule, tier, space type and device', () => {
    const keys = [
      ...PARKING_PAGES.flatMap((p) => [`page.${p}.title`, `page.${p}.desc`]),
      ...PARKING_GROUPS.map((g) => `group.${g.id}.title`),
      ...Object.keys(ALARM_RULES).map((r) => `rule.${r}`),
      ...ALARM_TIERS.map((t) => `tier.${t}`),
      ...BAY_TYPES.map((t) => `bayType.${t}`),
      ...DEVICE_KINDS.map((k) => `device.${k}`),
    ];
    for (const key of keys) expect(PARKING_MESSAGES.zh, key).toHaveProperty([key]);
  });
});

describe('parking terminology', () => {
  // 三种语言各用本国停车场行业的说法：日文参考国内的駐車場管制・コインパーキング製品
  const TERMS = {
    'app.name': { zh: '停车场管理演示', en: 'Parking Management Demo', ja: '駐車場管理デモ' },
    'group.operator.title': { zh: '运营方', en: 'Operator', ja: '運営者' },
    'group.driver.title': { zh: '司机', en: 'Driver', ja: 'ドライバー' },
    'page.availability.title': { zh: '车位实况', en: 'Space Availability', ja: '満空マップ' },
    'page.vehicles.title': { zh: '车辆进出', en: 'Entries and Exits', ja: '入出庫・車両' },
    'page.alerts.title': { zh: '异常告警', en: 'Alerts', ja: '異常アラート' },
    'page.reserve.title': { zh: '预约与导航', en: 'Reserve and Navigate', ja: '予約・誘導' },
    'page.analytics.title': { zh: '运营分析', en: 'Operations Analytics', ja: '運営分析' },
    'bayState.free': { zh: '空闲', en: 'Available', ja: '空車' },
    'bayState.occupied': { zh: '已占用', en: 'Occupied', ja: '駐車中' },
    'bayType.monthly': { zh: '月租车位', en: 'Monthly permit', ja: '月極' },
    'rule.unpaid-exit': { zh: '未缴费离场', en: 'Unpaid exit', ja: '不正出庫' },
    'rule.long-stay': { zh: '长时间停车', en: 'Long-term parking', ja: '長期駐車' },
    'rule.monthly-bay': {
      zh: '非月租车辆占用月租车位',
      en: 'Monthly space used without a permit',
      ja: '月極車室への無断駐車',
    },
    'device.bay-sensor': { zh: '车位传感器', en: 'Space sensor', ja: '車室センサー' },
    'device.lpr-camera': { zh: '车牌识别摄像头', en: 'License plate camera', ja: 'ナンバー認識カメラ' },
    'device.flap': { zh: '地锁', en: 'Parking lock', ja: 'ロック板' },
    'device.display': { zh: '余位显示屏', en: 'Availability sign', ja: '満空表示板' },
    'device.pay-station': { zh: '缴费机', en: 'Pay station', ja: '精算機' },
    // 处理流程与医院演示相同
    'state.open': { zh: '未处理', en: 'Open', ja: '未対応' },
    'state.acknowledged': { zh: '已确认', en: 'Acknowledged', ja: '確認済み' },
    'state.resolved': { zh: '已解决', en: 'Resolved', ja: '解決済み' },
  } as const;

  it('uses the agreed terms', () => {
    for (const [key, values] of Object.entries(TERMS)) {
      for (const locale of LOCALES) expect(text(locale, key), `${locale} ${key}`).toBe(values[locale]);
    }
  });

  it('does not borrow the Japanese terms in Chinese, or bay and alarm in English', () => {
    const banned = {
      zh: /满空|入出库|车室|精算|月极|报警|提醒/,
      en: /\bbays?\b|alarm|notice|licence|colour|centre|utilis/i,
      ja: /警報|通知|ベイ|スペース/,
    };
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(PARKING_MESSAGES[locale])) {
        expect(value, `${locale} ${key}`).not.toMatch(banned[locale]);
      }
    }
  });

  it('says the venue, plates and companies are fictional', () => {
    expect(text('ja', 'note.fictional')).toContain('架空');
    expect(text('en', 'note.fictional')).toMatch(/fictional/i);
    expect(text('zh', 'note.fictional')).toContain('虚构');
  });
});
