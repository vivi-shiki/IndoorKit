import type { Feature, FeatureCollection, Geometry, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import { archiveSchemas, IMDF_FILES, type ImdfFileName, OPTIONAL_FILES, REQUIRED_FILES } from './schema';

export * from './schema';

export type LabelMap = Record<string, string>;

/** 未经校验的 IMDF 要素，结构宽松，便于读取和生成 */
export interface RawFeature {
  type: 'Feature';
  id: string;
  feature_type: string;
  geometry: Geometry | null;
  // biome-ignore lint/suspicious/noExplicitAny: IMDF 属性随要素类型变化，校验由 zod 负责
  properties: Record<string, any>;
}

export interface RawCollection {
  type: 'FeatureCollection';
  features: RawFeature[];
}

export interface ImdfArchive {
  manifest: Record<string, unknown>;
  venue: RawCollection;
  building: RawCollection;
  level: RawCollection;
  unit: RawCollection;
  opening: RawCollection;
  fixture?: RawCollection;
  amenity?: RawCollection;
}

export interface ValidationIssue {
  file: ImdfFileName;
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; archive: ImdfArchive } | { ok: false; issues: ValidationIssue[] };

/** 按 IMDF 规范校验结构，并检查要素之间的引用与 id 唯一性 */
export function validateImdf(input: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];
  const source = (input ?? {}) as Record<string, unknown>;

  for (const file of IMDF_FILES) {
    const value = source[file];
    if (value === undefined) {
      if ((REQUIRED_FILES as readonly string[]).includes(file)) {
        issues.push({ file, path: '', message: 'required file is missing' });
      }
      continue;
    }
    const parsed = archiveSchemas[file].safeParse(value);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({ file, path: issue.path.join('.'), message: issue.message });
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const archive = source as unknown as ImdfArchive;
  const seen = new Map<string, ImdfFileName>();
  for (const file of IMDF_FILES) {
    if (file === 'manifest') continue;
    for (const f of archive[file]?.features ?? []) {
      const previous = seen.get(f.id);
      if (previous) issues.push({ file, path: f.id, message: `duplicate id (also in ${previous})` });
      else seen.set(f.id, file);
    }
  }

  const buildingIds = new Set(archive.building.features.map((b) => b.id));
  for (const level of archive.level.features) {
    for (const id of level.properties.building_ids ?? []) {
      if (!buildingIds.has(id))
        issues.push({ file: 'level', path: level.id, message: `unknown building ${id}` });
    }
  }

  const levelIds = new Set(archive.level.features.map((l) => l.id));
  for (const file of ['unit', 'opening', 'fixture'] as const) {
    for (const f of archive[file]?.features ?? []) {
      if (!levelIds.has(f.properties.level_id)) {
        issues.push({ file, path: f.id, message: `unknown level ${f.properties.level_id}` });
      }
    }
  }

  const unitIds = new Set(archive.unit.features.map((u) => u.id));
  for (const a of archive.amenity?.features ?? []) {
    for (const id of a.properties.unit_ids) {
      if (!unitIds.has(id)) issues.push({ file: 'amenity', path: a.id, message: `unknown unit ${id}` });
    }
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, archive };
}

export function pickLabel(
  labels: LabelMap | null | undefined,
  languages: readonly string[],
): string | undefined {
  if (!labels) return undefined;
  for (const lang of languages) {
    if (labels[lang]) return labels[lang];
  }
  return Object.values(labels)[0];
}

export interface LevelModel {
  id: string;
  ordinal: number;
  name: LabelMap;
  shortName: LabelMap;
  buildingIds: string[];
}

export interface IndoorProperties {
  id: string;
  level_id: string;
  category: string;
  [label: `label_${string}`]: string;
}

export type IndoorCollection<G extends Geometry = Geometry> = FeatureCollection<G, IndoorProperties>;

export interface VenueModel {
  id: string;
  name: LabelMap;
  center: [number, number];
  bounds: [[number, number], [number, number]];
  buildings: { id: string; name: LabelMap }[];
  levels: LevelModel[];
  features: {
    levels: IndoorCollection<Polygon | MultiPolygon>;
    units: IndoorCollection<Polygon | MultiPolygon>;
    fixtures: IndoorCollection<Polygon | MultiPolygon>;
    openings: IndoorCollection<LineString>;
    amenities: IndoorCollection<Point>;
  };
}

function flatten(f: RawFeature, levelId: string): Feature<Geometry, IndoorProperties> {
  const properties: IndoorProperties = { id: f.id, level_id: levelId, category: f.properties.category };
  const name = f.properties.name as LabelMap | null | undefined;
  for (const [lang, text] of Object.entries(name ?? {})) properties[`label_${lang}`] = text;
  return { type: 'Feature', id: f.id, geometry: f.geometry as Geometry, properties };
}

function collect<G extends Geometry>(features: Feature<Geometry, IndoorProperties>[]): IndoorCollection<G> {
  return { type: 'FeatureCollection', features: features as Feature<G, IndoorProperties>[] };
}

function extendBounds(bounds: [number, number, number, number], coords: unknown): void {
  if (typeof (coords as number[])[0] === 'number') {
    const [x, y] = coords as [number, number];
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
    return;
  }
  for (const c of coords as unknown[]) extendBounds(bounds, c);
}

/** 校验并转换为渲染和插件使用的内部模型 */
export function buildVenueModel(input: ImdfArchive): VenueModel {
  const result = validateImdf(input);
  if (!result.ok) {
    const summary = result.issues
      .slice(0, 3)
      .map((i) => `${i.file} ${i.path}: ${i.message}`)
      .join('; ');
    throw new Error(`invalid IMDF: ${summary}`);
  }
  const archive = result.archive;
  const venue = archive.venue.features[0]!;
  const levels = archive.level.features
    .map<LevelModel>((l) => ({
      id: l.id,
      ordinal: l.properties.ordinal,
      name: l.properties.name,
      shortName: l.properties.short_name,
      buildingIds: l.properties.building_ids ?? [],
    }))
    .sort((a, b) => a.ordinal - b.ordinal);

  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const l of archive.level.features) extendBounds(bounds, (l.geometry as Polygon).coordinates);
  extendBounds(bounds, (venue.geometry as Polygon).coordinates);

  return {
    id: venue.id,
    name: venue.properties.name,
    center: venue.properties.display_point.coordinates,
    bounds: [
      [bounds[0], bounds[1]],
      [bounds[2], bounds[3]],
    ],
    buildings: archive.building.features.map((b) => ({ id: b.id, name: b.properties.name ?? {} })),
    levels,
    features: {
      levels: collect(archive.level.features.map((l) => flatten(l, l.id))),
      units: collect(archive.unit.features.map((u) => flatten(u, u.properties.level_id))),
      fixtures: collect((archive.fixture?.features ?? []).map((x) => flatten(x, x.properties.level_id))),
      openings: collect(archive.opening.features.map((o) => flatten(o, o.properties.level_id))),
      amenities: collect(
        (archive.amenity?.features ?? []).map((a) => {
          const unit = archive.unit.features.find((u) => u.id === a.properties.unit_ids[0]);
          return flatten(a, unit?.properties.level_id ?? '');
        }),
      ),
    },
  };
}

/** 从 `${baseUrl}/<file>.json` 读取 IMDF 目录；可选文件缺失时视为空 */
export async function fetchImdf(baseUrl: string, fetchFn: typeof fetch = fetch): Promise<ImdfArchive> {
  const base = baseUrl.replace(/\/$/, '');
  const entries = await Promise.all(
    IMDF_FILES.map(async (file) => {
      const res = await fetchFn(`${base}/${file}.json`);
      if (!res.ok) {
        if ((OPTIONAL_FILES as readonly string[]).includes(file)) {
          return [file, { type: 'FeatureCollection', features: [] }] as const;
        }
        throw new Error(`failed to load ${file}.json (${res.status})`);
      }
      return [file, await res.json()] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as ImdfArchive;
}
