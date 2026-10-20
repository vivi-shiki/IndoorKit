import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildVenueModel,
  collection,
  defineImdfExtension,
  feature,
  fetchImdf,
  type ImdfArchive,
  labels,
  type RawCollection,
  uuid,
  validateImdf,
} from '../src/index';
import { IDS, makeArchive } from './fixture';

/** 一个与任何行业无关的扩展：把区块分成若干「片区」 */
const sectionExtension = defineImdfExtension({
  file: 'section',
  schema: collection(feature('section', z.null(), { name: labels, unit_ids: z.array(uuid).min(1) })),
  check(sections, archive) {
    const units = new Set(archive.unit.features.map((u) => u.id));
    return sections.features.flatMap((s) =>
      (s.properties.unit_ids as string[])
        .filter((id) => !units.has(id))
        .map((id) => ({ path: s.id, message: `unknown unit ${id}` })),
    );
  },
  build: (sections) => sections.features.map((s) => ({ id: s.id, unitIds: s.properties.unit_ids as string[] })),
});

const SECTION = '00000000-0000-4000-8000-0000000000c1';
function withSections(unitIds: string[] = [IDS.room]): ImdfArchive {
  const archive = makeArchive();
  const sections: RawCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: SECTION,
        feature_type: 'section',
        geometry: null,
        properties: { name: { en: 'West' }, unit_ids: unitIds },
      },
    ],
  };
  archive.section = sections;
  return archive;
}

describe('IMDF extensions', () => {
  it('validates the extension file with its schema and its cross-checks', () => {
    expect(validateImdf(withSections(), [sectionExtension]).ok).toBe(true);
    const unknown = validateImdf(withSections(['00000000-0000-4000-8000-0000000000ff']), [sectionExtension]);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok)
      expect(unknown.issues).toContainEqual({
        file: 'section',
        path: SECTION,
        message: 'unknown unit 00000000-0000-4000-8000-0000000000ff',
      });
    const empty = validateImdf(withSections([]), [sectionExtension]);
    expect(empty.ok).toBe(false);
  });

  it('builds the extension data into venue.extensions', () => {
    const venue = buildVenueModel(withSections(), [sectionExtension]);
    expect(venue.extensions.section).toEqual([{ id: SECTION, unitIds: [IDS.room] }]);
  });

  it('treats a missing extension file as empty', () => {
    const venue = buildVenueModel(makeArchive(), [sectionExtension]);
    expect(venue.extensions.section).toEqual([]);
  });

  it('rejects an extension that reuses a standard file name', () => {
    expect(() => defineImdfExtension({ ...sectionExtension, file: 'unit' })).toThrow(/standard IMDF file/);
  });

  it('fetches extension files, and treats a missing one as empty', async () => {
    const archive = withSections();
    const respond = (body: unknown, status = 200) =>
      ({ ok: status === 200, status, json: async () => body }) as Response;
    const fetchFn = async (url: string) => {
      const name = url.split('/').pop()!.replace('.json', '');
      return name in archive ? respond(archive[name]) : respond(null, 404);
    };
    const fetched = await fetchImdf('/d', fetchFn as unknown as typeof fetch, [sectionExtension]);
    expect((fetched.section as RawCollection).features).toHaveLength(1);
    const without = await fetchImdf(
      '/d',
      (async (url: string) => (url.endsWith('section.json') ? respond(null, 404) : fetchFn(url))) as unknown as typeof fetch,
      [sectionExtension],
    );
    expect((without.section as RawCollection).features).toEqual([]);
  });
});
