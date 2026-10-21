import { describe, expect, it } from 'vitest';
import { createAlarmEngine, type MuseumSnapshot, type SensorReading } from '../src/index';
import { DEVICES, LEVELS, makeMuseum, OBJECTS, UNITS } from './fixture';

const H = 3600_000;
const museum = makeMuseum();

const reading = (code: string, values: Record<string, number>, extra: Partial<SensorReading> = {}) => ({
  deviceId: DEVICES[code]!,
  online: true,
  battery: 90,
  values,
  ...extra,
});

/** 开馆中、一切正常的状态 */
const base = (patch: Partial<MuseumSnapshot> = {}): MuseumSnapshot => ({
  now: 11 * H,
  readings: [
    reading('CL-G1', { temperature: 22, humidity: 55 }),
    reading('CL-C1', { temperature: 22, humidity: 55 }),
    reading('LX-C1', { illuminance: 45, uv: 5 }),
    reading('MO-G1', { motion: 1 }),
    reading('DR-C1', { open: 0 }),
    reading('VB-C1', { acceleration: 0.05 }),
    reading('PX-C2', { near: 0 }),
  ],
  occupancy: new Map([[UNITS.g1, 8]]),
  taggedVisitors: [],
  objects: [
    { objectId: OBJECTS['O-1']!, lxh: 50_000, displayDays: 30 },
    { objectId: OBJECTS['O-4']!, lxh: 100_000, displayDays: 20 },
  ],
  openCases: new Set(),
  missedCheckpoints: [],
  ...patch,
});

const rules = (alarms: { rule: string }[]) => alarms.map((a) => a.rule);

describe('museum alarm engine', () => {
  it('raises nothing when everything is normal', () => {
    expect(createAlarmEngine(museum).check(base())).toEqual([]);
  });

  it('tier 1: motion in a gallery after closing, a visitor in a staff room, a full gallery', () => {
    const engine = createAlarmEngine(museum);
    const night = engine.check(base({ now: 22 * H }));
    expect(rules(night)).toEqual(['after-hours']);
    expect(night[0]).toMatchObject({ tier: 'access', level: 'high', unitId: UNITS.g1, levelId: LEVELS.l1 });
    // 库房里的人感是职员，不算
    expect(
      rules(
        createAlarmEngine(museum).check(base({ now: 22 * H, readings: [reading('MO-S1', { motion: 1 })] })),
      ),
    ).toEqual([]);
    const busy = createAlarmEngine(museum).check(
      base({ occupancy: new Map([[UNITS.g1, 21]]), taggedVisitors: [{ id: 'V-1', unitId: UNITS.s1 }] }),
    );
    expect(rules(busy).sort()).toEqual(['over-capacity', 'staff-area']);
    expect(busy.find((a) => a.rule === 'over-capacity')!.value).toBe(21);
  });

  it('tier 2: temperature, humidity and light against the strictest object in the case', () => {
    const alarms = createAlarmEngine(museum).check(
      base({
        readings: [
          reading('CL-C1', { temperature: 25, humidity: 63 }),
          // 油画以外没有展品的 G1 房间按纸本（最严格）判断
          reading('CL-G1', { temperature: 22, humidity: 49 }),
          reading('LX-C1', { illuminance: 80, uv: 5 }),
        ],
      }),
    );
    expect(rules(alarms)).toEqual(['temperature', 'humidity', 'humidity', 'illuminance']);
    expect(alarms[0]).toMatchObject({ tier: 'conservation', unitId: UNITS.c1, value: 25 });
  });

  it('tier 2: a daily humidity swing over 10 points, even within range', () => {
    // 陶瓷展示柜的范围是 45–65 %
    const engine = createAlarmEngine(museum);
    const at = (now: number, humidity: number) =>
      engine.check(base({ now, readings: [reading('CL-C2', { temperature: 22, humidity })] }));
    expect(at(1 * H, 46)).toEqual([]);
    expect(at(8 * H, 52)).toEqual([]);
    const swing = at(14 * H, 57.5);
    expect(rules(swing)).toEqual(['humidity-swing']);
    expect(swing[0]!.value).toBeCloseTo(11.5);
    // 一天之后旧读数移出窗口，波动恢复正常
    expect(at(26 * H, 57)).toEqual([]);
    expect(at(40 * H, 57)).toEqual([]);
  });

  it('tier 2: light budget at 80 % and 100 %, display days near the limit', () => {
    const alarms = createAlarmEngine(museum).check(
      base({
        objects: [
          { objectId: OBJECTS['O-1']!, lxh: 100_000, displayDays: 0 },
          { objectId: OBJECTS['O-4']!, lxh: 510_000, displayDays: 52 },
          // 收藏中的不算
          { objectId: OBJECTS['O-3']!, lxh: 200_000, displayDays: 0 },
        ],
      }),
    );
    expect(rules(alarms)).toEqual(['exposure-warning', 'exposure-exceeded', 'display-days']);
    expect(alarms[0]).toMatchObject({ objectId: OBJECTS['O-1'], unitId: UNITS.c1 });
    expect(alarms[0]!.value).toBeCloseTo(100_000 / 120_000);
  });

  it('tier 3: a case opened outside a rotation, vibration, a visitor too close, devices', () => {
    const readings = [
      reading('DR-C1', { open: 1 }),
      reading('VB-C1', { acceleration: 0.8 }),
      reading('PX-C2', { near: 1 }),
      reading('CL-G1', {}, { online: false }),
      reading('LX-C1', { illuminance: 40 }, { battery: 10 }),
    ];
    expect(rules(createAlarmEngine(museum).check(base({ readings })))).toEqual([
      'case-opened',
      'case-vibration',
      'too-close',
      'sensor-offline',
      'low-battery',
    ]);
    // 换展作业中的展示柜可以打开
    expect(
      rules(createAlarmEngine(museum).check(base({ readings, openCases: new Set([UNITS.c1]) }))),
    ).not.toContain('case-opened');
  });

  it('tier 3: each missed checkpoint once', () => {
    const engine = createAlarmEngine(museum);
    const missed = [{ key: 'P1:10:CP-1', unitId: UNITS.g1, time: 10 * H }];
    expect(rules(engine.check(base({ missedCheckpoints: missed })))).toEqual(['missed-checkpoint']);
    expect(engine.check(base({ missedCheckpoints: missed }))).toEqual([]);
    expect(engine.check(base())).toEqual([]);
  });

  it('reports a lasting condition once and again after it clears', () => {
    const engine = createAlarmEngine(museum);
    const hot = base({ readings: [reading('CL-C1', { temperature: 26, humidity: 55 })] });
    const first = engine.check(hot);
    expect(first).toHaveLength(1);
    expect(first[0]!.id).toBe('MA-00001');
    expect(engine.check(hot)).toEqual([]);
    expect(engine.check(base())).toEqual([]);
    expect(engine.check(hot)[0]!.id).toBe('MA-00002');
  });
});

describe('alarm hysteresis', () => {
  it('does not raise again while a reading jitters around the limit', () => {
    const engine = createAlarmEngine(museum);
    const temp = (temperature: number) =>
      engine.check(base({ readings: [reading('CL-C1', { temperature, humidity: 55 })] }));
    expect(temp(24.2)).toHaveLength(1);
    // 回到 23.8 还在回差里，不算解除；再超出也不重报
    expect(temp(23.8)).toEqual([]);
    expect(temp(24.1)).toEqual([]);
    // 回到 23.4 才解除
    expect(temp(23.4)).toEqual([]);
    expect(temp(24.1)).toHaveLength(1);
  });
});

describe('over-capacity hysteresis', () => {
  it('clears only below 90 % of the capacity', () => {
    const engine = createAlarmEngine(museum);
    const count = (n: number) => engine.check(base({ occupancy: new Map([[UNITS.g1, n]]) }));
    expect(rules(count(21))).toEqual(['over-capacity']);
    expect(count(19)).toEqual([]);
    expect(count(21)).toEqual([]);
    expect(count(17)).toEqual([]);
    expect(rules(count(21))).toEqual(['over-capacity']);
  });
});
