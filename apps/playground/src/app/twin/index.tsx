import type { AnyPlugin, IndoorMap } from '@indoorkit/core';
import type { Quality, TwinApi, TwinSnapshot } from '@indoorkit/core/twin';
import { pickLabel, type VenueModel } from '@indoorkit/imdf';
import { type FloorApi, floorPlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../../app-i18n';
import { appTheme } from '../../app-theme';
import { createTrackedMap, followAppSettings } from '../map';
import { trackTeardown } from '../teardown';
import { PlanFallback } from './fallback';
import { TWIN_MESSAGES, type TwinKey } from './messages';
import './twin.css';

export interface TwinData {
  venue: VenueModel;
  metrics(time: number): { label: TwinKey; value: number; total?: number }[];
  operationsHref: string;
  timeDependent?: boolean;
}
declare global {
  interface Window {
    __twin?: {
      snapshot(): TwinSnapshot;
      floor(): string;
      setView(view: 'indoor' | 'outdoor'): void;
      setZoom(value: number): void;
      idle(): Promise<void>;
    };
  }
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
  const [quality, setQuality] = useState<Quality>('auto');
  const [hour, setHour] = useState(14);
  useEffect(() => {
    document.title = `${t.title} | IndoorKit`;
    document.documentElement.lang = locale;
  }, [t.title, locale]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry must recreate the whole owned map.
  useEffect(() => {
    let disposed = false;
    let indoor: IndoorMap<readonly AnyPlugin[]> | undefined;
    let loadedData: TwinData | undefined;
    const cleanups: (() => void)[] = [];
    setError(false);
    setSnapshot(undefined);
    const create = async () => {
      const [loaded, { twinPlugin }] = await Promise.all([load(), import('@indoorkit/core/twin')]);
      if (disposed) return;
      loadedData = loaded;
      setData(loaded);
      setCurrent((loaded.venue.levels.find((l) => l.ordinal === 0) ?? loaded.venue.levels[0])!.id);
      indoor = await createTrackedMap({
        container: container.current!,
        venue: loaded.venue,
        plugins: [
          floorPlugin,
          twinPlugin({ url: `${import.meta.env.BASE_URL}models/${asset}`, dark: appTheme.value === 'dark' }),
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
      const hook = {
        snapshot: twin.snapshot,
        floor: () => floors.current().shortName.en ?? '',
        setView: twin.view,
        setZoom: twin.zoom,
        idle: twin.idle,
      };
      window.__twin = hook;
      cleanups.push(() => {
        if (window.__twin === hook) delete window.__twin;
      });
      setData(loaded);
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
            view: 'outdoor',
            quality: 'low',
            shadows: false,
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
  }, [asset, load, attempt]);
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
    [t.meshes, snapshot?.meshes ?? '—'],
    [t.triangles, snapshot?.triangles.toLocaleString(locale) ?? '—'],
  ];
  // 和其他地图页同一套布局：标题栏放指标和画质，地图右上角是楼层按钮，左侧面板在手机上收进按钮
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
        <label className="select">
          {t.quality}
          <select
            data-testid="twin-quality"
            disabled={!api}
            value={quality}
            onChange={(e) => {
              const value = e.target.value as Quality;
              setQuality(value);
              void api?.quality(value).catch(() => setError(true));
            }}
          >
            <option value="auto">{t.auto}</option>
            <option value="low">{t.low}</option>
            <option value="high">{t.high}</option>
          </select>
        </label>
      </header>
      <div
        className={`stage twin twin-${asset}`}
        data-testid="twin-status"
        data-ready={snapshot?.ready ?? false}
        data-view={snapshot?.view ?? 'outdoor'}
        data-quality={snapshot?.quality ?? 'low'}
        data-panel-open={panelOpen ? '' : undefined}
      >
        <section className="map" ref={container} aria-label={t.overview} />
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
        <aside className="panel" data-testid="twin-inventory">
          {data?.timeDependent && (
            <label className="twin-time">
              <span>
                {t.time} <b className="clock">{String(hour).padStart(2, '0')}:00</b>
              </span>
              <input
                aria-label={t.time}
                type="range"
                min="0"
                max="23"
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
              />
            </label>
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
        {(!snapshot?.ready || (error && !data)) && (
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
