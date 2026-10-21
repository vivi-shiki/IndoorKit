/** 博物馆演示的页面和地址：#/museum/<page> */

/** 三个业务视图：学芸员（保存环境、藏品）、运营与警备（客流、安防）、来馆者（导览），菜单按这个顺序分组 */
export const MUSEUM_GROUPS = [
  { id: 'curator', pages: ['environment', 'collection'] },
  { id: 'operations', pages: ['visitors', 'security'] },
  { id: 'visitor', pages: ['guide'] },
] as const;

export type MuseumGroup = (typeof MUSEUM_GROUPS)[number]['id'];
export type MuseumPage = (typeof MUSEUM_GROUPS)[number]['pages'][number];
export const MUSEUM_PAGES: readonly MuseumPage[] = MUSEUM_GROUPS.flatMap((g) => g.pages);

export const museumHref = (page: MuseumPage, query = '') => `#/museum/${page}${query ? `?${query}` : ''}`;

export const isMuseumPage = (name: string | undefined): name is MuseumPage =>
  MUSEUM_PAGES.includes(name as MuseumPage);

/** 博物馆页面组件收到的参数（如 ?t=21:00 从这个时刻开始模拟） */
export interface MuseumPageProps {
  query: URLSearchParams;
}
