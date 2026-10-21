import './backdrop.css';
import { backdropLanes, laneMask } from './backdrop';

/** 行数按最大的屏幕估算，多出来的在窗口外被裁掉 */
const LANES = backdropLanes(48).map((lane) => ({ ...lane, mask: laneMask(lane.icon) }));

/** 首页背后斜 45 度滚动的图标，纯装饰，不响应鼠标，也不进无障碍树 */
export function HomeBackdrop() {
  return (
    <div className="home-backdrop" data-testid="home-backdrop" aria-hidden="true">
      <div className="backdrop-field">
        {LANES.map((lane, i) => (
          <div
            key={lane.id}
            className="backdrop-lane"
            data-icon={lane.icon.name}
            data-shade={lane.shade}
            data-reverse={lane.reverse ? '' : undefined}
            style={{
              maskImage: lane.mask,
              WebkitMaskImage: lane.mask,
              // 错开各行的起点，避免整排图标齐步走
              animationDelay: `${-((i * 7) % 11) / 4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
