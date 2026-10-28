import CssBaseline from '@mui/material/CssBaseline';
import GlobalStyles from '@mui/material/GlobalStyles';
import { ThemeProvider } from '@mui/material/styles';
import { type ComponentType, useMemo } from 'react';
import { useThemeName } from '../app-theme';
import { MuseumApp } from '../museum';
import { AlertsPage } from '../pages/alerts';
import { AssetsPage } from '../pages/assets';
import { HomePage } from '../pages/home';
import { OccupancyPage } from '../pages/occupancy';
import { TrackingPage } from '../pages/tracking';
import { TrailPage } from '../pages/trail';
import { HospitalTwinPage } from '../pages/twin';
import { ParkingApp } from '../parking';
import { AppControls } from './controls';
import { HospitalLayout } from './hospital-layout';
import { cssVariables, muiTheme } from './mui-theme';
import { useHashRoute, useSettled } from './router';
import { type HospitalPage, type HospitalPageProps, routeKey } from './routes';

const HOSPITAL_PAGES: Record<HospitalPage, ComponentType<HospitalPageProps>> = {
  twin: HospitalTwinPage,
  assets: AssetsPage,
  tracking: TrackingPage,
  trail: TrailPage,
  alerts: AlertsPage,
  occupancy: OccupancyPage,
};

export function App() {
  const themeName = useThemeName();
  const theme = useMemo(() => muiTheme(themeName), [themeName]);
  const route = useHashRoute();
  const key = routeKey(route);
  // 上一页（地图、Worker）完全释放之后才挂载下一页
  const shown = useSettled(key, route);
  const Page = shown?.name === 'hospital' ? HOSPITAL_PAGES[shown.page] : null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <GlobalStyles styles={cssVariables} />
      {route.name === 'home' && shown && <HomePage />}
      {route.name === 'hospital' && (
        <HospitalLayout page={route.page}>
          {Page && shown?.name === 'hospital' && <Page key={key} query={shown.query} />}
        </HospitalLayout>
      )}
      {route.name === 'parking' && (
        <ParkingApp page={route.page} shown={shown?.name === 'parking' ? shown : null} routeKey={key} />
      )}
      {route.name === 'museum' && (
        <MuseumApp page={route.page} shown={shown?.name === 'museum' ? shown : null} routeKey={key} />
      )}
      <AppControls />
    </ThemeProvider>
  );
}
