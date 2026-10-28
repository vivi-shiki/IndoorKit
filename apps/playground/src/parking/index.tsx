import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import InsightsIcon from '@mui/icons-material/Insights';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import type { ComponentType, ReactNode } from 'react';
import { ScenarioLayout } from '../app/scenario-layout';
import { TWIN_MESSAGES } from '../app/twin/messages';
import { useLocale } from '../app-i18n';
import { useParkingT } from './i18n';
import { AlertsPage } from './pages/alerts';
import { AnalyticsPage } from './pages/analytics';
import { AvailabilityPage } from './pages/availability';
import { ReservePage } from './pages/reserve';
import { ParkingTwinPage } from './pages/twin';
import { VehiclesPage } from './pages/vehicles';
import { PARKING_GROUPS, type ParkingPage, type ParkingPageProps, parkingHref } from './routes';
import './parking.css';

const PAGES: Record<ParkingPage, ComponentType<ParkingPageProps>> = {
  twin: ParkingTwinPage,
  availability: AvailabilityPage,
  vehicles: VehiclesPage,
  alerts: AlertsPage,
  analytics: AnalyticsPage,
  reserve: ReservePage,
};

const ICONS: Record<ParkingPage, ReactNode> = {
  twin: <LocalParkingIcon />,
  availability: <LocalParkingIcon />,
  vehicles: <SwapHorizIcon />,
  alerts: <NotificationsActiveIcon />,
  analytics: <InsightsIcon />,
  reserve: <EventAvailableIcon />,
};

/**
 * 停车场演示：运营方和司机两个视图的菜单，加上当前页面。
 * 路由只挂载这个组件；停车场的页面、数据和文案都在 parking/ 里，不碰医院演示。
 */
export function ParkingApp(props: {
  page: ParkingPage;
  /** 上一页释放完之后才有，之前为 null */
  shown: { page: ParkingPage; query: URLSearchParams } | null;
  routeKey: string;
}) {
  const t = useParkingT();
  const locale = useLocale();
  const groups = PARKING_GROUPS.map((group) => ({
    id: group.id,
    title: t(`group.${group.id}.title`),
    pages: group.pages.map((p) => ({
      id: p,
      href: parkingHref(p),
      title: t(`page.${p}.title`),
      icon: ICONS[p],
    })),
  }));
  const Page = props.shown ? PAGES[props.shown.page] : null;
  return (
    <ScenarioLayout
      product={t('app.name')}
      featureLink={{ href: parkingHref('twin'), title: TWIN_MESSAGES[locale].title }}
      labels={{ home: t('nav.home'), menu: t('nav.menu'), nav: t('nav.label') }}
      groups={groups}
      current={props.page}
      menuId="parking-menu"
    >
      {Page && props.shown && <Page key={props.routeKey} query={props.shown.query} />}
    </ScenarioLayout>
  );
}
