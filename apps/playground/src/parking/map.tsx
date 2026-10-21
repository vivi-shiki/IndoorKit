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
import { createTrackedMap, FloorButtons, fitToStage, followAppSettings } from '../app/map';
import { trackTeardown } from '../app/teardown';
import { useLocale } from '../app-i18n';
import { SPEEDS } from './adapters/clock';
import { loadParking, type ParkingContext } from './adapters/venue';
import { type ParkingKey, useParkingT, useParkingTitle } from './i18n';
import { clockText } from './presentation/format';
import { ChoiceChips } from './presentation/ui';
import type { ParkingPage } from './routes';
import { installParkingMapHooks, type ParkingTestHooks, setParkingHooks } from './testing/hooks';

export interface ParkingMapOptions<P extends readonly AnyPlugin[]> {
  page: ParkingPage;
  plugins: (ctx: ParkingContext) => P;
  /** 打开时所在楼层（简称） */
  floor?: string;
  /** ?t=09:30：从这个时刻开始模拟 */
  startAt?: number;
}

/** 地图就绪后交给页面的东西：地图、楼层、停车场数据和测试钩子 */
export interface ParkingMap<P extends readonly AnyPlugin[]> {
  indoor: IndoorMap<P>;
  floor: FloorApi;
  ctx: ParkingContext;
  hooks: ParkingTestHooks;
}

export interface MapLoad {
  state: 'loading' | 'ready' | 'failed';
  retry(): void;
}

/**
 * 在 stage 里的 .map 上创建停车场地图，就绪前返回 null。
 * 卸载时销毁地图（含数据源），并登记给路由，路由等它完成才挂载下一页。
 * 页面画完第一次状态后自己设置 hooks.ready。
 */
export function useParkingMap<const P extends readonly AnyPlugin[]>(
  stageRef: RefObject<HTMLElement | null>,
  options: ParkingMapOptions<P>,
): [ParkingMap<P> | null, MapLoad] {
  const [page, setPage] = useState<ParkingMap<P> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, retry] = useReducer((n: number) => n + 1, 0);
  // 选项只在挂载时读一次；页面参数变化时路由会重新挂载页面
  const initial = useRef(options).current;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt 是重试时重新创建地图的触发条件
  useEffect(() => {
    setFailed(false);
    setPage(null);
    const stage = stageRef.current!;
    const hooks = setParkingHooks(initial.page);
    let disposed = false;
    let indoor: IndoorMap<P> | undefined;
    const cleanups: (() => void)[] = [];

    const create = async () => {
      const ctx = await loadParking();
      if (disposed) return;
      if (initial.startAt !== undefined) ctx.clock.set(initial.startAt);
      indoor = await createTrackedMap({
        container: stage.querySelector<HTMLElement>('.map')!,
        venue: ctx.venue,
        plugins: initial.plugins(ctx),
        // 车位窄而密，俯视角小一些才看得清
        pitch: 20,
      });
      if (disposed) return;
      const floor = indoor.plugin<FloorApi>('floor');
      // 停车楼和平面场不在一处：每次换层都把这一层放满地图
      const map = indoor;
      const fitLevel = () => fitToStage(map, stage, levelBounds(ctx, floor.current().id));
      cleanups.push(indoor.events.on('floor:change', fitLevel));
      floor.set(initial.floor ?? '1F');
      fitLevel();
      cleanups.push(followAppSettings(indoor));

      hooks.time = ctx.clock.time;
      hooks.speed = ctx.clock.speed;
      hooks.floor = () => floor.current().shortName.en ?? '';
      installParkingMapHooks(indoor, hooks, (code) => ctx.parking.bayByCode(code).center);
      setPage({ indoor, floor, ctx, hooks });
    };
    // 一次挂载失败要报出来，但不能卡住之后的导航
    const created = create().catch((error: unknown) => {
      console.error('[parking] failed to open page', error);
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
function levelBounds(ctx: ParkingContext, levelId: string): [[number, number], [number, number]] {
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
export function useTick(
  page: ParkingMap<readonly AnyPlugin[]> | null,
  ms: number,
  tick: (t: number) => void,
) {
  const onTick = useEffectEvent(tick);
  useEffect(() => {
    if (!page) return;
    onTick(page.ctx.clock.time());
    const timer = setInterval(() => onTick(page.ctx.clock.time()), ms);
    return () => clearInterval(timer);
  }, [page, ms]);
}

/** 标题栏里的模拟时刻和倍速 */
function SimClock({ ctx }: { ctx: ParkingContext | null }) {
  const t = useParkingT();
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

/**
 * 停车场地图页的布局：标题栏（标题、说明、模拟时刻和页面控件）、地图、楼层按钮、场馆名和手机端的列表按钮。
 * 列表面板桌面端常驻左侧；手机端收在按钮后面，点开后是底部抽屉。
 */
export function ParkingMapLayout(props: {
  title: ParkingKey;
  desc: ParkingKey;
  stageRef: RefObject<HTMLDivElement | null>;
  page: ParkingMap<readonly AnyPlugin[]> | null;
  load: MapLoad;
  controls: ReactNode;
  children: ReactNode;
}) {
  const t = useParkingT();
  const locale = useLocale();
  useParkingTitle(props.title);
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
        <FloorButtons page={page} label={t('floor.label')} />
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

/** 楼层简称，如 3F、P2 */
export const levelName = (floor: FloorApi, levelId: string) => {
  const level = floor.resolve(levelId);
  return level.shortName.en ?? level.id;
};
