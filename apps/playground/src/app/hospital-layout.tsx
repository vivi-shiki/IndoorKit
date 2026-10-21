import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import MapIcon from '@mui/icons-material/Map';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RouteIcon from '@mui/icons-material/Route';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import type { ReactNode } from 'react';
import { useT } from '../app-i18n';
import type { MessageKey } from '../i18n';
import { HOSPITAL_GROUPS, type HospitalPage, hospitalHref } from './routes';
import { ScenarioLayout } from './scenario-layout';

const ICONS: Record<HospitalPage, ReactNode> = {
  assets: <DevicesOtherIcon />,
  tracking: <MapIcon />,
  trail: <RouteIcon />,
  alerts: <NotificationsActiveIcon />,
  occupancy: <WhatshotIcon />,
};

/** 医院演示的外框：两个业务视图（医疗设备、人员）的菜单 */
export function HospitalLayout({ page, children }: { page: HospitalPage; children: ReactNode }) {
  const t = useT();
  const groups = HOSPITAL_GROUPS.map((group) => ({
    id: group.id,
    title: t(`group.${group.id}.title` as MessageKey),
    pages: group.pages.map((p) => ({
      id: p,
      href: hospitalHref(p),
      title: t(`page.${p}.title`),
      icon: ICONS[p],
    })),
  }));
  return (
    <ScenarioLayout
      product={t('app.name')}
      labels={{ home: t('nav.home'), menu: t('nav.menu'), nav: t('nav.label') }}
      groups={groups}
      current={page}
      menuId="hospital-menu"
    >
      {children}
    </ScenarioLayout>
  );
}
