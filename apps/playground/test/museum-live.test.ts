import { buildVenueModel } from '@indoorkit/imdf';
import { createMuseum, museumExtensions } from '@indoorkit/museum';
import { createMuseumDay } from '@indoorkit/museum-simulator';
import { generateMuseum, MINATO_MUSEUM } from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { createAlarmStore } from '../src/museum/adapters/alarms';
import { DEFAULT_START, parseClockParam, SPEEDS } from '../src/museum/adapters/clock';
import {
  budgetState,
  caseBudgetStates,
  crowdState,
  crowdStates,
  envReadings,
  guideSteps,
  humiditySwing,
  objectRows,
  patrolStatus,
} from '../src/museum/adapters/live';

const H = 3600_000;
const M = 60_000;
const venue = buildVenueModel(generateMuseum(MINATO_MUSEUM), museumExtensions);
const museum = createMuseum(venue);
const day = createMuseumDay(museum, { seed: 'minato-museum' });
const room = (code: string) => museum.roomByCode(code).unitId;
const kase = (code: string) => museum.caseByCode(code).unitId;

describe('environment on the map', () => {
  it('colours every monitored room and case, and only those', () => {
    const states = envReadings(museum, day.readings(14 * H), 'temperature');
    const monitored = new Set(museum.devicesOf('climate').map((d) => d.unitId));
    expect(new Set(states.keys())).toEqual(monitored);
  });

  it('shows the air-conditioning fault in Gallery 4 and the lighting fault in case G6-W2', () => {
    const humidity = envReadings(museum, day.readings(14 * H), 'humidity');
    expect(humidity.get(room('G4'))!.state).toBe('above');
    expect(humidity.get(room('G1'))!.state).toBe('ok');
    const light = envReadings(museum, day.readings(14 * H), 'illuminance');
    expect(light.get(kase('G6-W2'))!.state).toBe('above');
    expect(light.get(kase('G6-W1'))!.state).toBe('ok');
  });

  it('has no value while the sensor is offline', () => {
    const r = envReadings(museum, day.readings(11.5 * H), 'temperature').get(kase('G2-F1'))!;
    expect(r).toEqual({ value: null, state: 'offline' });
  });

  it('measures the daily humidity fluctuation from a curve', () => {
    expect(humiditySwing([])).toBeNull();
    expect(
      humiditySwing([
        { time: 0, value: 50 },
        { time: 1, value: 58 },
        { time: 2, value: 55 },
      ]),
    ).toBe(8);
    const g4 = day.series(room('G4'), 'humidity', -10 * H, 14 * H);
    expect(humiditySwing(g4)!).toBeGreaterThan(10);
  });
});

describe('crowding', () => {
  it('turns busy at 80 % of capacity and full above it', () => {
    expect(crowdState(10, 40)).toBe('calm');
    expect(crowdState(32, 40)).toBe('busy');
    expect(crowdState(40, 40)).toBe('busy');
    expect(crowdState(41, 40)).toBe('full');
  });

  it('shows the school group filling special exhibition room 1', () => {
    const states = crowdStates(museum, day, 13 * H + 50 * M);
    expect(states.get(room('SP1'))).toBe('full');
    expect(states.has(room('ST-A'))).toBe(false);
  });
});

describe('light exposure of the collection', () => {
  it('rates the share of the annual budget', () => {
    expect(budgetState(null)).toBeNull();
    expect(budgetState(0.5)).toBe('ok');
    expect(budgetState(0.8)).toBe('warn');
    expect(budgetState(1)).toBe('over');
  });

  it('lists the objects on display with their exposure, most used first', () => {
    const rows = objectRows(day, 14 * H);
    expect(rows.length).toBe(museum.objects.length);
    const shares = rows.map((r) => r.share ?? -1);
    expect(shares).toEqual([...shares].sort((a, b) => b - a));
    const prints = rows.filter((r) => r.object.series === 'minato-100' && r.state.status === 'display');
    expect(prints.some((r) => budgetState(r.share) !== 'ok')).toBe(true);
    const designated = rows.find((r) => r.object.designated && r.state.status === 'display')!;
    expect(designated.displayLeft).not.toBeNull();
  });

  it('marks a case with the worst object in it', () => {
    const rows = objectRows(day, 14 * H);
    const states = caseBudgetStates(museum, rows);
    for (const [caseId, state] of states) {
      const worst = rows
        .filter((r) => r.state.location === caseId)
        .map((r) => budgetState(r.share))
        .filter((s) => s !== null);
      expect(worst, caseId).toContain(state);
    }
    expect([...states.values()]).toContain('warn');
  });
});

describe('patrols', () => {
  it('reports the 11:15 round of guard SG-02 with checkpoint G8 missed', () => {
    const status = patrolStatus(day, 'SG-02', 12 * H + 30 * M)!;
    expect(status.round.start).toBe(11.25 * H);
    expect(status.results.find((r) => r.code === 'CP-G8')!.status).toBe('missed');
  });

  it('has nothing for the guard at the lobby desk', () => {
    expect(patrolStatus(day, 'SG-03', 12 * H)).toBeNull();
  });
});

describe('guide', () => {
  it('walks the tour room by room, case by case', () => {
    const steps = guideSteps(museum, 'TOUR-JAPAN');
    const rooms = [...new Set(steps.map((s) => museum.room(s.roomId).code))];
    expect(rooms).toEqual(['G6', 'G7', 'G8', 'G9']);
    for (const s of steps) {
      expect(museum.case(s.caseId).roomId).toBe(s.roomId);
      expect(museum.objectsAt(s.caseId).length).toBeGreaterThan(0);
    }
  });
});

describe('alarm store', () => {
  it('raises all three tiers by the afternoon and keeps the handling state', () => {
    const store = createAlarmStore(museum, day);
    store.update(14 * H);
    expect(new Set(store.all().map((a) => a.tier))).toEqual(new Set(['access', 'conservation', 'device']));
    const first = store.all()[0]!;
    store.setState(first.id, 'acknowledged');
    store.update(14.5 * H);
    expect(store.state(first.id)).toBe('acknowledged');
  });

  it('starts again when the clock goes back', () => {
    const store = createAlarmStore(museum, day);
    store.update(15 * H);
    const late = store.all().length;
    store.update(8 * H);
    expect(store.all().length).toBeLessThan(late);
    expect(store.all().every((a) => a.time <= 8 * H)).toBe(true);
  });
});

describe('simulation clock', () => {
  it('starts at 14:00 by default and runs up to 600 times faster', () => {
    expect(DEFAULT_START).toBe(14 * H);
    expect(parseClockParam('21:05')).toBe(21 * H + 5 * M);
    expect(parseClockParam('x')).toBe(14 * H);
    expect(SPEEDS).toEqual([1, 60, 600]);
  });
});
