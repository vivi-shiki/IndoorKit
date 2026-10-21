import { BACKDROP_THEMES, type BackdropIcon } from './backdrop-icons';

/** 遮罩图里图标的边长；图标画在格子中间，上下各留出间隔 */
const ICON = 100;
/** 一格的高度和图标边长之比，backdrop.css 的 --tile 用同一个比例 */
export const PITCH = 1.8;
const CELL = ICON * PITCH;

/** 所有图标排成一列：每个主题轮流出一个，相邻两行因此不是同一类东西 */
export const BACKDROP_ICONS: readonly BackdropIcon[] = Array.from(
  { length: Math.max(...BACKDROP_THEMES.map((t) => t.icons.length)) },
  (_, round) => BACKDROP_THEMES.flatMap((t) => t.icons[round] ?? []),
).flat();

export interface BackdropLane {
  /** React 的 key */
  id: string;
  /** 这一行从头到尾只有这一种图标 */
  icon: BackdropIcon;
  /** 偶数行往一个方向滚，奇数行反过来 */
  reverse: boolean;
  /** 偶数行和奇数行的灰度略有不同 */
  shade: 'base' | 'alt';
}

/** 依次排出 count 行，所有图标都轮过一遍再从头开始 */
export function backdropLanes(count: number): BackdropLane[] {
  return Array.from({ length: count }, (_, i) => {
    const icon = BACKDROP_ICONS[i % BACKDROP_ICONS.length]!;
    const odd = i % 2 === 1;
    return { id: `${icon.name}-${i}`, icon, reverse: odd, shade: odd ? 'alt' : 'base' };
  });
}

/**
 * 一行的遮罩：一个图标放在比它高的格子中间，纵向重复。
 * 行用背景色加这张遮罩画出来，颜色因此跟着主题走。
 */
export function laneMask(icon: BackdropIcon): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ICON} ${CELL}"><svg y="${(CELL - ICON) / 2}" width="${ICON}" height="${ICON}" viewBox="0 0 ${icon.size} ${icon.size}"><path d="${icon.d}"/></svg></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
