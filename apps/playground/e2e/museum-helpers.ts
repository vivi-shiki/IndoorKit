import { expect, type Page } from '@playwright/test';
import '../src/museum/testing/hooks';

/** 博物馆演示的页面，按侧栏里的三个业务视图分组 */
export const MUSEUM_GROUPS = {
  curator: ['environment', 'collection'],
  operations: ['visitors', 'security'],
  visitor: ['guide'],
} as const;
export const MUSEUM_PAGES = [
  ...MUSEUM_GROUPS.curator,
  ...MUSEUM_GROUPS.operations,
  ...MUSEUM_GROUPS.visitor,
] as const;
export type MuseumPage = (typeof MUSEUM_PAGES)[number];

export const MUSEUM_PRODUCT = {
  en: 'Museum Operations Demo',
  zh: '博物馆管理演示',
  ja: 'ミュージアム管理デモ',
};

export const MUSEUM_GROUP_TITLES = {
  curator: { en: 'Curator', zh: '策展与藏品管理', ja: '学芸員' },
  operations: { en: 'Operations & Security', zh: '运营与安保', ja: '運営・警備' },
  visitor: { en: 'Visitor', zh: '观众', ja: '来館者' },
};

export const MUSEUM_TITLES: Record<MuseumPage, { en: string; zh: string; ja: string }> = {
  environment: { en: 'Environmental Monitoring', zh: '保存环境', ja: '保存環境' },
  collection: { en: 'Collection & Light Exposure', zh: '藏品与光照', ja: '収蔵品・露光管理' },
  visitors: { en: 'Visitors & Crowding', zh: '观众与客流', ja: '来館者・混雑' },
  security: { en: 'Security & Patrols', zh: '安防与巡逻', ja: '警備・巡回' },
  guide: { en: 'Visitor Guide', zh: '参观导览', ja: '館内ガイド' },
};

/** 打开博物馆演示的一个页面（可带 ?t=14:00 等参数）并等它就绪 */
export async function openMuseum(page: Page, name: MuseumPage, query = '') {
  await page.goto(`./#/museum/${name}${query ? `?${query}` : ''}`);
  await waitForMuseum(page, name);
}

export async function waitForMuseum(page: Page, name: MuseumPage) {
  await page.waitForFunction((n) => window.__museum?.page === n && window.__museum.ready === true, name, {
    timeout: 30_000,
  });
}

/** 轮询读取页面里的值，直到断言成立 */
export function pollMuseum<T>(page: Page, fn: () => T) {
  return expect.poll(() => page.evaluate(fn), { timeout: 20_000 });
}
