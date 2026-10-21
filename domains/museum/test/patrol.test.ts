import { describe, expect, it } from 'vitest';
import { checkMoves, checkPatrol, scheduleOf, suggestSwaps } from '../src/index';
import { DEVICES, makeMuseum, OBJECTS, UNITS } from './fixture';

const M = 60_000;
const H = 60 * M;
const museum = makeMuseum();

describe('patrol', () => {
  it('spreads the round over the route by distance', () => {
    // 0 → 10 → 25 → 30 m，30 分钟一圈
    const times = scheduleOf(museum.route('P1'), 10 * H).map((t) => (t - 10 * H) / M);
    expect(times.map((t) => Math.round(t))).toEqual([0, 10, 25, 30]);
  });

  it('marks checkpoints passed, late, missed or still to come', () => {
    const route = museum.route('P1');
    const start = 10 * H;
    expect(checkPatrol(route, start, [], start + 5 * M).map((c) => c.status)).toEqual([
      'upcoming',
      'upcoming',
    ]);
    const passes = [{ code: 'CP-1', time: start + 11 * M }];
    expect(checkPatrol(route, start, passes, start + 20 * M).map((c) => c.status)).toEqual([
      'passed',
      'upcoming',
    ]);
    const late = [{ code: 'CP-1', time: start + 18 * M }];
    // 这一圈还没走完：过了时间还没到的检查点也是迟到
    expect(checkPatrol(route, start, [], start + 16 * M).map((c) => c.status)).toEqual(['late', 'upcoming']);
    // 一圈结束 5 分钟后还没经过才算漏掉
    const result = checkPatrol(route, start, late, start + 40 * M);
    expect(result.map((c) => c.status)).toEqual(['late', 'missed']);
    expect(result[0]).toMatchObject({ code: 'CP-1', unitId: UNITS.g1, passedAt: start + 18 * M });
    // 上一轮的记录不算
    expect(checkPatrol(route, start, [{ code: 'CP-1', time: start - M }], start + 40 * M)[0]!.status).toBe(
      'missed',
    );
  });

  it('only checks patrol routes', () => {
    expect(() => checkPatrol(museum.route('T1'), 0, [], 0)).toThrow(/not a patrol/);
  });
});

describe('object moves', () => {
  const move = { id: 'MV-1', objectId: OBJECTS['O-1']!, from: UNITS.c1, to: UNITS.s1, at: 9 * H };
  const read = (code: string, time: number) => ({
    objectId: OBJECTS['O-1']!,
    deviceId: DEVICES[code]!,
    time,
  });

  it('is done once the reader at the destination sees the object', () => {
    const [r] = checkMoves(museum, [move], [read('RF-G1', 9 * H), read('RF-S1', 9 * H + 5 * M)], 10 * H);
    expect(r).toMatchObject({ status: 'done', lastRead: { unitId: UNITS.s1, time: 9 * H + 5 * M } });
  });

  it('compares a case by the room it is in', () => {
    const back = { ...move, from: UNITS.s1, to: UNITS.c1 };
    expect(checkMoves(museum, [back], [read('RF-G1', 9 * H)], 10 * H)[0]!.status).toBe('done');
  });

  it('flags a read elsewhere, and a move that is late', () => {
    const elsewhere = { ...move, to: UNITS.g2 };
    expect(checkMoves(museum, [elsewhere], [read('RF-S1', 9 * H)], 10 * H)[0]!.status).toBe('wrong-place');
    expect(checkMoves(museum, [move], [read('RF-G1', 9 * H)], 9 * H + 10 * M)[0]!.status).toBe('pending');
    expect(checkMoves(museum, [move], [], 10 * H)[0]!.status).toBe('overdue');
    // 未来的读取记录还没发生
    expect(checkMoves(museum, [move], [read('RF-S1', 11 * H)], 10 * H)[0]!.status).toBe('overdue');
  });
});

describe('swap suggestions', () => {
  it('suggests a stored object of the same series for one near its light budget', () => {
    const lxh = new Map([
      [OBJECTS['O-1']!, 110_000],
      [OBJECTS['O-3']!, 10_000],
    ]);
    expect(suggestSwaps(museum, lxh)).toEqual([
      { objectId: OBJECTS['O-1'], replacementId: OBJECTS['O-3'], share: 110_000 / 120_000 },
    ]);
  });

  it('suggests nothing below 90 % or without a fresh replacement', () => {
    expect(suggestSwaps(museum, new Map([[OBJECTS['O-1']!, 100_000]]))).toEqual([]);
    expect(
      suggestSwaps(
        museum,
        new Map([
          [OBJECTS['O-1']!, 115_000],
          [OBJECTS['O-3']!, 70_000],
        ]),
      ),
    ).toEqual([]);
  });
});
