import {
  type AnyPlugin,
  detectLevel,
  type IndoorMap,
  RENDER_PRESETS,
  resolveSettings,
  STATUS_COLORS,
  type StatusPaint,
  type TwinStatus,
} from '@indoorkit/core';
import type { TwinApi, TwinSnapshot } from '@indoorkit/core/twin';
import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import { type FloorApi, floorPlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../app-i18n';
import { appTheme } from '../../app-theme';
import { createTrackedMap, followAppSettings } from '../map';
import { trackTeardown } from '../teardown';
import { PlanFallback } from './fallback';
import { TwinLabels } from './labels';
import { TWIN_MESSAGES, type TwinKey } from './messages';
import { QualityPanel } from './quality-panel';
import { browserStorage, loadQuality, type QualityChoice, saveQuality } from './quality-store';
import './twin.css';

export interface TwinData {
  venue: VenueModel;
  metrics(time: number): { label: TwinKey; value: number; total?: number }[];
  operationsHref: string;
  timeDependent?: boolean;
  /** 涂在模型上的业务状态（停车场每层空位、博物馆报警的房间） */
  status?(time: number): StatusPaint[];
  legend?: { status: TwinStatus; label: TwinKey }[];
}
declare global {
  interface Window {
    __twin?: {
      snapshot(): TwinSnapshot;
      floor(): string;
      setView(view: 'indoor' | 'outdoor'): void;
      setZoom(value: number): void;
      idle(): Promise<void>;
      sky(): boolean;
      buildings(): { id: string; names: { zh: string; ja: string; en: string } }[];
      /** 一栋能点中的楼，页面坐标 */
      buildingPoint(): { id: string; x: number; y: number };
      levels(): { id: string; shortName: string; ordinal: number }[];
      floorMeshes(): number;
      camera(): { zoom: number; pitch: number; bearing: number };
      levelInView(levelId: string): boolean;
      extrusions(): number;
      gl(): { antialias: boolean; viewport: { three: [number, number]; buffer: [number, number] } };
    };
  }
}

/** 地图创建前就要知道是否抗锯齿：按保存的选择和设备估算，和插件用同一套规则 */
function wantsAntialias(choice: QualityChoice) {
  const level =
    choice.quality === 'auto'
      ? detectLevel({
          width: innerWidth,
          cores: navigator.hardwareConcurrency || 4,
          memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
          saveData:
            (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false,
        })
      : choice.quality;
  return resolveSettings(level, undefined, choice.overrides).antialias;
}

/** Shared presentation only. Each scenario owns the data loader and metric calculations. */
export function TwinPage({ asset, load }: { asset: string; load(): Promise<TwinData> }) {
  const locale = useLocale();
  const t = TWIN_MESSAGES[locale];
  const container = useRef<HTMLElement>(null);
  const [data, setData] = useState<TwinData>();
  const [api, setApi] = useState<TwinApi>();
  const [floor, setFloor] = useState<FloorApi>();
  const [current, setCurrent] = useState('');
  const [snapshot, setSnapshot] = useState<TwinSnapshot>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [choice, setChoice] = useState<QualityChoice>(() => loadQuality(browserStorage()));
  const choiceRef = useRef(choice);
  choiceRef.current = choice;
  const [antialias, setAntialias] = useState(() => wantsAntialias(choice));
  const [qualityOpen, setQualityOpen] = useState(false);
  const [hour, setHour] = useState(14);
  const time = useRef<HTMLInputElement>(null);
  useEffect(() => {
    document.title = `${t.title} | IndoorKit`;
    document.documentElement.lang = locale;
  }, [t.title, locale]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry and anti-aliasing must recreate the whole owned map.
  useEffect(() => {
    let disposed = false;
    let indoor: IndoorMap<readonly AnyPlugin[]> | undefined;
    let loadedData: TwinData | undefined;
    const cleanups: (() => void)[] = [];
    setError(false);
    setSnapshot(undefined);
    setApi(undefined);
    const create = async () => {
      const [loaded, { twinPlugin }] = await Promise.all([load(), import('@indoorkit/core/twin')]);
      if (disposed) return;
      loadedData = loaded;
      setData(loaded);
      setCurrent((loaded.venue.levels.find((l) => l.ordinal === 0) ?? loaded.venue.levels[0])!.id);
      indoor = await createTrackedMap({
        container: container.current!,
        venue: loaded.venue,
        antialias,
        plugins: [
          floorPlugin,
          twinPlugin({
            url: `${import.meta.env.BASE_URL}models/${asset}`,
            dark: appTheme.value === 'dark',
            quality: choiceRef.current.quality,
            overrides: choiceRef.current.overrides,
            // 自动化测试里不做空闲环绕，镜头只随操作变化
            orbit: !navigator.webdriver,
          }),
        ] as const,
      });
      if (disposed) return;
      const twin = indoor.plugin<TwinApi>('twin');
      const floors = indoor.plugin<FloorApi>('floor');
      cleanups.push(
        followAppSettings(indoor),
        twin.subscribe(() => setSnapshot({ ...twin.snapshot() })),
      );
      cleanups.push(indoor.events.on('floor:change', () => setCurrent(floors.current().id)));
      const venue = loaded.venue;
      const box = () => container.current!.getBoundingClientRect();
      const hook: NonNullable<Window['__twin']> = {
        snapshot: twin.snapshot,
        floor: () => floors.current().shortName.en ?? '',
        setView: twin.view,
        setZoom: twin.zoom,
        idle: twin.idle,
        sky: twin.debug.sky,
        buildings: () =>
          twin.buildings().map((b) => {
            const name = venue.buildings.find((v) => v.id === b.id)?.name ?? {};
            return {
              id: b.id,
              names: {
                zh: pickLabel(name, ['zh', 'en']) ?? '',
                ja: pickLabel(name, ['ja', 'en']) ?? '',
                en: pickLabel(name, ['en']) ?? '',
              },
            };
          }),
        buildingPoint: () => {
          // 只取没有被面板、按钮挡住的点
          const point = twin.debug
            .buildingPoints()
            .map((p) => ({ id: p.id, x: box().left + p.x, y: box().top + p.y }))
            .find((p) => document.elementFromPoint(p.x, p.y) === container.current!.querySelector('canvas'));
          if (!point) throw new Error('no building can be clicked from the current view');
          return point;
        },
        levels: () =>
          venue.levels.map((l) => ({ id: l.id, shortName: l.shortName.en ?? '', ordinal: l.ordinal })),
        floorMeshes: twin.debug.floorMeshes,
        camera: twin.debug.camera,
        levelInView: twin.debug.levelInView,
        extrusions: twin.debug.extrusions,
        gl: () => ({ antialias: twin.debug.antialias(), viewport: twin.debug.viewport() }),
      };
      window.__twin = hook;
      cleanups.push(() => {
        if (window.__twin === hook) delete window.__twin;
      });
      setApi(twin);
      setFloor(floors);
      setCurrent(floors.current().id);
      setSnapshot({ ...twin.snapshot() });
    };
    const created = create().catch((e: unknown) => {
      console.error('[twin] failed to open campus', e);
      if (!disposed) {
        setError(true);
        if (loadedData)
          setSnapshot({
            ready: true,
            progress: 1,
            view: 'outdoor',
            quality: choiceRef.current.quality,
            level: 'L0',
            settings: RENDER_PRESETS.L0,
            renderer: { toneMapping: 'ACESFilmic', environment: false },
            focused: null,
            cut: {},
            hour: 14,
            night: false,
            painted: 0,
            meshes: 0,
            triangles: 0,
            fallback: true,
          });
      }
    });
    return () => {
      disposed = true;
      for (const off of cleanups.reverse()) off();
      trackTeardown(created.then(() => indoor?.destroy()));
    };
  }, [asset, load, attempt, antialias]);

  // 模拟时间：太阳、夜间灯光和业务状态
  useEffect(() => {
    if (!api || !data) return;
    if (data.timeDependent) api.time(hour);
    if (data.status) api.paint(data.status(hour * 3600_000));
  }, [api, data, hour]);
  // Playwright 和部分辅助技术直接改 value，React 的受控输入收不到，所以监听原生事件
  // biome-ignore lint/correctness/useExhaustiveDependencies: the slider only exists once the data has loaded.
  useEffect(() => {
    const input = time.current;
    if (!input) return;
    const read = () => setHour(Number(input.value));
    input.addEventListener('input', read);
    input.addEventListener('change', read);
    return () => {
      input.removeEventListener('input', read);
      input.removeEventListener('change', read);
    };
  }, [data]);

  const choose = (next: QualityChoice) => {
    setChoice(next);
    saveQuality(browserStorage(), next);
    const aa = wantsAntialias(next);
    // 抗锯齿属于 WebGL 上下文，只能重建地图
    if (aa !== antialias) {
      setSnapshot(undefined);
      setAntialias(aa);
    } else void api?.quality(next.quality, next.overrides).catch(() => setError(true));
  };
  const metrics = data?.metrics(hour * 3600_000) ?? [];
  const units = data?.venue.features.units.features ?? [];
  const countByLevel =
    data?.venue.levels.map((l) => ({
      level: l,
      count: units.filter((u) => u.properties.level_id === l.id).length,
    })) ?? [];
  const chooseFloor = (id: string) => {
    floor?.set(id);
    setCurrent(id);
    if (api) api.view('indoor');
    else setSnapshot((s) => (s ? { ...s, view: 'indoor' } : s));
  };
  const outside = () => {
    if (api) api.view('outdoor');
    else setSnapshot((s) => (s ? { ...s, view: 'outdoor' } : s));
  };
  const [panelOpen, setPanelOpen] = useState(false);
  const siteName = data ? pickLabel(data.venue.name, [locale, 'en']) : '';
  const facts: [string, string | number][] = [
    [t.buildings, data?.venue.buildings.length ?? '—'],
    [t.floors, data?.venue.levels.length ?? '—'],
    [t.stairs, units.filter((u) => u.properties.category === 'stairs').length],
    [
      t.entrances,
      data?.venue.features.openings.features.filter((o) => o.properties.category === 'pedestrian.principal')
        .length ?? '—',
    ],
  ];
  const focused = snapshot?.focused ? api?.buildings().find((b) => b.id === snapshot.focused) : undefined;
  const focusedLevels = focused
    ? (data?.venue.levels.filter((l) => l.buildingIds.includes(focused.id)) ?? [])
    : [];
  const focusedName = focused
    ? pickLabel(data?.venue.buildings.find((b) => b.id === focused.id)?.name ?? {}, [locale, 'en'])
    : '';
  const loading = !error && (!snapshot || (!snapshot.ready && snapshot.meshes === 0));
  // 和其他地图页同一套布局：标题栏放指标，地图右上角是楼层按钮，左下角是画质，左侧面板在手机上收进按钮
  return (
    <>
      <header className="bar">
        <div className="bar-title">
          <h1 data-testid="twin-title">{t.title}</h1>
          <p className="page-desc">{t.hint}</p>
        </div>
        {metrics.map((m) => (
          <span className="metric" key={m.label}>
            {t[m.label]}: <b>{m.value.toLocaleString(locale)}</b>
            {m.total !== undefined && (
              <>
                {' / '}
                <b>{m.total.toLocaleString(locale)}</b>
              </>
            )}
          </span>
        ))}
      </header>
      <div
        className={`stage twin twin-${asset}`}
        data-testid="twin-status"
        data-ready={snapshot?.ready ?? false}
        data-view={snapshot?.view ?? 'outdoor'}
        data-level={snapshot?.level ?? ''}
        data-panel-open={panelOpen ? '' : undefined}
      >
        <section className="map" ref={container} aria-label={t.overview} />
        {api && data && <TwinLabels api={api} venue={data.venue} locale={locale} />}
        {snapshot && !snapshot.ready && (
          <div
            className="twin-progress"
            role="progressbar"
            aria-label={t.progress}
            aria-valuenow={Math.round(snapshot.progress * 100)}
          >
            <span style={{ width: `${Math.round(snapshot.progress * 100)}%` }} />
          </div>
        )}
        {error && data && (
          <PlanFallback
            venue={data.venue}
            url={`${import.meta.env.BASE_URL}models/${asset}`}
            levelId={current}
            indoor={snapshot?.view === 'indoor'}
            label={t.fallback}
          />
        )}
        <fieldset className="floors" aria-label={t.floors}>
          <button
            type="button"
            data-testid="twin-outdoor"
            aria-pressed={snapshot?.view === 'outdoor'}
            title={t.overview}
            disabled={!data}
            onClick={outside}
          >
            3D
          </button>
          {data?.venue.levels.toReversed().map((l) => (
            <button
              type="button"
              key={l.id}
              data-testid={`twin-floor-${l.shortName.en}`}
              aria-pressed={snapshot?.view === 'indoor' && current === l.id}
              onClick={() => chooseFloor(l.id)}
            >
              {pickLabel(l.shortName, [locale, 'en'])}
            </button>
          ))}
        </fieldset>
        <div className="venue-name">
          {siteName}
          {snapshot?.fallback && <span className="muted"> · {t.fallback}</span>}
        </div>
        {focused && (
          <section className="twin-card" data-testid="twin-building-card" aria-label={focusedName}>
            <h2>{focusedName}</h2>
            <dl className="twin-facts">
              <div>
                <dt>{t.height}</dt>
                <dd>{focused.height.toLocaleString(locale)} m</dd>
              </div>
              <div>
                <dt>{t.storeys}</dt>
                <dd>{focusedLevels.filter((l) => l.ordinal >= 0).length}</dd>
              </div>
            </dl>
            <div className="twin-card-actions">
              <button
                type="button"
                className="chip"
                data-testid="twin-enter-floor"
                disabled={focusedLevels.length === 0}
                onClick={() => {
                  const ground =
                    focusedLevels.find((l) => l.ordinal === 0) ??
                    focusedLevels.toSorted((a, b) => Math.abs(a.ordinal) - Math.abs(b.ordinal))[0]!;
                  chooseFloor(ground.id);
                }}
              >
                {t.enterFloor}
              </button>
              <button type="button" className="chip" onClick={() => api?.focus(null)}>
                {t.closeCard}
              </button>
            </div>
          </section>
        )}
        <div className="twin-tools">
          {qualityOpen && (
            <QualityPanel
              t={t}
              api={api}
              choice={choice}
              level={snapshot?.level ?? (choice.quality === 'auto' ? 'L2' : choice.quality)}
              locale={locale}
              onChoose={choose}
            />
          )}
          <button
            type="button"
            className="chip"
            data-testid="twin-quality-button"
            aria-expanded={qualityOpen}
            onClick={() => setQualityOpen(!qualityOpen)}
          >
            {t.quality} · {snapshot?.level ?? '…'}
          </button>
          <button
            type="button"
            className="chip"
            data-testid="twin-reset"
            disabled={!api}
            onClick={() => api?.resetView()}
          >
            {t.resetView}
          </button>
        </div>
        <aside className="panel" data-testid="twin-inventory">
          {data?.timeDependent && (
            <label className="twin-time">
              <span>
                {t.time} <b className="clock">{String(hour).padStart(2, '0')}:00</b>
              </span>
              <input
                ref={time}
                data-testid="twin-time"
                aria-label={t.time}
                type="range"
                min="0"
                max="23"
                defaultValue={hour}
              />
            </label>
          )}
          {data?.legend && (
            <ul className="twin-legend">
              {data.legend.map((l) => (
                <li key={l.label}>
                  <i style={{ background: STATUS_COLORS[l.status] }} />
                  {t[l.label]}
                </li>
              ))}
            </ul>
          )}
          <h2>{t.levels}</h2>
          <ul className="rows">
            {countByLevel.map(({ level, count }) => (
              <li key={level.id}>
                <button
                  type="button"
                  className="row"
                  aria-pressed={snapshot?.view === 'indoor' && current === level.id}
                  onClick={() => chooseFloor(level.id)}
                >
                  <span className="name">{pickLabel(level.shortName, [locale, 'en'])}</span>
                  <span className="count">{count}</span>
                </button>
              </li>
            ))}
          </ul>
          <h2>{t.facilities}</h2>
          <dl className="twin-facts">
            {facts.map(([term, value]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="muted">
            {t.simulation} · {t.offline}
          </p>
          {data && (
            <a className="link" href={data.operationsHref}>
              {t.more} →
            </a>
          )}
        </aside>
        {(loading || (error && !data)) && (
          <div className="map-status" role={error ? 'alert' : 'status'}>
            {error ? (
              <>
                <p>{t.failed}</p>
                <button type="button" className="chip" onClick={() => setAttempt(attempt + 1)}>
                  {t.retry}
                </button>
              </>
            ) : (
              t.loading
            )}
          </div>
        )}
        <button
          type="button"
          className="panel-toggle"
          data-testid="twin-mobile-panel"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          {panelOpen ? t.close : t.details}
        </button>
      </div>
    </>
  );
}
