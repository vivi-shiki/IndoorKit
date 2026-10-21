import { describe, expect, it } from 'vitest';
import { DEFAULT_TARIFF, feeFor } from '../src/index';

const H = 3600_000;
const M = 60_000;
const fee = (from: number, to: number) => feeFor(from, to, DEFAULT_TARIFF);

describe('DEFAULT_TARIFF', () => {
  it('is 300 yen per 30 minutes by day, 100 yen per hour at night, at most 500 a night and 2,500 per 24 hours', () => {
    expect(DEFAULT_TARIFF).toEqual({
      day: { fromHour: 8, toHour: 22, unitMs: 30 * M, price: 300 },
      night: { unitMs: 60 * M, price: 100, max: 500 },
      max24h: 2500,
    });
  });
});

describe('feeFor', () => {
  it('charges every started 30 minutes by day', () => {
    expect(fee(10 * H, 10 * H + 70 * M).total).toBe(900);
    expect(fee(10 * H, 10 * H + 30 * M).total).toBe(300);
    expect(fee(10 * H, 10 * H).total).toBe(0);
  });

  it('charges a unit at the rate of the time it starts in', () => {
    // 21:45 起算的 30 分钟按白天计；之后的单位按夜间计
    expect(fee(21 * H + 45 * M, 22 * H + 15 * M).total).toBe(300);
    expect(fee(21 * H, 23 * H + 30 * M)).toMatchObject({
      total: 800,
      lines: [
        { kind: 'day', from: 21 * H, to: 22 * H, units: 2, amount: 600 },
        { kind: 'night', from: 22 * H, to: 23 * H + 30 * M, units: 2, amount: 200 },
      ],
    });
  });

  it('caps each night at the night maximum', () => {
    const r = fee(22 * H, 32 * H);
    expect(r.total).toBe(500);
    expect(r.lines).toEqual([{ kind: 'night', from: 22 * H, to: 32 * H, units: 10, amount: 500 }]);
  });

  it('caps every 24 hours from entry at the 24-hour maximum', () => {
    const day = fee(8 * H, 20 * H);
    expect(day.total).toBe(2500);
    expect(day.capped).toBe(7200 - 2500);
    // 10:00 入场、次日 12:00 出场：第一个 24 小时 2,500 円，之后 2 小时 1,200 円
    expect(fee(10 * H, 36 * H).total).toBe(3700);
  });

  it('works for vehicles that entered the day before (negative times)', () => {
    expect(fee(-2 * H, 0).total).toBe(200);
  });

  it('rejects an exit before the entry', () => {
    expect(() => fee(10 * H, 9 * H)).toThrow(/before/);
  });
});
