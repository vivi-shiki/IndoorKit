import { describe, expect, it, vi } from 'vitest';
import { buildVenueModel, fetchImdf, pickLabel } from '../src/index';
import { IDS, makeArchive } from './fixture';

describe('buildVenueModel', () => {
  it('sorts levels by ordinal', () => {
    const model = buildVenueModel(makeArchive());
    expect(model.levels.map((l) => l.id)).toEqual([IDS.level1, IDS.level2]);
    expect(model.levels[0]!.shortName.en).toBe('1F');
    expect(model.levels[0]!.buildingIds).toEqual([IDS.building]);
  });

  it('uses the venue display point as center and computes bounds', () => {
    const model = buildVenueModel(makeArchive());
    expect(model.center).toEqual([0.001, 0.0005]);
    expect(model.bounds).toEqual([
      [0, 0],
      [0.002, 0.001],
    ]);
  });

  it('exposes features with level_id and category for styling', () => {
    const model = buildVenueModel(makeArchive());
    expect(model.features.units.features).toHaveLength(2);
    expect(model.features.units.features[0]!.properties).toMatchObject({
      level_id: IDS.level1,
      category: 'room',
    });
    expect(model.features.fixtures.features[0]!.properties.category).toBe('wall');
    expect(model.features.openings.features).toHaveLength(1);
    expect(model.features.levels.features).toHaveLength(2);
  });

  it('flattens names into per-language label properties', () => {
    const model = buildVenueModel(makeArchive());
    const room = model.features.units.features[0]!;
    expect(room.properties.label_ja).toBe('内科');
    expect(room.properties.label_en).toBe('Internal Medicine');
  });

  it('describes only standard IMDF features, with no extension data', () => {
    const model = buildVenueModel(makeArchive());
    expect(model.extensions).toEqual({});
    expect(model).not.toHaveProperty('departments');
    for (const u of model.features.units.features)
      expect(Object.keys(u.properties).sort()).not.toContain('department_id');
  });

  it('throws on an invalid archive', () => {
    const archive = makeArchive();
    archive.unit.features[0]!.properties.category = 'spaceship';
    expect(() => buildVenueModel(archive)).toThrow(/invalid IMDF/);
  });
});

describe('pickLabel', () => {
  it('returns the first matching language', () => {
    expect(pickLabel({ ja: '内科', en: 'Internal' }, ['en', 'ja'])).toBe('Internal');
  });
  it('falls back to any available label', () => {
    expect(pickLabel({ ja: '内科' }, ['zh'])).toBe('内科');
  });
  it('returns undefined for missing labels', () => {
    expect(pickLabel(null, ['ja'])).toBeUndefined();
  });
});

describe('fetchImdf', () => {
  const respond = (body: unknown, status = 200) =>
    ({ ok: status === 200, status, json: async () => body }) as Response;

  it('fetches every file under the base url', async () => {
    const archive = makeArchive();
    const fetchFn = vi.fn(async (url: string) => {
      const name = url.split('/').pop()!.replace('.json', '') as keyof typeof archive;
      return respond(archive[name]);
    });
    const result = await fetchImdf('/data/test', fetchFn as unknown as typeof fetch);
    expect(result.unit.features).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledWith('/data/test/manifest.json');
  });

  it('treats a missing optional file as empty', async () => {
    const archive = makeArchive();
    const fetchFn = async (url: string) => {
      const name = url.split('/').pop()!.replace('.json', '');
      if (name === 'amenity') return respond(null, 404);
      return respond(archive[name as keyof typeof archive]);
    };
    const result = await fetchImdf('/d', fetchFn as unknown as typeof fetch);
    expect(result.amenity?.features).toEqual([]);
  });

  it('fails when a required file is missing', async () => {
    const fetchFn = async () => respond(null, 404);
    await expect(fetchImdf('/d', fetchFn as unknown as typeof fetch)).rejects.toThrow(/manifest/);
  });
});
