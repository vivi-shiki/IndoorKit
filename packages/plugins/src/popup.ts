import { definePlugin } from '@indoorkit/core';

export interface PopupInput {
  id: string;
  coord: [number, number];
  /** 纯文本，不解析 HTML */
  text: string;
}

export interface PopupApi {
  open(popup: PopupInput): string;
  close(id: string): boolean;
  list(): string[];
}

/** 跟随地图移动的文字弹窗，挂在地图容器里 */
export const popupPlugin = definePlugin({
  name: 'popup',
  setup(ctx): PopupApi {
    const popups = new Map<string, { el: HTMLElement; coord: [number, number] }>();
    const place = (p: { el: HTMLElement; coord: [number, number] }) => {
      const { x, y } = ctx.map.project(p.coord);
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    };
    ctx.onMap('move', () => {
      for (const p of popups.values()) place(p);
    });
    ctx.track(
      popups,
      (all) => {
        for (const p of all.values()) p.el.remove();
        all.clear();
      },
      'popups',
    );
    const close = (id: string) => {
      const p = popups.get(id);
      if (!p) return false;
      p.el.remove();
      popups.delete(id);
      return true;
    };
    return {
      open({ id, coord, text }) {
        close(id);
        const el = document.createElement('div');
        el.className = 'indoor-popup';
        el.dataset.popupId = id;
        el.textContent = text;
        el.style.position = 'absolute';
        el.style.left = '0';
        el.style.top = '0';
        const popup = { el, coord };
        place(popup);
        ctx.map.getContainer().append(el);
        popups.set(id, popup);
        return id;
      },
      close,
      list: () => [...popups.keys()],
    };
  },
});
