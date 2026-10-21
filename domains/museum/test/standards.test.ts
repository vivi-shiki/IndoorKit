import { describe, expect, it } from 'vitest';
import {
  assess,
  budgetShare,
  createReadingWindow,
  daysUntilBudget,
  displayDaysLeft,
  exposureLxh,
  isOpen,
  lightsOn,
  STANDARDS,
  strictest,
} from '../src/index';
import { makeMuseum, OBJECTS } from './fixture';

const H = 3600_000;

describe('conservation standards', () => {
  it('takes the strictest sensitivity', () => {
    expect(strictest([])).toBe('low');
    expect(strictest(['low', 'medium'])).toBe('medium');
    expect(strictest(['medium', 'high', 'low'])).toBe('high');
  });

  it('judges readings against the standard', () => {
    const high = STANDARDS.high;
    expect(assess(high, 'temperature', 19.5)).toBe('below');
    expect(assess(high, 'temperature', 22)).toBe('ok');
    expect(assess(high, 'humidity', 61)).toBe('above');
    expect(assess(high, 'illuminance', 50)).toBe('ok');
    expect(assess(high, 'illuminance', 51)).toBe('above');
    expect(assess(STANDARDS.low, 'illuminance', 120)).toBe('ok');
    expect(assess(high, 'co2', 1200)).toBe('above');
  });

  it('opens 9:30–17:00 and lights the galleries 9:00–17:30', () => {
    expect(isOpen(9.4 * H)).toBe(false);
    expect(isOpen(9.5 * H)).toBe(true);
    expect(isOpen(17 * H)).toBe(false);
    expect(lightsOn(9 * H)).toBe(true);
    expect(lightsOn(17.4 * H)).toBe(true);
    expect(lightsOn(-1 * H)).toBe(false);
  });
});

describe('light exposure', () => {
  it('integrates illuminance over time into lux hours', () => {
    expect(exposureLxh([])).toBe(0);
    expect(
      exposureLxh([
        { time: 0, lux: 50 },
        { time: 2 * H, lux: 50 },
      ]),
    ).toBe(100);
    expect(
      exposureLxh([
        { time: 0, lux: 0 },
        { time: H, lux: 100 },
      ]),
    ).toBe(50);
    expect(() =>
      exposureLxh([
        { time: H, lux: 1 },
        { time: 0, lux: 1 },
      ]),
    ).toThrow(/time order/);
  });

  it('compares the total with the annual budget', () => {
    expect(budgetShare(96_000, STANDARDS.high)).toBeCloseTo(0.8);
    expect(budgetShare(1e9, STANDARDS.low)).toBeNull();
    expect(daysUntilBudget(100_000, 400, STANDARDS.high)).toBe(50);
    expect(daysUntilBudget(130_000, 400, STANDARDS.high)).toBe(0);
    expect(daysUntilBudget(100_000, 0, STANDARDS.high)).toBeNull();
  });

  it('counts the display days left for designated objects only', () => {
    const museum = makeMuseum();
    expect(displayDaysLeft(museum.object(OBJECTS['O-4']!), 41)).toBe(19);
    expect(displayDaysLeft(museum.object(OBJECTS['O-4']!), 70)).toBe(0);
    expect(displayDaysLeft(museum.object(OBJECTS['O-1']!), 41)).toBeNull();
  });
});

describe('reading window', () => {
  it('keeps the last 24 hours and reports the swing', () => {
    const w = createReadingWindow();
    w.push(0, 50);
    w.push(6 * H, 62);
    w.push(12 * H, 55);
    expect(w.swing()).toBe(12);
    w.push(31 * H, 54);
    // 0 点和 6 点的读数已经超出 24 小时
    expect(w.size()).toBe(2);
    expect(w.swing()).toBe(1);
    expect(w.span()).toBe(19 * H);
    expect(() => w.push(30 * H, 50)).toThrow(/time order/);
  });
});

describe('reading window with many readings', () => {
  it('matches a brute-force minimum and maximum', () => {
    const w = createReadingWindow(60);
    const all: { t: number; v: number }[] = [];
    for (let t = 0; t < 500; t++) {
      const v = Math.sin(t / 7) * 10 + (t % 13);
      w.push(t, v);
      all.push({ t, v });
      const inside = all.filter((x) => x.t >= t - 60).map((x) => x.v);
      expect(w.swing()).toBeCloseTo(Math.max(...inside) - Math.min(...inside));
    }
  });
});
