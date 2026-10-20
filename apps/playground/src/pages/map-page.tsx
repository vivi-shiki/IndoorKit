import {
  type AnyPlugin,
  type CreateIndoorMapOptions,
  createIndoorMap,
  type IndoorEvents,
  type IndoorMap,
  languageFallbacks,
  themes,
} from '@indoorkit/core';
import type { Hospital, HospitalVenue } from '@indoorkit/hospital';
import { pickLabel } from '@indoorkit/imdf';
import type { FloorApi, VenueIndex, ZoneApi } from '@indoorkit/plugins';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { loadVenue, placesOf } from '../adapters/venue';
import { trackTeardown } from '../app/teardown';
import { i18n, useLocale, usePageTitle, useT } from '../app-i18n';
import { appTheme } from '../app-theme';
import type { MessageKey } from '../i18n';
import { throttle } from '../presentation/ui';
import { setHooks, stats, type ViviTestHooks } from '../testing/hooks';
import { installMapHooks } from '../testing/map-hooks';

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

export interface MapPageOptions<P extends readonly AnyPlugin[]> {
  demo: ViviTestHooks['demo'];
  plugins: (venue: HospitalVenue) => P;
  /** 打开时所在楼层 */
  floor?: string;
  /**
   * 页面何时算就绪。默认等地图第一次 idle；实时数据页的地图会一直重绘、不会 idle，
   * 改为等第一批位置画出来。manual：页面自己设置 hooks.ready。
   */
  readyWhen?: 'idle' | 'first-positions' | 'manual';
}

/** 地图就绪后交给页面的东西：地图、楼层、场馆查询和测试钩子 */
export interface MapPage<P extends readonly AnyPlugin[]> {
  indoor: IndoorMap<P>;
  floor: FloorApi;
  venue: HospitalVenue;
  index: VenueIndex;
  hospital: Hospital;
  hooks: ViviTestHooks;
}

/**
 * 在 stage 里的 .map 上创建地图。地图创建是异步的，就绪前返回 null。
 * 卸载时销毁地图（含插件的 Worker），并登记给路由，路由等它完成才挂载下一页。
 */
export function useMapPage<const P extends readonly AnyPlugin[]>(
  stageRef: RefObject<HTMLElement | null>,
  options: MapPageOptions<P>,
): MapPage<P> | null {
  const [page, setPage] = useState<MapPage<P> | null>(null);
  // 选项只在挂载时读一次；页面参数变化时路由会重新挂载页面
  const initial = useRef(options).current;

  useEffect(() => {
    const stage = stageRef.current!;
    const hooks = setHooks({ demo: initial.demo });
    let disposed = false;
    let indoor: IndoorMap<P> | undefined;
    const cleanups: (() => void)[] = [];

    const create = async () => {
      const venue = await loadVenue();
      if (disposed) return;
      indoor = await createTrackedMap({
        container: stage.querySelector<HTMLElement>('.map')!,
        venue,
        plugins: initial.plugins(venue),
      });
      if (disposed) return;
      const floor = indoor.plugin<FloorApi>('floor');
      if (initial.floor) floor.set(initial.floor);

      // 场馆放在面板和按钮之外的空白里，留白按实际布局计算
      const panel = stage.querySelector<HTMLElement>('.panel');
      const toggle = stage.querySelector<HTMLElement>('.panel-toggle');
      if (panel && toggle) {
        const shown = (el: HTMLElement) => getComputedStyle(el).display !== 'none';
        const box = stage.getBoundingClientRect();
        indoor.camera.fit(venue.bounds, {
          padding: {
            top: shown(toggle) ? toggle.getBoundingClientRect().bottom - box.top + 16 : 48,
            bottom: 72,
            left: shown(panel) ? panel.getBoundingClientRect().right - box.left + 16 : 24,
            right: 88,
          },
          durationMs: 0,
        });
      }

      // 地图内的标注随语言和主题一起切换，不重建地图
      const map = indoor;
      cleanups.push(
        i18n.subscribe(() => {
          const languages = languageFallbacks(i18n.locale);
          if (map.languages[0] !== languages[0]) map.setLanguages(languages);
        }),
        appTheme.subscribe((name) => map.setTheme(themes[name])),
      );

      // 科室范围由医院业务给出，地图上用 SDK 的区域插件画
      const { index, hospital } = placesOf(venue);
      if (indoor.hasPlugin('zone')) {
        const zone = indoor.plugin<ZoneApi>('zone');
        hooks.departmentIdOf = (code) => hospital.departmentByCode(code).id;
        hooks.highlightedDepartment = () => zone.highlighted();
        hooks.departmentLayerVisible = () => zone.visible();
      }
      hooks.floor = () => floor.current().shortName.en ?? '';
      hooks.levelIdOf = (short) => floor.resolve(short).id;
      installMapHooks(indoor, venue, hooks);

      const ready = () => {
        hooks.ready = true;
      };
      if (initial.readyWhen === 'first-positions') {
        const off = indoor.events.on('positions:update', () => {
          off();
          void map.rendered().then(ready);
        });
      } else if (initial.readyWhen !== 'manual') {
        void indoor.idle().then(ready);
      }
      setPage({ indoor, floor, venue, index, hospital, hooks });
    };
    // 一次挂载失败要报出来，但不能卡住之后的导航
    const created = create().catch((error: unknown) =>
      console.error('[playground] failed to open page', error),
    );

    return () => {
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
      trackTeardown(created.then(() => indoor?.destroy()));
    };
  }, [stageRef, initial]);

  return page;
}

/** 订阅地图事件；处理函数总是读到最新的状态 */
export function useMapEvent<K extends keyof IndoorEvents>(
  page: MapPage<readonly AnyPlugin[]> | null,
  type: K,
  handler: (payload: IndoorEvents[K]) => void,
) {
  const onEvent = useEffectEvent(handler);
  useEffect(() => page?.indoor.events.on(type, (payload) => onEvent(payload)), [page, type]);
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

/** 右侧楼层按钮 */
function Floors({ page }: { page: MapPage<readonly AnyPlugin[]> | null }) {
  const t = useT();
  const [, refresh] = useReducer((v: number) => v + 1, 0);
  useMapEvent(page, 'floor:change', refresh);
  return (
    <fieldset className="floors" aria-label={t('floor.label')}>
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

/**
 * 地图页的公共布局：标题栏（标题、说明和页面控件）、地图、楼层按钮、场馆名和手机端的列表按钮。
 * 列表面板桌面端常驻左侧；手机端收在按钮后面，点开后是底部抽屉。
 */
export function MapPageLayout(props: {
  title: MessageKey;
  /** 标题下的一句说明 */
  desc: MessageKey;
  stageRef: RefObject<HTMLDivElement | null>;
  page: MapPage<readonly AnyPlugin[]> | null;
  /** 标题栏里的指标和控件 */
  controls: ReactNode;
  /** 地图上方的叠加面板 */
  children: ReactNode;
}) {
  const t = useT();
  const locale = useLocale();
  usePageTitle(props.title);
  const [panelOpen, setPanelOpen] = useState(false);
  const { page } = props;
  return (
    <>
      <header className="bar">
        <div className="bar-title">
          <h1>{t(props.title)}</h1>
          <p className="page-desc" data-testid="page-desc">
            {t(props.desc)}
          </p>
        </div>
        {props.controls}
      </header>
      <div className="stage" ref={props.stageRef} data-panel-open={panelOpen ? '' : undefined}>
        <div className="map" />
        <Floors page={page} />
        <div className="venue-name" data-testid="venue-name">
          {page && pickLabel(page.venue.name, languageFallbacks(locale))}
        </div>
        {props.children}
        <button
          type="button"
          className="panel-toggle"
          data-testid="panel-toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {t('panel.toggle')}
        </button>
      </div>
    </>
  );
}

/** 楼层简称，如 3F */
export const floorName = (floor: FloorApi, levelId: string) => {
  const level = floor.resolve(levelId);
  return level.shortName.en ?? level.id;
};
