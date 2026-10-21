import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backdropLanes, laneMask } from '../src/pages/home/backdrop';
import { BACKDROP_THEMES } from '../src/pages/home/backdrop-icons';

const read = (file: string) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');

describe('home page backdrop', () => {
  it('has a column for cars, medical equipment, dinosaurs, trucks, pillows and armor', () => {
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
    for (const theme of BACKDROP_THEMES) {
      for (const icon of theme.icons) {
        expect(['mdi', 'game-icons']).toContain(icon.set);
        expect(icon.size).toBe(icon.set === 'mdi' ? 24 : 512);
        expect(icon.d).toMatch(/^[mM]/);
        expect(icon.d).not.toMatch(/[<>"]/);
      }
    }
  });

  it('alternates direction lane by lane and cycles through every theme', () => {
    const lanes = backdropLanes(14);
    expect(lanes.map((l) => l.reverse)).toEqual(lanes.map((_, i) => i % 2 === 1));
    expect(lanes.slice(0, 6).map((l) => l.theme.id)).toEqual(BACKDROP_THEMES.map((t) => t.id));
    expect(lanes[6]!.theme).toBe(BACKDROP_THEMES[0]);
  });

  it('draws a lane as one tile of filled icons stacked top to bottom, so it can repeat seamlessly', () => {
    const theme = BACKDROP_THEMES[2]!;
    const mask = laneMask(theme);
    expect(mask.startsWith('url("data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(mask.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg.match(/<path /g)).toHaveLength(theme.icons.length);
    expect(svg).not.toMatch(/stroke/);
    // 每个图标占一格，格子从上到下排列，整张图的高度正好是格数乘格高
    const ys = [...svg.matchAll(/<svg y="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(ys).toEqual(theme.icons.map((_, i) => ys[0]! + i * (ys[1]! - ys[0]!)));
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/)!.map(Number);
    expect(h).toBe(theme.icons.length * (ys[1]! - ys[0]!));
    expect(w).toBeGreaterThan(0);
  });

  it('credits both icon sets and their licenses', () => {
    const notice = read('THIRD_PARTY_NOTICES.md');
    expect(notice).toMatch(/Material Design Icons[\s\S]*Apache License 2\.0/);
    expect(notice).toMatch(/game-icons\.net[\s\S]*CC BY 3\.0/);
  });
});
