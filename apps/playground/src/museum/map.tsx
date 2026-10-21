import { type AnyPlugin, type IndoorMap, languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import type { FloorApi } from '@indoorkit/plugins';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createTrackedMap, fitToStage, followAppSettings, useMapEvent } from '../app/map';
import { trackTeardown } from '../app/teardown';
import { useLocale } from '../app-i18n';
import { SPEEDS } from './adapters/clock';
import { loadMuseum, type MuseumContext } from './adapters/venue';
import { type MuseumKey, useMuseumT, useMuseumTitle } from './i18n';
import { clockText } from './presentation/format';
import { ChoiceChips } from './presentation/ui';
import type { MuseumPage } from './routes';
import { installMuseumMapHooks, type MuseumTestHooks, setMuseumHooks } from './testing/hooks';

export interface MuseumMapOptions<P extends readonly AnyPlugin[]> {
  page: MuseumPage;
  plugins: (ctx: MuseumContext) => P;
  /** 打开时所在楼层（简称） */
  floor: string;
  /** ?t=09:30：从这个时刻开始模拟 */
  startAt?: number;
}

/** 地图就绪后交给页面的东西：地图、楼层、博物馆数据和测试钩子 */
export interface MuseumMap<P extends readonly AnyPlugin[]> {
  indoor: IndoorMap<P>;
  floor: FloorApi;
  ctx: MuseumContext;
  hooks: MuseumTestHooks;
}

export interface MapLoad {
  state: 'loading' | 'ready' | 'failed';
  retry(): void;
}

/** 展示室或展示柜的编号 → 区块、楼层和中心 */
export function unitByCode(ctx: MuseumContext, code: string) {
  const { museum } = ctx;
  const c = museum.cases.find((x) => x.code === code);
  const u = c ?? museum.roomByCode(code);
  return { unitId: u.unitId, levelId: u.levelId, center: u.center };
}

/** 区块 id → 编号（展示柜或房间） */
export const codeOf = (ctx: MuseumContext, unitId: string) =>
  ctx.museum.isCase(unitId) ? ctx.museum.case(unitId).code : ctx.museum.room(unitId).code;

/**
 * 在 stage 里的 .map 上创建博物馆地图，就绪前返回 null。
 * 卸载时销毁地图（含数据源），并登记给路由，路由等它完成才挂载下一页。
 * 页面画完第一次状态后自己设置 hooks.ready。
 */
export function useMuseumMap<const P extends readonly AnyPlugin[]>(
  stageRef: RefObject<HTMLElement | null>,
  options: MuseumMapOptions<P>,
): [MuseumMap<P> | null, MapLoad] {
  const [page, setPage] = useState<MuseumMap<P> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  // 选项只在挂载时读一次；页面参数变化时路由会重新挂载页面
  const initial = useRef(options).current;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是重试时重新创建地图的触发条件
  useEffect(() => {
    setFailed(false);
    setPage(null);
    const stage = stageRef.current!;
    const hooks = setMuseumHooks(initial.page);
    let disposed = false;
    let indoor: IndoorMap<P> | undefined;
    const cleanups: (() => void)[] = [];

    const create = async () => {
      const ctx = await loadMuseum();
      if (disposed) return;
      if (initial.startAt !== undefined) ctx.clock.set(initial.startAt);
      indoor = await createTrackedMap({
        container: stage.querySelector<HTMLElement>('.map')!,
        venue: ctx.venue,
        plugins: initial.plugins(ctx),
        pitch: 30,
      });
      if (disposed) return;
      const floor = indoor.plugin<FloorApi>('floor');
      floor.set(initial.floor);
      fitToStage(indoor, stage, levelBounds(ctx, floor.current().id));
      cleanups.push(followAppSettings(indoor));

      hooks.time = ctx.clock.time;
      hooks.speed = ctx.clock.speed;
      hooks.floor = () => floor.current().shortName.en ?? '';
      installMuseumMapHooks(indoor, hooks, (code) => unitByCode(ctx, code), floor.set);
      setPage({ indoor, floor, ctx, hooks });
    };
    // 一次挂载失败要报出来，但不能卡住之后的导航
    const created = create().catch((error: unknown) => {
      console.error('[museum] failed to open page', error);
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

/** 一层上全部区块的外包矩形 */
function levelBounds(ctx: MuseumContext, levelId: string): [[number, number], [number, number]] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const u of ctx.venue.features.units.features) {
    if (u.properties.level_id !== levelId) continue;
    const rings = u.geometry.type === 'Polygon' ? [u.geometry.coordinates] : u.geometry.coordinates;
    for (const [x, y] of rings.flatMap((r) => r[0]!)) {
      w = Math.min(w, x!);
      s = Math.min(s, y!);
      e = Math.max(e, x!);
      n = Math.max(n, y!);
    }
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** 每 ms 毫秒（真实时间）按当前模拟时刻调用一次，挂载后立即调用一次 */
export function useTick(page: MuseumMap<readonly AnyPlugin[]> | null, ms: number, tick: (t: number) => void) {
  const onTick = useEffectEvent(tick);
  useEffect(() => {
    if (!page) return;
    onTick(page.ctx.clock.time());
    const timer = setInterval(() => onTick(page.ctx.clock.time()), ms);
    return () => clearInterval(timer);
  }, [page, ms]);
}

/** 标题栏里的模拟时刻和倍速 */
function SimClock({ ctx }: { ctx: MuseumContext | null }) {
  const t = useMuseumT();
  const [, tick] = useReducer((v: number) => v + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);
  const speed = useSyncExternalStore(
    (l) => ctx?.clock.subscribe(l) ?? (() => {}),
    () => ctx?.clock.speed() ?? 1,
  );
  if (!ctx) return null;
  return (
    <span className="sim-clock">
      <span className="metric">
        {t('clock.label')}: <b data-testid="sim-clock">{clockText(ctx.clock.time())}</b>
      </span>
      <ChoiceChips
        testId="speed-chip"
        label={t('control.speed')}
        items={SPEEDS.map((s) => ({ value: s, text: `${s}×` }))}
        selected={speed}
        onChange={(s) => ctx.clock.setSpeed(s)}
      />
    </span>
  );
}

/** 楼层按钮；来馆者看的页面不显示非公开的地下收藏库 */
function FloorButtons(props: {
  page: MuseumMap<readonly AnyPlugin[]> | null;
  label: string;
  publicOnly: boolean;
}) {
  const { page } = props;
  const [, refresh] = useReducer((v: number) => v + 1, 0);
  useMapEvent(page, 'floor:change', refresh);
  const levels = page ? [...page.floor.list()].reverse() : [];
  return (
    <fieldset className="floors" aria-label={props.label}>
      {page &&
        levels
          .filter((level) => !props.publicOnly || level.ordinal >= 0)
          .map((level) => (
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
 * 博物馆地图页的布局：标题栏（标题、说明、模拟时刻和页面控件）、地图、楼层按钮、场馆名和手机端的列表按钮。
 * 列表面板桌面端常驻左侧；手机端收在按钮后面，点开后是底部抽屉。
 */
export function MuseumMapLayout(props: {
  title: MuseumKey;
  desc: MuseumKey;
  stageRef: RefObject<HTMLDivElement | null>;
  page: MuseumMap<readonly AnyPlugin[]> | null;
  load: MapLoad;
  controls: ReactNode;
  children: ReactNode;
  /** 只显示公开楼层（来馆者看的页面） */
  publicOnly?: boolean;
}) {
  const t = useMuseumT();
  const locale = useLocale();
  useMuseumTitle(props.title);
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
        <SimClock ctx={page?.ctx ?? null} />
        {props.controls}
      </header>
      <div className="stage" ref={props.stageRef} data-panel-open={panelOpen ? '' : undefined}>
        <div className="map" />
        <FloorButtons page={page} label={t('floor.label')} publicOnly={props.publicOnly ?? false} />
        <div className="venue-name" data-testid="venue-name">
          {page && pickLabel(page.ctx.venue.name, languageFallbacks(locale))}
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

/** 楼层简称，如 3F、B1 */
export const levelName = (floor: FloorApi, levelId: string) => {
  const level = floor.resolve(levelId);
  return level.shortName.en ?? level.id;
};

/** 房间名（按当前语言），没有名字时用编号 */
export function useRoomName(ctx: MuseumContext | null) {
  const locale = useLocale();
  return (unitId: string) => {
    if (!ctx) return '';
    const room = ctx.museum.roomOf(unitId);
    return pickLabel(room.name, languageFallbacks(locale)) ?? room.code;
  };
}
