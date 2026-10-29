import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/app/routes';
import { TWIN_MESSAGES } from '../src/app/twin/messages';
import { loadQuality, QUALITY_KEY, saveQuality } from '../src/app/twin/quality-store';
import { museumRoomStatus } from '../src/museum/adapters/twin-status';
import { parkingLevelStatus } from '../src/parking/adapters/twin-status';

describe('digital twin routes', () => {
  it('provides the same vocabulary in all three languages', () => {
    for (const dictionary of Object.values(TWIN_MESSAGES)) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(TWIN_MESSAGES.en).sort());
      expect(Object.values(dictionary).every((s) => s.trim().length > 0)).toBe(true);
    }
  });
  it('names every render level, switch and new control', () => {
    for (const key of [
      'levelL0',
      'levelL1',
      'levelL2',
      'levelL3',
      'levelL4',
      'auto',
      'advanced',
      'follow',
      'on',
      'off',
      'settingShadows',
      'settingOutline',
      'settingFloors',
      'settingEnvironment',
      'settingSky',
      'settingAntialias',
      'perf',
      'resetView',
      'enterFloor',
      'storeys',
    ]) {
      expect(TWIN_MESSAGES.en, key).toHaveProperty(key);
    }
    // 面板只留业务信息，性能数字移到画质弹层
    expect(TWIN_MESSAGES.en).not.toHaveProperty('meshes');
  });
  for (const scenario of ['hospital', 'parking', 'museum']) {
    it(`opens the ${scenario} twin directly`, () => {
      const { route, redirect } = parseRoute(`#/${scenario}/twin`);
      expect(redirect).toBeUndefined();
      expect(route).toMatchObject({ name: scenario, page: 'twin' });
    });
  }
});

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('quality preferences', () => {
  it('starts on automatic with no overrides', () => {
    expect(loadQuality(new MemoryStorage())).toEqual({ quality: 'auto', overrides: {} });
  });
  it('round-trips the level and per-switch overrides', () => {
    const storage = new MemoryStorage();
    saveQuality(storage, { quality: 'L3', overrides: { shadows: 0, outline: false } });
    expect(loadQuality(storage)).toEqual({ quality: 'L3', overrides: { shadows: 0, outline: false } });
  });
  it('ignores corrupt or unknown stored values', () => {
    const storage = new MemoryStorage();
    storage.setItem(QUALITY_KEY, '{not json');
    expect(loadQuality(storage)).toEqual({ quality: 'auto', overrides: {} });
    storage.setItem(QUALITY_KEY, JSON.stringify({ quality: 'L9', overrides: { glow: true, shadows: 512 } }));
    expect(loadQuality(storage)).toEqual({ quality: 'auto', overrides: {} });
  });
  it('keeps working when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadQuality(blocked)).toEqual({ quality: 'auto', overrides: {} });
    expect(() => saveQuality(blocked, { quality: 'L1', overrides: {} })).not.toThrow();
  });
});

describe('data painted on the model', () => {
  it('colours parking levels by the share of free spaces', () => {
    const total = new Map([
      ['a', 100],
      ['b', 100],
      ['c', 100],
      ['d', 0],
    ]);
    const free = new Map([
      ['a', 40],
      ['b', 20],
      ['c', 5],
      ['d', 0],
    ]);
    expect(parkingLevelStatus(free, total)).toEqual([
      { levelId: 'a', status: 'good' },
      { levelId: 'b', status: 'warn' },
      { levelId: 'c', status: 'critical' },
    ]);
  });
  it('colours museum rooms with alarms raised in the last hour', () => {
    const hour = 3_600_000;
    const alarms = [
      { unitId: 'r1', levelId: 'l1', level: 'high', time: 10 * hour },
      { unitId: 'r2', levelId: 'l1', level: 'low', time: 10 * hour + 1 },
      { unitId: 'r3', levelId: 'l2', level: 'high', time: 8 * hour },
      { unitId: 'r2', levelId: 'l1', level: 'medium', time: 10 * hour + 2 },
    ] as const;
    expect(museumRoomStatus(alarms, 10.5 * hour)).toEqual([
      { unitId: 'r1', levelId: 'l1', status: 'critical' },
      { unitId: 'r2', levelId: 'l1', status: 'warn' },
    ]);
  });
});
