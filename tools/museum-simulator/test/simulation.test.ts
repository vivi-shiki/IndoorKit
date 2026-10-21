import { buildVenueModel } from '@indoorkit/imdf';
import {
  ALARM_RULES,
  checkMoves,
  createAlarmEngine,
  createMuseum,
  type MuseumAlarm,
  museumExtensions,
  STANDARDS,
} from '@indoorkit/museum';
import { generateMuseum, MINATO_MUSEUM } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { createMuseumDay } from '../src/index';

const H = 3600_000;
const M = 60_000;
const museum = createMuseum(buildVenueModel(generateMuseum(MINATO_MUSEUM), museumExtensions));
const day = createMuseumDay(museum, { seed: 'minato' });
const room = (code: string) => museum.roomByCode(code).unitId;
const device = (code: string) => museum.deviceByCode(code).id;

/** 一整天每分钟检查一次的全部告警 */
const alarms: MuseumAlarm[] = (() => {
  const engine = createAlarmEngine(museum);
  const out: MuseumAlarm[] = [];
  for (let t = M; t < 24 * H; t += M) out.push(...engine.check(day.snapshotAt(t)));
  return out;
})();

describe('createMuseumDay', () => {
  it('is the same day for the same seed', () => {
    const again = createMuseumDay(museum, { seed: 'minato' });
    expect(again.visitors.length).toBe(day.visitors.length);
    expect(again.readings(14 * H)).toEqual(day.readings(14 * H));
    expect(again.taggedAt(14 * H)).toEqual(day.taggedAt(14 * H));
  });

  it('lets visitors in from 9:30 and has everyone out by closing time', () => {
    expect(day.entriesUntil(9 * H)).toBe(0);
    expect(day.entriesUntil(24 * H)).toBeGreaterThan(1000);
    expect(day.insideAt(14 * H)).toBeGreaterThan(100);
    expect(day.insideAt(17 * H)).toBe(0);
    expect(Math.max(...day.visitors.map((v) => v.exitedAt))).toBeLessThanOrEqual(17 * H);
  });

  it('tags about 30 % of the visitors, and only tagged visitors report positions', () => {
    const share = day.visitors.filter((v) => v.tagged).length / day.visitors.length;
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.35);
    const tagged = new Set(day.visitors.filter((v) => v.tagged).map((v) => v.id));
    const now = day.taggedAt(14 * H);
    expect(now.length).toBeGreaterThan(20);
    expect(now.every((p) => tagged.has(p.id))).toBe(true);
    // 位置在所在楼层的范围里
    const levels = new Set(museum.venue.levels.map((l) => l.id));
    expect(now.every((p) => levels.has(p.levelId))).toBe(true);
  });

  it('fills the special exhibition beyond its capacity when the group tour arrives', () => {
    const sp1 = museum.roomByCode('SP1');
    expect(day.occupancy(sp1.unitId, 13 * H + 50 * M)).toBeGreaterThan(sp1.capacity!);
    expect(day.occupancy(sp1.unitId, 11 * H)).toBeLessThan(sp1.capacity!);
  });

  it('keeps sealed cases steadier than their room, and warms Gallery 4 when its air conditioning fails', () => {
    const rh = (code: string, t: number) => day.reading(device(code), t).values.humidity!;
    const swing = (code: string) => {
      const xs = Array.from({ length: 24 }, (_, h) => rh(code, h * H));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(swing('TH-G6-W1')).toBeLessThan(swing('TH-G6'));
    expect(day.reading(device('TH-G4'), 13 * H).values.temperature!).toBeGreaterThan(24.5);
    expect(rh('TH-G4', 13 * H)).toBeGreaterThan(62);
    expect(day.reading(device('TH-G4'), 9 * H).values.temperature!).toBeLessThan(24);
  });

  it('lights the galleries only 9:00–17:30, within the limit except the faulty case', () => {
    const lux = (code: string, t: number) => day.reading(device(code), t).values.illuminance!;
    expect(lux('LX-G6-W1', 3 * H)).toBeLessThan(2);
    expect(lux('LX-G6-W1', 11 * H)).toBeLessThanOrEqual(STANDARDS.high.maxLux);
    expect(lux('LX-G6-W1', 11 * H)).toBeGreaterThan(40);
    expect(lux('LX-G6-W2', 12 * H)).toBeLessThanOrEqual(STANDARDS.high.maxLux);
    expect(lux('LX-G6-W2', 14 * H)).toBeGreaterThan(100);
  });

  it('draws a day of readings for a chart, skipping the time a sensor was offline', () => {
    const points = day.series(museum.caseByCode('G2-F1').unitId, 'humidity', 0, 24 * H, 30 * M);
    expect(points.length).toBe(49 - 3);
    expect(points.some((p) => p.time === 11.5 * H)).toBe(false);
    expect(day.series(room('LOBBY'), 'illuminance', 0, H)).toEqual([]);
  });

  it('adds today’s light to the exposure of objects on display only', () => {
    const shown = museum.objectsAt(museum.caseByCode('G6-W1').unitId)[0]!;
    expect(day.exposureAt(shown, 14 * H)).toBeGreaterThan(day.exposureAt(shown, 9 * H));
    const moved = new Set(day.moves.map((m) => m.objectId));
    const stored = museum.objects.find((o) => o.status === 'storage' && !moved.has(o.id))!;
    expect(day.exposureAt(stored, 14 * H)).toBe(day.exposureAt(stored, 9 * H));
    // 浮世绘从年初一直展出，有几件已经超过预算
    const prints = museum
      .objectsAt(room('G9'))
      .map((o) => day.exposureAt(o, 14 * H) / STANDARDS.high.annualLxh!);
    expect(prints.some((s) => s >= 1)).toBe(true);
    expect(prints.every((s) => s >= 0.7)).toBe(true);
  });

  it('checks today’s moves: two swaps and a return done, one wrong store, one missing, one to come', () => {
    const results = checkMoves(museum, day.moves, day.rfidReads, 14 * H).map((r) => [r.move.id, r.status]);
    expect(results).toEqual([
      ['MV-01', 'done'],
      ['MV-02', 'done'],
      ['MV-03', 'wrong-place'],
      ['MV-04', 'done'],
      ['MV-05', 'overdue'],
      ['MV-06', 'pending'],
    ]);
    const swapped = museum.object(day.moves[0]!.objectId);
    expect(day.objectState(swapped, 8 * H)).toEqual({ status: 'display', location: swapped.location });
    expect(day.objectState(swapped, 9 * H)).toEqual({ status: 'storage', location: room('ST-B') });
    expect(day.objectState(museum.object(day.moves[1]!.objectId), 9 * H).status).toBe('display');
  });

  it('runs two patrol rounds every two hours and a desk guard in the entrance hall', () => {
    expect(day.guards.map((g) => [g.id, g.routeCode])).toEqual([
      ['SG-01', 'PATROL-A'],
      ['SG-02', 'PATROL-B'],
      ['SG-03', null],
    ]);
    expect(day.rounds).toHaveLength(10);
    const onRound = day.guardAt('SG-02', 13.5 * H);
    expect(onRound.round?.routeCode).toBe('PATROL-B');
    expect(day.guardAt('SG-03', 13.5 * H).levelId).toBe(museum.roomByCode('LOBBY').levelId);
    expect(day.missedUntil(14 * H).map((m) => m.key)).toEqual([expect.stringMatching(/^PATROL-B:.*:CP-G8$/)]);
  });

  it('raises every alarm rule at least once during the day', () => {
    const raised = new Set(alarms.map((a) => a.rule));
    expect([...raised].sort()).toEqual(Object.keys(ALARM_RULES).sort());
  });

  it('raises the after-hours alarm only for the intrusion at night', () => {
    const night = alarms.filter((a) => a.rule === 'after-hours');
    expect(night).toHaveLength(1);
    expect(night[0]!.time).toBeGreaterThan(21 * H);
    expect(museum.roomOf(night[0]!.unitId).code).toBe('G3');
  });

  it('does not raise a burst of repeats for one incident', () => {
    const count = (rule: string) => alarms.filter((a) => a.rule === rule).length;
    expect(count('illuminance')).toBe(1);
    expect(count('case-opened')).toBe(1);
    expect(count('staff-area')).toBe(1);
    expect(count('over-capacity')).toBeLessThanOrEqual(2);
  });
});
