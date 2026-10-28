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
  const [details, setDetails] = useState(false);
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
  const maxCount = Math.max(1, ...countByLevel.map((l) => l.count));
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
  const exportModel = () => {
    const a = document.createElement('a');
    a.href = api?.exportUrl() ?? `${import.meta.env.BASE_URL}models/${asset}/scene.glb`;
    a.download = `${asset}.glb`;
    a.click();
  };
  return (
    <section
      className={`twin twin-${asset}`}
      data-testid="twin-status"
      data-ready={snapshot?.ready ?? false}
      data-view={snapshot?.view ?? 'outdoor'}
      data-quality={snapshot?.quality ?? 'low'}
    >
      <header className="twin-header">
        <div>
          <p className="twin-eyebrow">{t.eyebrow}</p>
          <h1 data-testid="twin-title">{t.title}</h1>
          <p className="twin-site-name">{data ? pickLabel(data.venue.name, [locale, 'en']) : 'IndoorKit'}</p>
        </div>
        <div className="twin-badge">
          <span />
          {t.simulation}
        </div>
      </header>
      <div className="twin-workspace">
        <section className="twin-map" ref={container} aria-label={t.overview} />
        {error && data && (
          <PlanFallback
            venue={data.venue}
            url={`${import.meta.env.BASE_URL}models/${asset}`}
            levelId={current}
            indoor={snapshot?.view === 'indoor'}
            label={t.fallback}
          />
        )}
        {(!snapshot?.ready || (error && !data)) && (
          <div className="twin-loading" role="status">
            {error ? t.failed : t.loading}
            {error && (
              <button type="button" onClick={() => setAttempt(attempt + 1)}>
                {t.retry}
              </button>
            )}
          </div>
        )}
        <aside
          className={`twin-left twin-panel ${details ? 'twin-expanded' : ''}`}
          data-testid="twin-inventory"
        >
          <div className="twin-panel-heading">
            <h2>{t.operations}</h2>
            <button
              type="button"
              className="twin-mobile-close"
              onClick={() => setDetails(false)}
              aria-label={t.close}
            >
              ×
            </button>
          </div>
          {data?.timeDependent && (
            <label className="twin-time">
              {t.time}
              <b>{String(hour).padStart(2, '0')}:00</b>
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
          <div className="twin-metrics">
            {metrics.map((m) => (
              <div className="twin-metric" key={m.label}>
                <span>{t[m.label]}</span>
                <strong>
                  {m.value.toLocaleString(locale)}
                  {m.total && <small> / {m.total}</small>}
                </strong>
                {m.total && (
                  <div className="twin-meter">
                    <i style={{ width: `${Math.min(100, (m.value / m.total) * 100)}%` }} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <a className="twin-operations-link" href={data?.operationsHref}>
            {t.more} ↗
          </a>
          <h2>{t.levels}</h2>
          <div className="twin-bars">
            {countByLevel.map(({ level, count }) => (
              <button type="button" key={level.id} onClick={() => chooseFloor(level.id)}>
                <span>{pickLabel(level.shortName, [locale, 'en'])}</span>
                <i style={{ width: `${(count / maxCount) * 100}%` }} />
                <b>{count}</b>
              </button>
            ))}
          </div>
          <p className="twin-note">{t.units}</p>
        </aside>
        <aside className="twin-right twin-panel">
          <p className="twin-section-code">01 / {t.inventory}</p>
          <h2>{t.facilities}</h2>
          <dl className="twin-system-list">
            <div>
              <dt>{t.buildings}</dt>
              <dd>{data?.venue.buildings.length ?? '—'}</dd>
            </div>
            <div>
              <dt>{t.floors}</dt>
              <dd>{data?.venue.levels.length ?? '—'}</dd>
            </div>
            <div>
              <dt>{t.stairs}</dt>
              <dd>{units.filter((u) => u.properties.category === 'stairs').length}</dd>
            </div>
            <div>
              <dt>{t.entrances}</dt>
              <dd>
                {data?.venue.features.openings.features.filter(
                  (o) => o.properties.category === 'pedestrian.principal',
                ).length ?? '—'}
              </dd>
            </div>
          </dl>
          <div className="twin-site-diagram" aria-hidden="true">
            {data?.venue.buildings.map((building) => (
              <span key={building.id} />
            ))}
          </div>
          <h2>{t.accessible}</h2>
          <p className="twin-note">{t.connected}</p>
          <p className="twin-section-code">02 / {t.geometry}</p>
          <dl className="twin-system-list">
            <div>
              <dt>{t.meshes}</dt>
              <dd>{snapshot?.meshes ?? '—'}</dd>
            </div>
            <div>
              <dt>{t.triangles}</dt>
              <dd>{snapshot?.triangles.toLocaleString(locale) ?? '—'}</dd>
            </div>
          </dl>
          <p className="twin-note">{t.offline}</p>
        </aside>
        <div className="twin-scene-label">
          <span className="twin-live-dot" />
          {snapshot?.fallback ? t.fallback : snapshot?.view === 'indoor' ? t.indoor : t.overview}
        </div>
        <nav className="twin-floors" aria-label={t.floors}>
          <button
            type="button"
            data-testid="twin-outdoor"
            aria-pressed={snapshot?.view === 'outdoor'}
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
        </nav>
        <div className="twin-bottom">
          <p>{t.hint}</p>
          <div className="twin-toolbar">
            <button type="button" onClick={outside}>
              {t.overview}
            </button>
            <button
              type="button"
              data-testid="twin-mobile-panel"
              className="twin-mobile-toggle"
              onClick={() => setDetails(!details)}
            >
              {t.details}
            </button>
            <label>
              <span>{t.quality}</span>
              <select
                aria-label={t.quality}
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
            <button
              type="button"
              data-testid="twin-export"
              disabled={!data}
              title={t.exportHint}
              onClick={exportModel}
            >
              ↓ {t.export}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
