import type { VenueModel } from '@indoorkit/imdf';
import { useEffect, useState } from 'react';
import type { IndoorItem } from './indoor';

/** SVG remains usable when WebGL is unavailable. This path never creates a graphics context. */
export function PlanFallback({
  venue,
  url,
  levelId,
  indoor,
  label,
  items,
  onSelect,
}: {
  venue: VenueModel;
  url: string;
  levelId: string;
  indoor: boolean;
  label: string;
  items: readonly IndoorItem[];
  onSelect(id: string): void;
}) {
  const [site, setSite] =
    useState<GeoJSON.FeatureCollection<GeoJSON.Polygon, { name: string; surface: string }>>();
  useEffect(() => {
    const abort = new AbortController();
    void fetch(`${url}/site.geojson`, { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`Site plan: HTTP ${r.status}`);
        return r.json();
      })
      .then(setSite)
      .catch((e: unknown) => {
        if (!abort.signal.aborted) console.warn('[twin] local site plan unavailable', e);
      });
    return () => abort.abort();
  }, [url]);
  const features: GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { id?: string; name?: string; category?: string; surface?: string }
  >[] = [
    ...(site?.features ?? venue.features.levels.features.filter((f) => f.properties.level_id === levelId)),
    ...(indoor ? venue.features.units.features.filter((f) => f.properties.level_id === levelId) : []),
  ];
  const coords = features.flatMap((f) =>
    f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : f.geometry.coordinates.flat(2),
  );
  const project = ([lng, lat]: number[]) => [
    (lng! - venue.center[0]) * 111320 * Math.cos((venue.center[1] * Math.PI) / 180),
    -(lat! - venue.center[1]) * 111320,
  ];
  const points = coords.map(project);
  const minX = Math.min(0, ...points.map((p) => p[0]!)) - 8;
  const minY = Math.min(0, ...points.map((p) => p[1]!)) - 8;
  const width = Math.max(0, ...points.map((p) => p[0]!)) - minX + 8;
  const height = Math.max(0, ...points.map((p) => p[1]!)) - minY + 8;
  return (
    <svg
      className="twin-plan-fallback"
      data-testid="twin-plan-fallback"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      {features.flatMap((f) => {
        const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        return polygons.map((polygon) => (
          <path
            key={`${f.properties.id ?? f.properties.name}:${polygon[0]?.[0]?.join(',')}`}
            d={polygon.map((ring) => `M${ring.map((p) => project(p).join(',')).join('L')}Z`).join('')}
            fillRule="evenodd"
            className={`twin-plan-${f.properties.surface ?? f.properties.category ?? 'stone'}`}
          />
        ));
      })}
      {items.map((item) => {
        const [x, y] = project(item.coord);
        return (
          // biome-ignore lint/a11y/useSemanticElements: SVG circles cannot be native HTML buttons; keyboard activation is provided.
          <circle
            key={item.id}
            cx={x}
            cy={y}
            r="0.9"
            fill={item.color}
            stroke="white"
            strokeWidth="0.25"
            role="button"
            tabIndex={0}
            aria-label={item.name}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(item.id);
              }
            }}
          >
            <title>
              {item.name} · {item.status}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}
