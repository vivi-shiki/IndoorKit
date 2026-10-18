import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import { createIndoorMap, labelExpression, languageFallbacks } from '../src/index';
import { type FakeMap, fakeMapFactory } from '../src/testing';

const venue = buildVenueModel(makeArchive());

async function open(languages?: readonly string[]) {
  let fake!: FakeMap;
  const map = await createIndoorMap({
    container: 'map',
    venue,
    languages,
    mapFactory: fakeMapFactory((m) => {
      fake = m;
    }),
  });
  return { map, fake };
}

describe('languageFallbacks', () => {
  it('puts the chosen language first and keeps the others as fallbacks', () => {
    expect(languageFallbacks('zh')).toEqual(['zh', 'ja', 'en']);
    expect(languageFallbacks('en')).toEqual(['en', 'ja', 'zh']);
    expect(languageFallbacks('ja')).toEqual(['ja', 'en', 'zh']);
  });
});

describe('labelExpression', () => {
  it('reads label properties in priority order', () => {
    expect(labelExpression(['en', 'ja'])).toEqual(['coalesce', ['get', 'label_en'], ['get', 'label_ja']]);
  });
});

describe('IndoorMap languages', () => {
  it('starts with the languages it was created with', async () => {
    const { map, fake } = await open(['zh', 'ja', 'en']);
    expect(map.languages).toEqual(['zh', 'ja', 'en']);
    expect(fake.getLayoutProperty('indoor-labels', 'text-field')).toEqual(
      labelExpression(['zh', 'ja', 'en']),
    );
  });

  it('switches map labels at runtime without recreating the map', async () => {
    const { map, fake } = await open(['ja', 'en']);
    map.setLanguages(['en', 'ja', 'zh']);
    expect(map.languages).toEqual(['en', 'ja', 'zh']);
    expect(fake.getLayoutProperty('indoor-labels', 'text-field')).toEqual(
      labelExpression(['en', 'ja', 'zh']),
    );
    expect(fake.removed).toBe(false);
  });

  it('emits language:change', async () => {
    const { map } = await open(['ja']);
    const seen: unknown[] = [];
    map.events.on('language:change', (e) => seen.push(e));
    map.setLanguages(['zh', 'ja', 'en']);
    expect(seen).toEqual([{ languages: ['zh', 'ja', 'en'] }]);
  });

  it('rejects an empty language list', async () => {
    const { map } = await open();
    expect(() => map.setLanguages([])).toThrow(/at least one language/);
  });
});
