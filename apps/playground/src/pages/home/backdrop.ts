import { BACKDROP_THEMES, type BackdropTheme } from './backdrop-icons';

/** 遮罩图里一格的边长；图标画在格子中间，上下各留出间隔 */
const ICON = 100;
/** 一格的高度和图标边长之比，backdrop.css 的 --tile 用同一个比例 */
export const PITCH = 1.8;
const CELL = ICON * PITCH;

export interface BackdropLane {
  /** React 的 key */
  id: string;
  theme: BackdropTheme;
  /** 偶数条往一个方向滚，奇数条反过来 */
  reverse: boolean;
}

/** 按主题轮流排出 count 条通道，相邻两条方向相反 */
export function backdropLanes(count: number): BackdropLane[] {
  return Array.from({ length: count }, (_, i) => {
    const theme = BACKDROP_THEMES[i % BACKDROP_THEMES.length]!;
    return { id: `${theme.id}-${i}`, theme, reverse: i % 2 === 1 };
  });
}

/**
 * 一条通道的遮罩：这个主题的图标从上到下各占一格，拼成一张可以纵向重复的图。
 * 通道用背景色加这张遮罩画出来，颜色因此跟着主题走。
 */
export function laneMask(theme: BackdropTheme): string {
  const cells = theme.icons
    .map(
      (icon, i) =>
        `<svg y="${i * CELL + (CELL - ICON) / 2}" width="${ICON}" height="${ICON}" viewBox="0 0 ${icon.size} ${icon.size}"><path d="${icon.d}"/></svg>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON} ${theme.icons.length * CELL}">${cells}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
