import { z } from 'zod';

/** IMDF 1.0.0（OGC 20-094）中本项目用到的要素子集 */

export const UNIT_CATEGORIES = [
  'auditorium',
  'brick',
  'classroom',
  'column',
  'concrete',
  'conferenceroom',
  'drywall',
  'elevator',
  'escalator',
  'fieldofplay',
  'firstaid',
  'fitnessroom',
  'foodservice',
  'footbridge',
  'glass',
  'huddleroom',
  'kitchen',
  'laboratory',
  'library',
  'lobby',
  'lounge',
  'mailroom',
  'mothersroom',
  'movietheater',
  'movingwalkway',
  'nonpublic',
  'office',
  'opentobelow',
  'parking',
  'phoneroom',
  'platform',
  'privatelounge',
  'ramp',
  'recreation',
  'restroom',
  'restroom.family',
  'restroom.female',
  'restroom.female.wheelchair',
  'restroom.male',
  'restroom.male.wheelchair',
  'restroom.transgender',
  'restroom.transgender.wheelchair',
  'restroom.unisex',
  'restroom.unisex.wheelchair',
  'restroom.wheelchair',
  'road',
  'room',
  'serverroom',
  'shower',
  'smokingarea',
  'stairs',
  'steps',
  'storage',
  'structure',
  'terrace',
  'theater',
  'unenclosedarea',
  'unspecified',
  'vegetation',
  'waitingroom',
  'walkway',
  'walkway.island',
  'wood',
] as const;

export const FIXTURE_CATEGORIES = [
  'baggagecarousel',
  'desk',
  'equipment',
  'furniture',
  'obstruction',
  'platform',
  'stage',
  'vegetation',
  'wall',
  'water',
] as const;

export const OPENING_CATEGORIES = [
  'automobile',
  'bicycle',
  'emergencyexit',
  'pedestrian',
  'pedestrian.principal',
  'pedestrian.transit',
  'service',
] as const;

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'must be a UUID');
const position = z.tuple([z.number(), z.number()]);
const ring = z.array(position).min(4);
const point = z.object({ type: z.literal('Point'), coordinates: position });
const lineString = z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) });
const polygon = z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) });
const multiPolygon = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(z.array(ring).min(1)),
});
const area = z.union([polygon, multiPolygon]);

export const labels = z.record(z.string(), z.string());
const nullableLabels = labels.nullable().optional();

function feature<T extends string, G extends z.ZodType, P extends z.ZodRawShape>(
  type: T,
  geometry: G,
  props: P,
) {
  return z.object({
    type: z.literal('Feature'),
    id: uuid,
    feature_type: z.literal(type),
    geometry,
    properties: z.looseObject(props),
  });
}

const collection = <F extends z.ZodType>(f: F) =>
  z.object({ type: z.literal('FeatureCollection'), features: z.array(f) });

export const manifestSchema = z.looseObject({
  version: z.string(),
  created: z.string(),
  language: z.string(),
});

export const venueFeature = feature('venue', area, {
  category: z.string(),
  name: labels,
  alt_name: nullableLabels,
  display_point: point,
});

export const buildingFeature = feature('building', z.null(), {
  category: z.string(),
  name: nullableLabels,
});

export const levelFeature = feature('level', area, {
  category: z.string(),
  ordinal: z.number().int(),
  outdoor: z.boolean(),
  name: labels,
  short_name: labels,
  building_ids: z.array(uuid).nullable(),
});

export const unitFeature = feature('unit', area, {
  category: z.enum(UNIT_CATEGORIES),
  level_id: uuid,
  name: nullableLabels,
});

export const openingFeature = feature('opening', lineString, {
  category: z.enum(OPENING_CATEGORIES),
  level_id: uuid,
});

export const fixtureFeature = feature('fixture', area, {
  category: z.enum(FIXTURE_CATEGORIES),
  level_id: uuid,
  name: nullableLabels,
});

export const amenityFeature = feature('amenity', point, {
  category: z.string(),
  unit_ids: z.array(uuid),
  name: nullableLabels,
});

/**
 * IMDF 扩展：科室。标准的 occupant 挂在 anchor 上、一对一，表达不了「一个科室有多个区块」，
 * 所以用单独的文件列出科室包含的区块。
 */
export const departmentFeature = feature('department', z.null(), {
  code: z.string().min(1),
  name: labels,
  unit_ids: z.array(uuid).min(1),
});

export const archiveSchemas = {
  manifest: manifestSchema,
  venue: collection(venueFeature),
  building: collection(buildingFeature),
  level: collection(levelFeature),
  unit: collection(unitFeature),
  opening: collection(openingFeature),
  fixture: collection(fixtureFeature),
  amenity: collection(amenityFeature),
  department: collection(departmentFeature),
};

export const REQUIRED_FILES = ['manifest', 'venue', 'building', 'level', 'unit', 'opening'] as const;
export const OPTIONAL_FILES = ['fixture', 'amenity', 'department'] as const;
export const IMDF_FILES = [...REQUIRED_FILES, ...OPTIONAL_FILES] as const;
export type ImdfFileName = (typeof IMDF_FILES)[number];
