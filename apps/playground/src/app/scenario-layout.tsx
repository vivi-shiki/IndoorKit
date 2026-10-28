import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
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

const SIDEBAR_WIDTH = 248;

/** 菜单里的一个业务视图和它的页面；文字已按当前语言翻译 */
export interface NavGroup {
  id: string;
  title: string;
  pages: { id: string; href: string; title: string; icon: ReactNode }[];
}

export interface ScenarioLayoutProps {
  /** 演示名称，显示在菜单顶部和手机顶栏 */
  product: string;
  /** 返回首页、菜单按钮和菜单的读屏名称 */
  labels: { home: string; menu: string; nav: string };
  groups: readonly NavGroup[];
  current: string;
  /** 手机端菜单的元素 id */
  menuId: string;
  children: ReactNode;
  featureLink?: { href: string; title: string };
}

/** 演示的菜单：业务视图各自列出页面；点一项只换地图区域的内容 */
function ScenarioNav({
  current,
  onNavigate,
  product,
  labels,
  groups,
  featureLink,
}: Pick<ScenarioLayoutProps, 'current' | 'product' | 'labels' | 'groups' | 'featureLink'> & {
  onNavigate?: () => void;
}) {
  return (
    <>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Link
          href="#/"
          className="back"
          data-testid="home-link"
          aria-label={labels.home}
          title={labels.home}
          underline="hover"
          onClick={onNavigate}
        >
          ← IndoorKit
        </Link>
        <Typography className="nav-product" data-testid="nav-product" sx={{ mt: 0.5, fontWeight: 700 }}>
          {product}
        </Typography>
      </Box>
      <List component="nav" aria-label={labels.nav} dense>
        {featureLink && (
          <ListItemButton
            component="a"
            href={featureLink.href}
            data-testid="twin-nav"
            selected={current === 'twin'}
            onClick={onNavigate}
            sx={{ mx: 1, borderRadius: 1, border: '1px solid', borderColor: 'divider', mb: 1 }}
          >
            <ListItemText primary={`◈  ${featureLink.title}`} />
          </ListItemButton>
        )}
        {groups.map((group) => (
          <li key={group.id}>
            <ul style={{ padding: 0 }}>
              <ListSubheader data-testid="nav-group" sx={{ lineHeight: '36px', bgcolor: 'transparent' }}>
                {group.title}
              </ListSubheader>
              {group.pages.map((page) => (
                <ListItemButton
                  key={page.id}
                  component="a"
                  href={page.href}
                  data-testid="nav-link"
                  selected={page.id === current}
                  aria-current={page.id === current ? 'page' : undefined}
                  onClick={onNavigate}
                  sx={{ mx: 1, borderRadius: 1 }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>{page.icon}</ListItemIcon>
                  <ListItemText primary={page.title} />
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
 * 演示的外框：桌面端左侧常驻侧栏，手机端顶栏加菜单按钮（菜单从顶部展开）。
 * 页面本身（标题栏和地图）放在右侧 / 下方，换页时外框不重建。医院和停车场共用。
 */
export function ScenarioLayout(props: ScenarioLayoutProps) {
  const { labels, menuId, children } = props;
  const nav = {
    current: props.current,
    product: props.product,
    labels,
    groups: props.groups,
    featureLink: props.featureLink,
  };
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
          <ScenarioNav {...nav} />
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
                aria-label={labels.menu}
                aria-expanded={menuOpen}
                aria-controls={menuId}
                data-testid="nav-menu-button"
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {menuOpen ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
              <Typography component="p" sx={{ fontWeight: 700 }} noWrap>
                {props.product}
              </Typography>
            </Toolbar>
          </AppBar>
        )}
        {!desktop && (
          <Drawer
            anchor="top"
            open={menuOpen}
            onClose={closeMenu}
            id={menuId}
            data-testid="nav-top-menu"
            slotProps={{ paper: { sx: { pb: 1 } } }}
          >
            <ScenarioNav {...nav} onNavigate={closeMenu} />
          </Drawer>
        )}
        <Box className="page" sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
