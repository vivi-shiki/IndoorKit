import { describe, expect, it } from 'vitest';
import { createParking, createRouter } from '../src/index';
import { at, BAYS, LEVELS, makeVenue } from './fixture';

const parking = createParking(makeVenue());
const router = createRouter(parking);

/** 路线上的点换算回以米为单位的平面坐标，便于和 fixture 的布局比对 */
const meters = (route: { points: { levelId: string; coord: [number, number] }[] }) =>
  route.points.map((p) => [
    p.levelId === LEVELS.l1 ? '1F' : p.levelId === LEVELS.l2 ? '2F' : 'P2',
    Math.round(p.coord[0] * 111_320 * 100) / 100,
    Math.round(p.coord[1] * 110_540 * 100) / 100,
  ]);

describe('createRouter', () => {
  it('drives from the entrance along the aisle to a bay on the same floor', () => {
    const route = router.toBay(BAYS['1F-A03']!);
    expect(meters(route)).toEqual([
      ['1F', -3, 8],
      ['1F', 0, 8],
      ['1F', 6.25, 8],
      ['1F', 6.25, 2.5],
    ]);
    expect(route.meters).toBeCloseTo(3 + 6.25 + 5.5, 1);
  });

  it('takes the up ramp to reach a bay on the next floor', () => {
    const route = router.toBay(BAYS['2F-B01']!);
    expect(meters(route)).toEqual([
      ['1F', -3, 8],
      ['1F', 0, 8],
      ['1F', 15, 8],
      ['1F', 18, 8],
      ['2F', 18, 8],
      ['2F', 8.75, 8],
      ['2F', 8.75, 2.5],
    ]);
    expect(route.levels).toEqual([LEVELS.l1, LEVELS.l2]);
    expect(route.meters).toBeCloseTo(3 + 15 + 3 + 9.25 + 5.5, 1);
  });

  it('follows one-way aisles when leaving, even when the exit is behind the car', () => {
    const route = router.fromBay(BAYS['1F-A01']!);
    expect(meters(route)).toEqual([
      ['1F', 1.25, 2.5],
      ['1F', 1.25, 8],
      ['1F', 15, 8],
      ['1F', 15, 14],
      ['1F', 0, 14],
      ['1F', -3, 14],
    ]);
  });

  it('leaves a bay on the upper floor by the down ramp', () => {
    const route = router.fromBay(BAYS['2F-A01']!);
    expect(route.levels).toEqual([LEVELS.l2, LEVELS.l1]);
    expect(meters(route).at(-1)).toEqual(['1F', -3, 14]);
  });

  it('drives both ways on the two-way surface lot through its single gateway', () => {
    const into = router.toBay(BAYS['P2-S02']!);
    const out = router.fromBay(BAYS['P2-S02']!);
    expect(into.meters).toBeCloseTo(3 + 3.75 + 5.5, 1);
    expect(out.meters).toBeCloseTo(into.meters, 6);
    expect(meters(out).at(-1)).toEqual(['P2', -3, 8]);
  });

  it('returns null between places no lane connects', () => {
    expect(
      router.route({ levelId: LEVELS.surface, coord: at(5, 8) }, { levelId: LEVELS.l1, coord: at(5, 8) }),
    ).toBeNull();
  });

  it('measures the walk from a bay to the nearest elevator or stairs on its floor', () => {
    expect(router.walkMeters(BAYS['1F-A03']!)).toBeCloseTo(13.75, 1);
  });
});
