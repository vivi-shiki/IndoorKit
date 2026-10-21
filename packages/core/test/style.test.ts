import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import { buildIndoorStyle, themes } from '../src/index';

const venue = buildVenueModel(makeArchive());

describe('buildIndoorStyle', () => {
  const style = buildIndoorStyle(venue, themes.light, ['ja', 'en']);

  it('only references sources it defines', () => {
    const sourceIds = new Set(style.sources.map((s) => s.id));
    for (const layer of style.layers) {
      if ('source' in layer) expect(sourceIds.has(layer.source as string)).toBe(true);
    }
  });

  it('prefixes every layer id with indoor-', () => {
    for (const layer of style.layers) expect(layer.id.startsWith('indoor-')).toBe(true);
  });

  it('extrudes walls to 2.5D', () => {
    const walls = style.layers.find((l) => l.id === 'indoor-walls')!;
    expect(walls.type).toBe('fill-extrusion');
    const paint = (walls as { paint: Record<string, unknown> }).paint;
    expect(paint['fill-extrusion-height']).toBe(themes.light.wallHeight);
  });

  it('colours units by category from the theme', () => {
    const units = style.layers.find((l) => l.id === 'indoor-units')!;
    const color = JSON.stringify((units as { paint: Record<string, unknown> }).paint['fill-extrusion-color']);
    for (const c of ['room', 'walkway', 'elevator', 'stairs', 'restroom', 'parking', 'road', 'ramp']) {
      expect(color).toContain(c);
      expect(color).toContain(themes.light.unitColors[c]!);
    }
  });

  it('labels units in the preferred language with fallback', () => {
    const labels = style.layers.find((l) => l.id === 'indoor-labels')!;
    const text = JSON.stringify((labels as { layout: Record<string, unknown> }).layout['text-field']);
    expect(text.indexOf('label_ja')).toBeLessThan(text.indexOf('label_en'));
  });

  it('marks every layer that depends on the floor', () => {
    expect(style.levelLayerIds).toEqual(
      expect.arrayContaining(['indoor-units', 'indoor-walls', 'indoor-openings', 'indoor-labels']),
    );
  });
});
