import { describe, expect, it } from 'vitest';
import { createParking, type ParkingSession, suggest, summarize } from '../src/index';
import { BAYS, makeVenue } from './fixture';

const H = 3600_000;
const parking = createParking(makeVenue());

const session = (
  code: string,
  from: number,
  to: number | null,
  patch: Partial<ParkingSession> = {},
): ParkingSession => ({
  plate: code,
  bayId: BAYS[code]!,
  contract: 'hourly',
  enteredAt: from,
  parkedAt: from,
  leftAt: to,
  exitedAt: to,
  fee: 600,
  paid: true,
  ...patch,
});

describe('summarize', () => {
  const sessions = [
    session('2F-A01', 10 * H, 12 * H),
    session('2F-A01', 13 * H, 14 * H, { fee: 300, paid: false }),
    session('2F-A02', 9 * H, null, { exitedAt: null, fee: 0 }),
    // 月租车位不计入利用率
    session('1F-B01', 8 * H, 20 * H, { contract: 'monthly', fee: 0 }),
  ];
  const s = summarize(
    parking,
    { sessions, monthlyContracts: [{ id: 'M-1', bayId: BAYS['1F-B01']! }] },
    {
      from: 10 * H,
      to: 14 * H,
    },
  );

  it('measures utilization over the window, excluding monthly bays', () => {
    // 15 个计时车位 × 4 小时；占用 2F-A01 3 小时、2F-A02 4 小时
    expect(s.utilization).toBeCloseTo(7 / (15 * 4), 6);
    expect(s.bayUtilization.get(BAYS['2F-A01']!)).toBeCloseTo(0.75, 6);
    expect(s.zoneUtilization.get(parking.zoneByCode('2F-A').id)).toBeCloseTo(7 / 12, 6);
  });

  it('counts turnover, average stay, revenue and unpaid amounts', () => {
    expect(s.turnover).toBeCloseTo(2 / 15, 6);
    expect(s.averageStayMs).toBe(1.5 * H);
    expect(s.revenue).toBe(600);
    expect(s.unpaid).toBe(300);
    expect(s.revenueByZone.get(parking.zoneByCode('2F-A').id)).toBe(600);
  });

  it('counts monthly bays without a contract', () => {
    expect(s.monthlyVacant).toBe(2);
  });

  it('gives the number of parked vehicles at every hour', () => {
    expect(s.hourly).toEqual([
      { time: 10 * H, count: 3 },
      { time: 11 * H, count: 3 },
      { time: 12 * H, count: 2 },
      { time: 13 * H, count: 3 },
    ]);
  });
});

describe('suggest', () => {
  const full = (code: string, from: number, to: number) => session(code, from, to);
  const day = [
    // 2F-A 全天几乎满（午间满）；EV 车位晚上一直占用；其余区很空
    ...['2F-A01', '2F-A02', '2F-A03'].map((c) => full(c, 8 * H, 22 * H)),
    full('1F-A01', 18 * H, 23 * H),
  ];
  const tips = suggest(parking, { sessions: day, monthlyContracts: [] }, 0);

  it('suggests peak pricing for zones full at lunch time', () => {
    expect(tips[0]).toEqual({ code: 'peak-pricing', zoneId: parking.zoneByCode('2F-A').id, value: 1 });
  });

  it('suggests more chargers when the EV bays are full in the evening', () => {
    expect(tips).toContainEqual({ code: 'ev-capacity', zoneId: parking.zoneByCode('1F-A').id, value: 1 });
  });

  it('suggests monthly contracts for general zones used less than a quarter of the day', () => {
    const monthly = tips.filter((t) => t.code === 'monthly-recruit').map((t) => parking.zone(t.zoneId).code);
    expect(monthly).toEqual(['2F-B', 'P2-S']);
  });
});
