import { createTheme } from '@mui/material/styles';
import type { ThemeName } from '../theme';

/**
 * 两套主题的颜色只写在这里：MUI 的调色板用它，地图浮层的 CSS 变量（style.css）也由它生成。
 * 白字在强调色上需要 4.5:1 以上的对比度；链接色取自 GitHub Primer 的 fgColor-accent。
 */
export const TOKENS = {
  light: {
    bg: '#f4f6f8',
    fg: '#1f2933',
    muted: '#5b6876',
    accent: '#2563eb',
    card: '#ffffff',
    border: '#d9dee5',
    link: '#0969da',
    danger: '#b91c1c',
    // 首页背景图标：浅色主题是淡淡的黑色
    ink: 'rgba(0, 0, 0, 0.09)',
  },
  dark: {
    bg: '#0d1117',
    fg: '#e6edf3',
    muted: '#9aa7b4',
    accent: '#2563eb',
    card: '#161b22',
    border: '#30363d',
    link: '#4493f8',
    danger: '#f87171',
    // 深色背景上黑色看不见，改成淡淡的白色
    ink: 'rgba(230, 237, 243, 0.07)',
  },
} as const satisfies Record<ThemeName, Record<string, string>>;

export const FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** CSS 变量 --bg、--fg …，按 data-theme 切换 */
export const cssVariables = Object.fromEntries(
  Object.entries(TOKENS).map(([name, tokens]) => [
    name === 'light' ? ':root' : `:root[data-theme="${name}"]`,
    Object.fromEntries(Object.entries(tokens).map(([key, value]) => [`--${key}`, value])),
  ]),
);

export function muiTheme(name: ThemeName) {
  const c = TOKENS[name];
  return createTheme({
    palette: {
      mode: name,
      primary: { main: c.accent },
      error: { main: c.danger },
      background: { default: c.bg, paper: c.card },
      text: { primary: c.fg, secondary: c.muted },
      divider: c.border,
    },
    typography: { fontFamily: FONT_FAMILY, button: { textTransform: 'none' } },
    shape: { borderRadius: 8 },
    // MUI 的链接默认用 primary，暗色下对比度不够；改用两套主题各自的链接色
    components: {
      MuiLink: { styleOverrides: { root: { color: c.link, textDecorationColor: 'currentColor' } } },
    },
    // 侧栏、首页和地图页共用 640px 断点：以下是手机布局
    breakpoints: { values: { xs: 0, sm: 641, md: 900, lg: 1200, xl: 1536 } },
  });
}
