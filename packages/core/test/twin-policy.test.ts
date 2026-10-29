import { describe, expect, it } from 'vitest';
import {
  createFrameGovernor,
  detectLevel,
  focusStyle,
  needsReload,
  nextView,
  placeLabels,
  RENDER_PRESETS,
  resolveSettings,
  sectionCut,
  shadowExtent,
  shouldOrbit,
  sunAt,
} from '../src/twin/policy';

describe('twin rendering policy', () => {
  it('uses hysteresis to avoid flashing at the indoor threshold', () => {
    expect(nextView('outdoor', 18.9)).toBe('indoor');
    expect(nextView('indoor', 18.7)).toBe('indoor');
    expect(nextView('outdoor', 18.7)).toBe('outdoor');
    expect(nextView('indoor', 18.4)).toBe('outdoor');
  });
});

describe('render levels', () => {
  it('follows the agreed switch matrix from battery saver to ultra', () => {
    expect(RENDER_PRESETS.L0).toMatchObject({
      pixelRatio: 1,
      antialias: false,
      sky: false,
      model: 'extrusion',
      floors: false,
      props: 0,
      groundTexture: false,
      environment: false,
      shadows: 0,
      outline: false,
    });
    expect(RENDER_PRESETS.L1).toMatchObject({
      antialias: true,
      sky: true,
      model: 'low',
      props: 0.5,
      shadows: 0,
    });
    expect(RENDER_PRESETS.L2).toMatchObject({
      model: 'high',
      props: 1,
      groundTexture: true,
      environment: true,
      shadows: 1024,
      floors: false,
    });
    expect(RENDER_PRESETS.L3).toMatchObject({
      floors: true,
      shadows: 2048,
      outline: true,
      softShadows: false,
    });
    expect(RENDER_PRESETS.L4).toMatchObject({ pixelRatio: 2, softShadows: true });
    // 档位越高，像素比不降低
    const ratios = (['L0', 'L1', 'L2', 'L3', 'L4'] as const).map((l) => RENDER_PRESETS[l].pixelRatio);
    expect([...ratios].sort((a, b) => a - b)).toEqual(ratios);
  });

  it('merges preset < site defaults < user overrides', () => {
    const site = { outline: false, props: 0.5 } as const;
    expect(resolveSettings('L3', site)).toMatchObject({ outline: false, props: 0.5, floors: true });
    expect(resolveSettings('L3', site, { outline: true, shadows: 0 })).toMatchObject({
      outline: true,
      props: 0.5,
      shadows: 0,
    });
    // 没有覆盖的项跟随档位
    expect(resolveSettings('L1', site, { shadows: 2048 }).model).toBe('low');
  });

  it('rejects overrides that name an unknown switch or carry the wrong type', () => {
    expect(() => resolveSettings('L2', undefined, { glow: true } as never)).toThrow(/glow/);
    expect(() => resolveSettings('L2', undefined, { shadows: 512 } as never)).toThrow(/shadows/);
  });

  it('picks a starting level from what the device reports', () => {
    expect(detectLevel({ width: 390, cores: 8, saveData: false })).toBe('L1');
    expect(detectLevel({ width: 1440, cores: 4, saveData: false })).toBe('L1');
    expect(detectLevel({ width: 1440, cores: 8, saveData: true })).toBe('L0');
    expect(detectLevel({ width: 1440, cores: 8, saveData: false })).toBe('L2');
    expect(detectLevel({ width: 1440, cores: 8, memory: 2, saveData: false })).toBe('L1');
    expect(
      detectLevel({ width: 1440, cores: 12, memory: 16, saveData: false, gpu: 'NVIDIA GeForce RTX 3070' }),
    ).toBe('L3');
    expect(detectLevel({ width: 1440, cores: 12, saveData: false, gpu: 'Google SwiftShader' })).toBe('L1');
  });

  it('steps down on sustained slow frames and back up after sustained fast ones, within its ceiling', () => {
    const governor = createFrameGovernor('L3', 'L3');
    let level = governor.level;
    for (let i = 0; i < 23; i++) level = governor.sample(60) ?? level;
    expect(level).toBe('L3');
    level = governor.sample(60) ?? level;
    expect(level).toBe('L2');
    // 一次快帧不会马上升档
    expect(governor.sample(10)).toBeNull();
    let changed: string | null = null;
    for (let i = 0; i < 400 && !changed; i++) changed = governor.sample(10);
    expect(changed).toBe('L3');
    for (let i = 0; i < 1000; i++) expect(governor.sample(10)).toBeNull();
    // 拖动后停顿很久的帧不计入
    for (let i = 0; i < 50; i++) expect(governor.sample(900)).toBeNull();
  });

  it('reloads the model only when the file contents differ', () => {
    expect(needsReload(RENDER_PRESETS.L2, { ...RENDER_PRESETS.L2, shadows: 0, outline: true })).toBe(false);
    expect(needsReload(RENDER_PRESETS.L2, { ...RENDER_PRESETS.L2, environment: false, sky: false })).toBe(
      false,
    );
    expect(needsReload(RENDER_PRESETS.L1, RENDER_PRESETS.L2)).toBe(true);
    expect(needsReload(RENDER_PRESETS.L2, { ...RENDER_PRESETS.L2, props: 0.5 })).toBe(true);
  });
});

describe('lighting', () => {
  it('tightens the shadow camera as the camera moves closer', () => {
    expect(shadowExtent(16)).toBeGreaterThan(shadowExtent(17.5));
    expect(shadowExtent(17.5)).toBeGreaterThan(shadowExtent(19));
    expect(shadowExtent(22)).toBeGreaterThanOrEqual(30);
    expect(shadowExtent(10)).toBeLessThanOrEqual(400);
  });
  it('moves the sun with the simulated hour and turns the lights on at night', () => {
    const noon = sunAt(12);
    const morning = sunAt(8);
    expect(noon.elevation).toBeGreaterThan(morning.elevation);
    expect(noon.night).toBe(false);
    expect(sunAt(21).night).toBe(true);
    expect(sunAt(3).night).toBe(true);
    expect(sunAt(21).intensity).toBeLessThan(noon.intensity);
    // 上午在东边，下午在西边（方位角从北顺时针）
    expect(morning.azimuth).toBeLessThan(180);
    expect(sunAt(16).azimuth).toBeGreaterThan(180);
  });
});

describe('scene interaction', () => {
  it('cuts the building at the selected floor', () => {
    expect(sectionCut([-1, 0, 1, 2], 1)).toEqual({ '-1': 'ghost', 0: 'ghost', 1: 'solid', 2: 'hidden' });
    expect(sectionCut([0, 1], null)).toEqual({ 0: 'hidden', 1: 'hidden' });
  });
  it('lowers and fades the other buildings while one is focused', () => {
    expect(focusStyle(null, 'a')).toEqual({ scaleY: 1, opacity: 1 });
    expect(focusStyle('a', 'a')).toEqual({ scaleY: 1, opacity: 1 });
    expect(focusStyle('a', 'b')).toEqual({ scaleY: 0.4, opacity: 0.35 });
  });
  it('keeps the higher-priority label when two overlap and drops labels off screen', () => {
    const shown = placeLabels(
      [
        { id: 'entrance', x: 100, y: 100, width: 60, height: 20, priority: 1 },
        { id: 'building', x: 110, y: 105, width: 80, height: 20, priority: 2 },
        { id: 'far', x: 300, y: 100, width: 60, height: 20, priority: 1 },
        { id: 'outside', x: -100, y: 100, width: 60, height: 20, priority: 3 },
      ],
      { width: 800, height: 600 },
    );
    expect([...shown].sort()).toEqual(['building', 'far']);
  });
  it('orbits only outdoors after a quiet period and never with reduced motion', () => {
    expect(shouldOrbit({ idleMs: 25_000, reducedMotion: false, view: 'outdoor' })).toBe(true);
    expect(shouldOrbit({ idleMs: 5_000, reducedMotion: false, view: 'outdoor' })).toBe(false);
    expect(shouldOrbit({ idleMs: 25_000, reducedMotion: true, view: 'outdoor' })).toBe(false);
    expect(shouldOrbit({ idleMs: 25_000, reducedMotion: false, view: 'indoor' })).toBe(false);
  });
});
