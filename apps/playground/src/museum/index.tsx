import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import GroupsIcon from '@mui/icons-material/Groups';
import PaletteIcon from '@mui/icons-material/Palette';
import ShieldIcon from '@mui/icons-material/Shield';
import ThermostatIcon from '@mui/icons-material/Thermostat';
import type { ComponentType, ReactNode } from 'react';
import { ScenarioLayout } from '../app/scenario-layout';
import { TWIN_MESSAGES } from '../app/twin/messages';
import { useLocale } from '../app-i18n';
import { useMuseumT } from './i18n';
import { CollectionPage } from './pages/collection';
import { EnvironmentPage } from './pages/environment';
import { GuidePage } from './pages/guide';
import { SecurityPage } from './pages/security';
import { MuseumTwinPage } from './pages/twin';
import { VisitorsPage } from './pages/visitors';
import { MUSEUM_GROUPS, type MuseumPage, type MuseumPageProps, museumHref } from './routes';
import './museum.css';

const PAGES: Record<MuseumPage, ComponentType<MuseumPageProps>> = {
  twin: MuseumTwinPage,
  environment: EnvironmentPage,
  collection: CollectionPage,
  visitors: VisitorsPage,
  security: SecurityPage,
  guide: GuidePage,
};

const ICONS: Record<MuseumPage, ReactNode> = {
  twin: <PaletteIcon />,
  environment: <ThermostatIcon />,
  collection: <PaletteIcon />,
  visitors: <GroupsIcon />,
  security: <ShieldIcon />,
  guide: <AutoStoriesIcon />,
};

/**
 * 博物馆演示：学芸员、运营与警备、来馆者三个视图的菜单，加上当前页面。
 * 路由只挂载这个组件；博物馆的页面、数据和文案都在 museum/ 里，不碰医院和停车场演示。
 */
export function MuseumApp(props: {
  page: MuseumPage;
  /** 上一页释放完之后才有，之前为 null */
  shown: { page: MuseumPage; query: URLSearchParams } | null;
  routeKey: string;
}) {
  const t = useMuseumT();
  const locale = useLocale();
  const groups = MUSEUM_GROUPS.map((group) => ({
    id: group.id,
    title: t(`group.${group.id}.title`),
    pages: group.pages.map((p) => ({
      id: p,
      href: museumHref(p),
      title: t(`page.${p}.title`),
      icon: ICONS[p],
    })),
  }));
  const Page = props.shown ? PAGES[props.shown.page] : null;
  return (
    <ScenarioLayout
      product={t('app.name')}
      featureLink={{ href: museumHref('twin'), title: TWIN_MESSAGES[locale].title }}
      labels={{ home: t('nav.home'), menu: t('nav.menu'), nav: t('nav.label') }}
      groups={groups}
      current={props.page}
      menuId="museum-menu"
    >
      {Page && props.shown && <Page key={props.routeKey} query={props.shown.query} />}
    </ScenarioLayout>
  );
}
