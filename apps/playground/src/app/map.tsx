import {
  type AnyPlugin,
  type CreateIndoorMapOptions,
  createIndoorMap,
  type IndoorEvents,
  type IndoorMap,
  languageFallbacks,
  themes,
} from '@indoorkit/core';
import type { FloorApi } from '@indoorkit/plugins';
import { useEffect, useEffectEvent, useMemo, useReducer } from 'react';
import { i18n } from '../app-i18n';
import { appTheme } from '../app-theme';
import { stats } from '../testing/hooks';

/**
 * 各场景地图页共用的部分：创建并统计地图、跟随语言和主题、订阅地图事件、限频重画和楼层按钮。
 * 这里不认识任何场景的业务，医院和停车场的页面都从这里取。
 */

/** 创建地图并计入全局统计；销毁后记录未释放资源数 */
export async function createTrackedMap<const P extends readonly AnyPlugin[]>(
  options: CreateIndoorMapOptions<P>,
): Promise<IndoorMap<P>> {
  const indoor = await createIndoorMap({
    ...options,
    languages: options.languages ?? languageFallbacks(i18n.locale),
    theme: options.theme ?? themes[appTheme.value],
  });
  stats().liveMaps++;
  const destroy = indoor.destroy;
  let counted = false;
  indoor.destroy = async () => {
    try {
      await destroy();
    } finally {
      if (!counted) {
        counted = true;
        stats().liveMaps--;
        stats().lastUnreleased = indoor.resources.size;
      }
    }
  };
  return indoor;
}

/** 地图内的标注随语言和主题一起切换，不重建地图；返回取消订阅 */
export function followAppSettings(indoor: IndoorMap<readonly AnyPlugin[]>) {
  const offs = [
    i18n.subscribe(() => {
      const languages = languageFallbacks(i18n.locale);
      if (indoor.languages[0] !== languages[0]) indoor.setLanguages(languages);
    }),
    appTheme.subscribe((name) => indoor.setTheme(themes[name])),
  ];
  return () => {
    for (const off of offs) off();
  };
}

/** 把场馆放进 stage 里面板和按钮之外的空白，留白按实际布局计算 */
export function fitToStage(
  indoor: IndoorMap<readonly AnyPlugin[]>,
  stage: HTMLElement,
  bounds: [[number, number], [number, number]],
) {
  const panel = stage.querySelector<HTMLElement>('.panel');
  const toggle = stage.querySelector<HTMLElement>('.panel-toggle');
  if (!panel || !toggle) return;
  const shown = (el: HTMLElement) => getComputedStyle(el).display !== 'none';
  const box = stage.getBoundingClientRect();
  indoor.camera.fit(bounds, {
    padding: {
      top: shown(toggle) ? toggle.getBoundingClientRect().bottom - box.top + 16 : 48,
      bottom: 72,
      left: shown(panel) ? panel.getBoundingClientRect().right - box.left + 16 : 24,
      right: 88,
    },
    durationMs: 0,
  });
}

/** 有地图的页面：就绪前为 null */
export interface WithMap {
  indoor: IndoorMap<readonly AnyPlugin[]>;
}

/** 订阅地图事件；处理函数总是读到最新的状态 */
export function useMapEvent<K extends keyof IndoorEvents>(
  page: WithMap | null,
  type: K,
  handler: (payload: IndoorEvents[K]) => void,
) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => page?.indoor.events.on(type, (payload) => onEvent(payload)), [page, type]);
}

/** 至少隔 ms 毫秒才执行一次，用来限制列表重画频率 */
export function throttle(fn: () => void, ms: number) {
  let last = -Infinity;
  return (force = false) => {
    const now = performance.now();
    if (!force && now - last < ms) return;
    last = now;
    fn();
  };
}

/**
 * 限频重画：实时数据每秒更新，列表最多每 ms 毫秒重画一次。
 * 返回值变化时组件重新渲染并读取插件里的最新数据；refresh(true) 立即重画。
 */
export function useRefresh(ms: number) {
  const [version, bump] = useReducer((v: number) => v + 1, 0);
  const refresh = useMemo(() => throttle(bump, ms), [ms]);
  return [version, refresh] as const;
}

/** 右侧楼层按钮，从高到低 */
export function FloorButtons(props: { page: (WithMap & { floor: FloorApi }) | null; label: string }) {
  const { page } = props;
  const [, refresh] = useReducer((v: number) => v + 1, 0);
  useMapEvent(page, 'floor:change', refresh);
  return (
    <fieldset className="floors" aria-label={props.label}>
      {page &&
        [...page.floor.list()].reverse().map((level) => (
          <button
            key={level.id}
            type="button"
            aria-pressed={level.id === page.floor.current().id}
            onClick={() => page.floor.set(level.id)}
          >
            {level.shortName.en ?? level.id}
          </button>
        ))}
    </fieldset>
  );
}
