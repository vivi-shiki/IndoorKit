import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../src/app/mui-theme';
import { BACKDROP_ICONS, backdropLanes, laneMask } from '../src/pages/home/backdrop';
import { BACKDROP_THEMES } from '../src/pages/home/backdrop-icons';

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
const rgba = (c: string) => c.match(/[\d.]+/g)!.map(Number);

describe('home page backdrop', () => {
  it('has icons for cars, medical equipment, dinosaurs, trucks, pillows and armor', () => {
    expect(BACKDROP_THEMES.map((t) => t.id)).toEqual([
      'cars',
      'medical',
      'dinosaurs',
      'trucks',
      'pillows',
      'armor',
    ]);
    for (const theme of BACKDROP_THEMES) expect(theme.icons.length, theme.id).toBeGreaterThanOrEqual(3);
  });

  it('uses only the solid silhouette sets, each icon a single filled path', () => {
    for (const icon of BACKDROP_ICONS) {
      expect(['mdi', 'game-icons']).toContain(icon.set);
      expect(icon.size).toBe(icon.set === 'mdi' ? 24 : 512);
      expect(icon.d).toMatch(/^[mM]/);
      expect(icon.d).not.toMatch(/[<>"]/);
    }
  });

  it('takes one icon from each theme in turn, so neighbouring rows show different things', () => {
    expect(BACKDROP_ICONS.slice(0, 6).map((i) => i.name)).toEqual([
      'car',
      'stethoscope',
      'dinosaur-rex',
      'truck',
      'pillow',
      'breastplate',
    ]);
    expect(BACKDROP_ICONS).toHaveLength(BACKDROP_THEMES.flatMap((t) => t.icons).length);
    expect(new Set(BACKDROP_ICONS).size).toBe(BACKDROP_ICONS.length);
  });

  it('fills each row with one kind of icon and goes through every icon before starting over', () => {
    const n = BACKDROP_ICONS.length;
    const lanes = backdropLanes(n + 3);
    expect(lanes.slice(0, n).map((l) => l.icon)).toEqual(BACKDROP_ICONS);
    expect(lanes.slice(n).map((l) => l.icon)).toEqual(BACKDROP_ICONS.slice(0, 3));
  });

  it('alternates direction and shade row by row', () => {
    const lanes = backdropLanes(10);
    expect(lanes.map((l) => l.reverse)).toEqual(lanes.map((_, i) => i % 2 === 1));
    expect(lanes.map((l) => l.shade)).toEqual(lanes.map((_, i) => (i % 2 === 1 ? 'alt' : 'base')));
  });

  it('draws a row as one icon in a cell taller than the icon, repeated without a seam', () => {
    const icon = BACKDROP_ICONS[0]!;
    const mask = laneMask(icon);
    expect(mask.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).not.toMatch(/stroke/);
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    expect(h! / w!).toBeCloseTo(1.8);
  });

  it('gives odd and even rows a slightly different grey in both themes', () => {
    for (const name of ['light', 'dark'] as const) {
      const [r, g, b, a] = rgba(TOKENS[name].ink);
      const [r2, g2, b2, a2] = rgba(TOKENS[name].inkAlt);
      expect([r2, g2, b2], name).toEqual([r, g, b]);
      expect(Math.abs(a2! - a!), name).toBeGreaterThanOrEqual(0.02);
      expect(Math.abs(a2! - a!), name).toBeLessThanOrEqual(0.06);
    }
    expect(rgba(TOKENS.light.ink).slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('credits both icon sets and their licenses', () => {
    const notice = read('THIRD_PARTY_NOTICES.md');
    expect(notice).toMatch(/Material Design Icons[\s\S]*Apache License 2\.0/);
    expect(notice).toMatch(/game-icons\.net[\s\S]*CC BY 3\.0/);
  });
});
