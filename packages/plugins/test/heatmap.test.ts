import { describe, expect, it } from 'vitest';
import { floorPlugin, heatmapPlugin } from '../src/index';
import { batch, featureCollection, IDS, openMap, tag } from './helpers';

const MIN = 60_000;

async function open() {
  const opened = await openMap([floorPlugin, heatmapPlugin({ cellMeters: 2 })]);
  return { ...opened, heat: opened.map.plugins.heatmap };
}

describe('heatmapPlugin', () => {
  it('counts only samples inside the time window', async () => {
    const { heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0])]));
    heat.add(batch(10 * MIN, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0.0001, 0])]));
    heat.setWindow(5);
    expect(heat.window()).toBe(5);
    expect(heat.pointCount()).toBe(2);
    heat.setWindow(15);
    expect(heat.pointCount()).toBe(3);
  });

  it('shows only the current floor and updates when the floor changes', async () => {
    const { map, fake, heat } = await open();
    heat.add(
      batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level2, [0, 0]), tag('c', IDS.level2, [0, 0])]),
    );
    const levels = () => featureCollection(fake, 'indoor-heat').features.map((f) => f.properties!.level_id);
    expect(new Set(levels())).toEqual(new Set([IDS.level1]));
    expect(heat.pointCount()).toBe(1);
    map.plugins.floor.set('2F');
    expect(new Set(levels())).toEqual(new Set([IDS.level2]));
    expect(heat.pointCount()).toBe(2);
  });

  it('aggregates samples into weighted grid cells', async () => {
    const { fake, heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0.000001, 0])]));
    const cells = featureCollection(fake, 'indoor-heat').features;
    expect(cells).toHaveLength(1);
    expect(cells[0]!.properties!.weight).toBe(2);
  });

  it('collects batches broadcast on the map', async () => {
    const { map, heat } = await open();
    map.events.emit('positions:update', batch(0, [tag('a', IDS.level1, [0, 0])]));
    expect(heat.pointCount()).toBe(1);
  });

  it('keeps memory bounded by dropping minutes older than the largest window', async () => {
    const { heat } = await open();
    for (let m = 0; m < 60; m++) heat.add(batch(m * MIN, [tag('a', IDS.level1, [0, 0])]));
    expect(heat.bucketCount()).toBeLessThanOrEqual(16);
  });

  it('rejects windows other than 1, 5 and 15 minutes', async () => {
    const { heat } = await open();
    expect(() => heat.setWindow(7 as 5)).toThrow(/window/);
  });

  it('splits samples into groups and shows only the selected groups', async () => {
    const opened = await openMap([
      floorPlugin,
      heatmapPlugin({ cellMeters: 2, groupOf: (p) => (p.id.startsWith('v') ? 'visitor' : 'staff') }),
    ]);
    const heat = opened.map.plugins.heatmap;
    heat.add(
      batch(0, [tag('v1', IDS.level1, [0, 0]), tag('s1', IDS.level1, [0, 0]), tag('s2', IDS.level1, [0, 0])]),
    );
    expect(heat.pointCount()).toBe(3);
    heat.setGroups(['visitor']);
    expect(heat.pointCount()).toBe(1);
    expect(heat.groups()).toEqual(['visitor']);
    heat.setGroups(null);
    expect(heat.pointCount()).toBe(3);
  });

  it('reports the samples per cell centre so callers can rank areas', async () => {
    const { heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0, 0])]));
    const cells = heat.data();
    expect(cells).toHaveLength(1);
    expect(cells[0]!.properties!.weight).toBe(2);
  });
});

/**
 * 按 Mapbox「Create a heatmap layer」示例：缩小时看热力图，放大到一定级别后热力图淡出，
 * 换成按权重着色、带白边的圆点；两者在一段缩放区间内交叉淡入淡出，用同一套色带。
 */
describe('heatmap display by zoom', () => {
  type Expr = unknown[];
  /** ['interpolate', ['linear'], input, in1, out1, in2, out2, ...] 拆成输入和输出 */
  const stops = (expr: unknown) => {
    const e = expr as Expr;
    expect(e[0]).toBe('interpolate');
    const pairs = e.slice(3);
    return {
      input: e[2],
      ins: pairs.filter((_, i) => i % 2 === 0) as number[],
      outs: pairs.filter((_, i) => i % 2 === 1),
    };
  };
  const increasing = (values: number[]) => values.every((v, i) => i === 0 || v > values[i - 1]!);
  const paintOf = (layer: unknown) => (layer as { paint: Record<string, unknown> }).paint;

  it('draws a heatmap when zoomed out and fades it out between zoom 19 and 21', async () => {
    const { fake } = await open();
    const layer = fake.getLayer('indoor-heat') as { type: string; maxzoom: number };
    expect(layer.type).toBe('heatmap');
    expect(layer.maxzoom).toBe(21);
    const paint = paintOf(layer);
    expect(paint['heatmap-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 19, 1, 21, 0]);
    // 半径和强度随缩放增大，放大时光斑跟着变大
    for (const key of ['heatmap-radius', 'heatmap-intensity']) {
      const s = stops(paint[key]);
      expect(s.input).toEqual(['zoom']);
      expect(increasing(s.outs as number[])).toBe(true);
    }
    expect(stops(paint['heatmap-weight']).input).toEqual(['get', 'weight']);
    expect(stops(paint['heatmap-color']).input).toEqual(['heatmap-density']);
  });

  it('colors cells as circles from zoom 19, fading them in by zoom 20', async () => {
    const { fake } = await open();
    const layer = fake.getLayer('indoor-heat-point') as { type: string; source: string; minzoom: number };
    expect(layer).toMatchObject({ type: 'circle', source: 'indoor-heat', minzoom: 19 });
    const paint = paintOf(layer);
    expect(paint['circle-opacity']).toEqual(['interpolate', ['linear'], ['zoom'], 19, 0, 20, 1]);
    expect(paint['circle-stroke-color']).toBe('white');
    expect(paint['circle-stroke-width']).toBe(1);

    // 颜色按权重，与热力图同一套色带
    const color = stops(paint['circle-color']);
    expect(color.input).toEqual(['get', 'weight']);
    expect(increasing(color.ins)).toBe(true);
    expect(color.outs).toEqual(stops(paintOf(fake.getLayer('indoor-heat'))['heatmap-color']).outs);

    // 大小按缩放，每个缩放级别里再按权重变大
    const radius = stops(paint['circle-radius']);
    expect(radius.input).toEqual(['zoom']);
    for (const inner of radius.outs) {
      const byWeight = stops(inner);
      expect(byWeight.input).toEqual(['get', 'weight']);
      expect(increasing(byWeight.outs as number[])).toBe(true);
    }
  });

  it('gives every cell its own id', async () => {
    const { fake, heat } = await open();
    heat.add(batch(0, [tag('a', IDS.level1, [0, 0]), tag('b', IDS.level1, [0.0001, 0])]));
    const ids = featureCollection(fake, 'indoor-heat').features.map((f) => f.properties!.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});
