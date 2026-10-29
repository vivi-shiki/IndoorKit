import { placeLabels } from '@indoorkit/core';
import type { TwinApi } from '@indoorkit/core/twin';
import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import { useEffect, useRef } from 'react';

/**
 * 楼栋标签跟着镜头走：每帧取屋顶上方的屏幕坐标，按高度排优先级避让。
 * 直接改 DOM，不经过 React 状态，避免每帧重新渲染。
 */
export function TwinLabels({ api, venue, locale }: { api: TwinApi; venue: VenueModel; locale: string }) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const heights = new Map(api.buildings().map((b) => [b.id, b.height]));
    const draw = () => {
      const root = layer.current;
      if (!root) return;
      const focused = api.snapshot().focused;
      const labels = api.labels();
      const element = (id: string) => root.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
      const shown = placeLabels(
        labels
          .filter((l) => l.visible)
          .map((l) => ({
            id: l.id,
            x: l.x,
            y: l.y,
            width: element(l.id).offsetWidth,
            height: element(l.id).offsetHeight,
            priority: l.id === focused ? Infinity : (heights.get(l.id) ?? 0),
          })),
        { width: root.clientWidth, height: root.clientHeight },
      );
      for (const l of labels) {
        const el = element(l.id);
        el.style.transform = `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, -100%)`;
        el.style.visibility = shown.has(l.id) ? 'visible' : 'hidden';
        el.toggleAttribute('data-focused', l.id === focused);
      }
    };
    draw();
    return api.onFrame(draw);
  }, [api]);
  return (
    <div className="twin-labels" ref={layer}>
      {api.buildings().map((b) => {
        const building = venue.buildings.find((v) => v.id === b.id);
        return (
          <button
            type="button"
            key={b.id}
            data-id={b.id}
            data-testid={`twin-label-${b.id}`}
            className="twin-label"
            onClick={() => api.focus(b.id)}
          >
            {building ? pickLabel(building.name, [locale, 'en']) : b.node}
          </button>
        );
      })}
    </div>
  );
}
