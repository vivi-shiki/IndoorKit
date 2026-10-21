/** 停车场演示的页面和地址：#/parking/<page> */

/** 两个业务视图：运营方（满空、入出库、告警、分析）和司机（预约与导航），菜单按这个顺序分组 */
export const PARKING_GROUPS = [
  { id: 'operator', pages: ['availability', 'vehicles', 'alerts', 'analytics'] },
  { id: 'driver', pages: ['reserve'] },
] as const;

export type ParkingGroup = (typeof PARKING_GROUPS)[number]['id'];
export type ParkingPage = (typeof PARKING_GROUPS)[number]['pages'][number];
export const PARKING_PAGES: readonly ParkingPage[] = PARKING_GROUPS.flatMap((g) => g.pages);

export const parkingHref = (page: ParkingPage, query = '') => `#/parking/${page}${query ? `?${query}` : ''}`;

export const isParkingPage = (name: string | undefined): name is ParkingPage =>
  PARKING_PAGES.includes(name as ParkingPage);

/** 停车场页面组件收到的参数（如 ?t=09:30 从这个时刻开始模拟） */
export interface ParkingPageProps {
  query: URLSearchParams;
}
