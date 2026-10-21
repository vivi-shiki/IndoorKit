import type { CSSProperties } from 'react';
import './backdrop.css';
import { backdropLanes, laneMask } from './backdrop';
import { BACKDROP_THEMES } from './backdrop-icons';

/** 通道数按最大的屏幕估算，多出来的在窗口外被裁掉 */
const LANES = backdropLanes(48);
const MASKS = new Map(BACKDROP_THEMES.map((theme) => [theme, laneMask(theme)]));

/** 首页背后斜 45 度滚动的图标，纯装饰，不响应鼠标，也不进无障碍树 */
export function HomeBackdrop() {
  return (
    <div className="home-backdrop" data-testid="home-backdrop" aria-hidden="true">
      <div className="backdrop-field">
        {LANES.map((lane, i) => {
          const mask = MASKS.get(lane.theme)!;
          const style = {
            '--count': lane.theme.icons.length,
            maskImage: mask,
            WebkitMaskImage: mask,
            // 错开各条的起点，避免整排图标齐步走
            animationDelay: `${-((i * 7) % 11)}s`,
          } as CSSProperties;
          return (
            <div
              key={lane.id}
              className="backdrop-lane"
              data-icons={lane.theme.id}
              data-reverse={lane.reverse ? '' : undefined}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}
