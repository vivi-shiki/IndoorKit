import { type AnyPlugin, type IndoorMap, languageFallbacks } from '@indoorkit/core';
import type { Hospital, HospitalVenue } from '@indoorkit/hospital';
import { pickLabel } from '@indoorkit/imdf';
import type { FloorApi, VenueIndex, ZoneApi } from '@indoorkit/plugins';
import { type ReactNode, type RefObject, useEffect, useReducer, useRef, useState } from 'react';
import { loadVenue, placesOf } from '../adapters/venue';
import { createTrackedMap, FloorButtons, fitToStage, followAppSettings } from '../app/map';
import { trackTeardown } from '../app/teardown';
import { useLocale, usePageTitle, useT } from '../app-i18n';
import type { MessageKey } from '../i18n';
import { setHooks, type ViviTestHooks } from '../testing/hooks';
import { installMapHooks } from '../testing/map-hooks';

export { createTrackedMap, useMapEvent, useRefresh } from '../app/map';

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

/** 地图的加载状态，失败时可以重试 */
export interface MapLoad {
  state: 'loading' | 'ready' | 'failed';
  retry(): void;
}

/**
 * 在 stage 里的 .map 上创建地图。地图创建是异步的，就绪前返回 null。
 * 卸载时销毁地图（含插件的 Worker），并登记给路由，路由等它完成才挂载下一页。
 * 创建失败时 load.state 为 failed，retry() 销毁残留后重新创建。
 */
export function useMapPage<const P extends readonly AnyPlugin[]>(
  stageRef: RefObject<HTMLElement | null>,
  options: MapPageOptions<P>,
): [MapPage<P> | null, MapLoad] {
  const [page, setPage] = useState<MapPage<P> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  // 选项只在挂载时读一次；页面参数变化时路由会重新挂载页面
  const initial = useRef(options).current;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是重试时重新创建地图的触发条件
  useEffect(() => {
    setFailed(false);
    setPage(null);
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

      fitToStage(indoor, stage, venue.bounds);
      const map = indoor;
      cleanups.push(followAppSettings(map));

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
    const created = create().catch((error: unknown) => {
      console.error('[playground] failed to open page', error);
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      for (const cleanup of cleanups.reverse()) cleanup();
      trackTeardown(created.then(() => indoor?.destroy()));
    };
  }, [stageRef, initial, attempt]);

  const state = failed ? 'failed' : page ? 'ready' : 'loading';
  return [page, { state, retry }];
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
  load: MapLoad;
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
        <FloorButtons page={page} label={t('floor.label')} />
        <div className="venue-name" data-testid="venue-name">
          {page && pickLabel(page.venue.name, languageFallbacks(locale))}
        </div>
        {props.children}
        {props.load.state === 'loading' && (
          <div className="map-status" data-testid="map-status" role="status">
            {t('map.loading')}
          </div>
        )}
        {props.load.state === 'failed' && (
          <div className="map-status" data-testid="map-status" role="alert">
            <p>{t('map.failed')}</p>
            <button type="button" className="chip" onClick={props.load.retry}>
              {t('map.retry')}
            </button>
          </div>
        )}
        <button
          type="button"
          className="panel-toggle"
          data-testid="panel-toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {t(panelOpen ? 'panel.hide' : 'panel.show')}
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
