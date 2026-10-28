/** 地址栏 hash 与页面的对应关系；GitHub Pages 上只能用 hash 路由 */

import { isMuseumPage, MUSEUM_PAGES, type MuseumPage, museumHref } from '../museum/routes';
import { isParkingPage, PARKING_PAGES, type ParkingPage, parkingHref } from '../parking/routes';

/** 医院演示的两个业务视图，侧栏和手机菜单按这个顺序分组 */
export const HOSPITAL_GROUPS = [
  { id: 'efficiency', pages: ['assets'] },
  { id: 'people', pages: ['tracking', 'trail', 'alerts', 'occupancy'] },
] as const;

export type HospitalGroup = (typeof HOSPITAL_GROUPS)[number]['id'];
export type HospitalPage = (typeof HOSPITAL_GROUPS)[number]['pages'][number] | 'twin';
export const HOSPITAL_PAGES: readonly HospitalPage[] = HOSPITAL_GROUPS.flatMap((g) => g.pages);

export type Route =
  | { name: 'home' }
  | { name: 'hospital'; page: HospitalPage; query: URLSearchParams }
  | { name: 'parking'; page: ParkingPage; query: URLSearchParams }
  | { name: 'museum'; page: MuseumPage; query: URLSearchParams };

/** 医院演示的页面组件收到的参数（如 ?tags=500） */
export interface HospitalPageProps {
  query: URLSearchParams;
}

export const hospitalHref = (page: HospitalPage, query = '') =>
  `#/hospital/${page}${query ? `?${query}` : ''}`;

const isPage = (name: string | undefined): name is HospitalPage =>
  name === 'twin' || HOSPITAL_PAGES.includes(name as HospitalPage);

/**
 * 解析 hash。redirect 是应当替换到地址栏的规范地址：
 * 进入医院、停车场或博物馆演示直接打开第一个地图页；旧的 #/<page> 链接移到 #/hospital/<page>；其他地址回首页。
 */
export function parseRoute(hash: string): { route: Route; redirect?: string } {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const hospital = (page: HospitalPage, q: string): Route => ({
    name: 'hospital',
    page,
    query: new URLSearchParams(q),
  });
  if (parts.length === 0) return { route: { name: 'home' } };
  if (parts[0] === 'hospital') {
    if (parts.length === 2 && isPage(parts[1])) return { route: hospital(parts[1], query) };
    const first = HOSPITAL_PAGES[0]!;
    return { route: hospital(first, ''), redirect: hospitalHref(first) };
  }
  if (parts[0] === 'parking') {
    if (parts.length === 2 && isParkingPage(parts[1])) {
      return { route: { name: 'parking', page: parts[1], query: new URLSearchParams(query) } };
    }
    const first = PARKING_PAGES[0]!;
    return {
      route: { name: 'parking', page: first, query: new URLSearchParams() },
      redirect: parkingHref(first),
    };
  }
  if (parts[0] === 'museum') {
    if (parts.length === 2 && isMuseumPage(parts[1])) {
      return { route: { name: 'museum', page: parts[1], query: new URLSearchParams(query) } };
    }
    const first = MUSEUM_PAGES[0]!;
    return {
      route: { name: 'museum', page: first, query: new URLSearchParams() },
      redirect: museumHref(first),
    };
  }
  if (parts.length === 1 && isPage(parts[0])) {
    return { route: hospital(parts[0], query), redirect: hospitalHref(parts[0], query) };
  }
  return { route: { name: 'home' }, redirect: '#/' };
}

/** 页面或参数变了 key 就变，对应的页面整个重新挂载 */
export const routeKey = (route: Route) =>
  route.name === 'home' ? 'home' : `${route.name}/${route.page}?${route.query.toString()}`;
