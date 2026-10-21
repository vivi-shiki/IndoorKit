import { expect, type Page } from '@playwright/test';
import '../src/parking/testing/hooks';

/** 停车场演示的页面，按侧栏里的两个业务视图分组 */
export const PARKING_GROUPS = {
  operator: ['availability', 'vehicles', 'alerts', 'analytics'],
  driver: ['reserve'],
} as const;
export const PARKING_PAGES = [...PARKING_GROUPS.operator, ...PARKING_GROUPS.driver] as const;
export type ParkingPage = (typeof PARKING_PAGES)[number];

export const PARKING_PRODUCT = { en: 'Parking Management Demo', zh: '停车场管理演示', ja: '駐車場管理デモ' };

export const PARKING_GROUP_TITLES = {
  operator: { en: 'Operator', zh: '运营方', ja: '運営者' },
  driver: { en: 'Driver', zh: '司机', ja: 'ドライバー' },
};

export const PARKING_TITLES: Record<ParkingPage, { en: string; zh: string; ja: string }> = {
  availability: { en: 'Space Availability', zh: '车位实况', ja: '満空マップ' },
  vehicles: { en: 'Entries and Exits', zh: '车辆进出', ja: '入出庫・車両' },
  alerts: { en: 'Alerts', zh: '异常告警', ja: '異常アラート' },
  analytics: { en: 'Operations Analytics', zh: '运营分析', ja: '運営分析' },
  reserve: { en: 'Reserve and Navigate', zh: '预约与导航', ja: '予約・誘導' },
};

/** 打开停车场演示的一个页面（可带 ?t=14:00 等参数）并等它就绪 */
export async function openParking(page: Page, name: ParkingPage, query = '') {
  await page.goto(`./#/parking/${name}${query ? `?${query}` : ''}`);
  await waitForParking(page, name);
}

export async function waitForParking(page: Page, name: ParkingPage) {
  await page.waitForFunction((n) => window.__parking?.page === n && window.__parking.ready === true, name, {
    timeout: 30_000,
  });
}

/** 轮询读取页面里的值，直到断言成立 */
export function pollParking<T>(page: Page, fn: () => T) {
  return expect.poll(() => page.evaluate(fn), { timeout: 20_000 });
}
