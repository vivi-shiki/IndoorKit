import CloseIcon from '@mui/icons-material/Close';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import MapIcon from '@mui/icons-material/Map';
import MenuIcon from '@mui/icons-material/Menu';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import RouteIcon from '@mui/icons-material/Route';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import { useTheme } from '@mui/material/styles';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { type ReactNode, useState } from 'react';
import { useT } from '../app-i18n';
import type { MessageKey } from '../i18n';
import { HOSPITAL_GROUPS, type HospitalPage, hospitalHref } from './routes';

const SIDEBAR_WIDTH = 248;

const ICONS: Record<HospitalPage, ReactNode> = {
  assets: <DevicesOtherIcon />,
  tracking: <MapIcon />,
  trail: <RouteIcon />,
  alerts: <NotificationsActiveIcon />,
  occupancy: <WhatshotIcon />,
};

/** 医院演示的菜单：两个业务视图，各自列出页面；点一项只换地图区域的内容 */
function HospitalNav({ current, onNavigate }: { current: HospitalPage; onNavigate?: () => void }) {
  const t = useT();
  return (
    <>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Link href="#/" className="back" data-testid="home-link" underline="hover" onClick={onNavigate}>
          ← IndoorKit
        </Link>
        <Typography className="nav-product" data-testid="nav-product" sx={{ mt: 0.5, fontWeight: 700 }}>
          {t('app.name')}
        </Typography>
      </Box>
      <List component="nav" aria-label={t('nav.label')} dense>
        {HOSPITAL_GROUPS.map((group) => (
          <li key={group.id}>
            <ul style={{ padding: 0 }}>
              <ListSubheader data-testid="nav-group" sx={{ lineHeight: '36px', bgcolor: 'transparent' }}>
                {t(`group.${group.id}.title` as MessageKey)}
              </ListSubheader>
              {group.pages.map((page) => (
                <ListItemButton
                  key={page}
                  component="a"
                  href={hospitalHref(page)}
                  data-testid="nav-link"
                  selected={page === current}
                  aria-current={page === current ? 'page' : undefined}
                  onClick={onNavigate}
                  sx={{ mx: 1, borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{ICONS[page]}</ListItemIcon>
                  <ListItemText primary={t(`page.${page}.title`)} />
                </ListItemButton>
              ))}
            </ul>
          </li>
        ))}
      </List>
    </>
  );
}

/**
 * 医院演示的外框：桌面端左侧常驻侧栏，手机端顶栏加菜单按钮（菜单从顶部展开）。
 * 页面本身（标题栏和地图）放在右侧 / 下方，换页时外框不重建。
 */
export function HospitalLayout({ page, children }: { page: HospitalPage; children: ReactNode }) {
  const t = useT();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('sm'), { noSsr: true });
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <Box sx={{ display: 'flex', height: '100dvh' }}>
      {desktop && (
        <Drawer
          variant="permanent"
          className="nav-sidebar"
          data-testid="nav-sidebar"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, boxSizing: 'border-box' },
          }}
        >
          <HospitalNav current={page} />
        </Drawer>
      )}
      <Box component="main" sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {!desktop && (
          <AppBar
            position="static"
            color="default"
            elevation={0}
            className="nav-appbar"
            data-testid="nav-appbar"
            sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}
          >
            <Toolbar variant="dense" sx={{ gap: 1, px: 1 }}>
              <IconButton
                edge="start"
                color="inherit"
                aria-label={t('nav.menu')}
                aria-expanded={menuOpen}
                aria-controls="hospital-menu"
                data-testid="nav-menu-button"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
              <Typography component="p" sx={{ fontWeight: 700 }} noWrap>
                {t('app.name')}
              </Typography>
            </Toolbar>
          </AppBar>
        )}
        {!desktop && (
          <Drawer
            anchor="top"
            open={menuOpen}
            onClose={closeMenu}
            id="hospital-menu"
            data-testid="nav-top-menu"
            slotProps={{ paper: { sx: { pb: 1 } } }}
          >
            <HospitalNav current={page} onNavigate={closeMenu} />
          </Drawer>
        )}
        <Box className="page" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
