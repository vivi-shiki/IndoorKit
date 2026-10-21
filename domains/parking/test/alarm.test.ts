import { describe, expect, it } from 'vitest';
import {
  ALARM_RULES,
  createAlarmEngine,
  createParking,
  type DeviceReading,
  type ParkedVehicle,
  type ParkingSnapshot,
  type Vehicle,
} from '../src/index';
import { BAYS, DEVICES, LEVELS, makeVenue } from './fixture';

const H = 3600_000;
const M = 60_000;
const parking = createParking(makeVenue());

const car = (plate: string, patch: Partial<Vehicle> = {}): Vehicle => ({
  plate,
  vehicleClass: 'standard',
  permit: false,
  contract: { kind: 'hourly' },
  ...patch,
});
const parked = (code: string, vehicle: Vehicle, patch: Partial<ParkedVehicle> = {}): ParkedVehicle => ({
  bayId: BAYS[code]!,
  vehicle,
  enteredAt: 10 * H,
  parkedAt: 10 * H + M,
  ...patch,
});
const snapshot = (patch: Partial<ParkingSnapshot>): ParkingSnapshot => ({
  now: 12 * H,
  parked: [],
  reservations: [],
  devices: [],
  exits: [],
  ...patch,
});
const rules = (alarms: { rule: string }[]) => alarms.map((a) => a.rule).sort();

describe('ALARM_RULES', () => {
  it('sorts every rule into one of the three tiers with a level', () => {
    expect(
      Object.fromEntries(
        (['contract', 'time', 'device'] as const).map((tier) => [
          tier,
          Object.entries(ALARM_RULES)
            .filter(([, r]) => r.tier === tier)
            .map(([id]) => id),
        ]),
      ),
    ).toEqual({
      contract: ['monthly-bay', 'reserved-bay', 'ev-bay', 'accessible-bay', 'large-bay'],
      time: ['unpaid-exit', 'long-stay', 'ev-idle', 'no-show', 'night-stay'],
      device: ['sensor-offline', 'camera-offline', 'gate-fault', 'charger-fault', 'co-high', 'help-call'],
    });
    expect(ALARM_RULES['unpaid-exit'].level).toBe('high');
    expect(ALARM_RULES['co-high'].level).toBe('high');
    expect(ALARM_RULES['help-call'].level).toBe('high');
    expect(ALARM_RULES['night-stay'].level).toBe('low');
    expect(ALARM_RULES['monthly-bay'].level).toBe('medium');
  });
});

describe('tier 1: contract and bay type', () => {
  it('flags vehicles parked where their contract or vehicle does not allow', () => {
    const engine = createAlarmEngine(parking);
    const alarms = engine.check(
      snapshot({
        parked: [
          parked('1F-B01', car('A')),
          parked('1F-A01', car('B')),
          parked('1F-A02', car('C')),
          parked('P2-L01', car('D')),
        ],
      }),
    );
    expect(rules(alarms)).toEqual(['accessible-bay', 'ev-bay', 'large-bay', 'monthly-bay']);
    expect(alarms.find((a) => a.rule === 'ev-bay')).toMatchObject({
      tier: 'contract',
      level: 'medium',
      bayId: BAYS['1F-A01'],
      plate: 'B',
      levelId: LEVELS.l1,
      time: 12 * H,
      deviceId: null,
    });
  });

  it('accepts the right vehicles in special bays', () => {
    const engine = createAlarmEngine(parking);
    const alarms = engine.check(
      snapshot({
        parked: [
          parked('1F-B01', car('A', { contract: { kind: 'monthly', id: 'M-1', bayId: BAYS['1F-B01']! } })),
          parked('1F-A01', car('B', { vehicleClass: 'ev' })),
          parked('1F-A02', car('C', { permit: true })),
          parked('P2-L01', car('D', { vehicleClass: 'large' })),
        ],
      }),
    );
    expect(alarms).toEqual([]);
  });

  it('flags a monthly contract holder in someone else’s fixed bay', () => {
    const engine = createAlarmEngine(parking);
    const holder = car('A', { contract: { kind: 'monthly', id: 'M-1', bayId: BAYS['1F-B01']! } });
    expect(rules(engine.check(snapshot({ parked: [parked('1F-B02', holder)] })))).toEqual(['monthly-bay']);
  });

  it('flags another vehicle in a bay during its reservation, but not outside it', () => {
    const reservation = { id: 'R-1', bayId: BAYS['2F-A01']!, from: 11.75 * H, to: 13 * H, arrivedAt: null };
    const engine = createAlarmEngine(parking);
    expect(
      rules(engine.check(snapshot({ parked: [parked('2F-A01', car('X'))], reservations: [reservation] }))),
    ).toEqual(['reserved-bay']);
    const later = createAlarmEngine(parking);
    expect(
      later.check(
        snapshot({ now: 14 * H, parked: [parked('2F-A01', car('X'))], reservations: [reservation] }),
      ),
    ).toEqual([]);
    const own = createAlarmEngine(parking);
    const holder = car('Y', { contract: { kind: 'reservation', id: 'R-1' } });
    expect(
      own.check(
        snapshot({
          parked: [parked('2F-A01', holder)],
          reservations: [{ ...reservation, arrivedAt: 11 * H }],
        }),
      ),
    ).toEqual([]);
  });
});

describe('tier 2: time', () => {
  it('flags an exit without payment once, with the exit gate’s floor', () => {
    const engine = createAlarmEngine(parking);
    const exit = { vehicle: car('A'), time: 11 * H, paid: false, gateId: DEVICES['G-OUT']! };
    const [alarm] = engine.check(snapshot({ exits: [exit, { ...exit, vehicle: car('B'), paid: true }] }));
    expect(alarm).toMatchObject({
      rule: 'unpaid-exit',
      level: 'high',
      plate: 'A',
      deviceId: DEVICES['G-OUT'],
      levelId: LEVELS.l1,
      time: 11 * H,
    });
    expect(engine.check(snapshot({ exits: [exit] }))).toEqual([]);
  });

  it('flags stays over 24 hours', () => {
    const engine = createAlarmEngine(parking);
    const p = parked('2F-A01', car('A'), { enteredAt: -13 * H });
    expect(rules(engine.check(snapshot({ now: 10 * H, parked: [p] })))).toEqual([]);
    expect(rules(engine.check(snapshot({ now: 11.5 * H, parked: [p] })))).toEqual(['long-stay']);
  });

  it('flags an EV that stays more than 15 minutes after charging finished', () => {
    const engine = createAlarmEngine(parking);
    const ev = parked('1F-A01', car('E', { vehicleClass: 'ev' }), { chargedAt: 11 * H + 50 * M });
    expect(engine.check(snapshot({ parked: [ev] }))).toEqual([]);
    expect(rules(engine.check(snapshot({ now: 12 * H + 6 * M, parked: [ev] })))).toEqual(['ev-idle']);
  });

  it('flags a reservation nobody arrived for 30 minutes after it started', () => {
    const engine = createAlarmEngine(parking);
    const r = { id: 'R-2', bayId: BAYS['2F-B01']!, from: 11 * H, to: 13 * H, arrivedAt: null };
    expect(engine.check(snapshot({ now: 11 * H + 20 * M, reservations: [r] }))).toEqual([]);
    const [alarm] = engine.check(snapshot({ now: 11 * H + 31 * M, reservations: [r] }));
    expect(alarm).toMatchObject({ rule: 'no-show', level: 'low', bayId: r.bayId, plate: null });
  });

  it('flags vehicles still parked between midnight and 5 a.m.', () => {
    const engine = createAlarmEngine(parking);
    const p = parked('2F-A02', car('N'), { enteredAt: -3 * H, parkedAt: -3 * H });
    expect(rules(engine.check(snapshot({ now: -H, parked: [p] })))).toEqual([]);
    expect(rules(engine.check(snapshot({ now: 1 * H, parked: [p] })))).toEqual(['night-stay']);
  });
});

describe('tier 3: devices and environment', () => {
  const reading = (code: string, patch: Partial<DeviceReading>): DeviceReading => ({
    deviceId: DEVICES[code]!,
    status: 'online',
    ...patch,
  });

  it('flags offline sensors and cameras, faulty gates, flaps and chargers', () => {
    const engine = createAlarmEngine(parking);
    const alarms = engine.check(
      snapshot({
        devices: [
          reading('S-1F-A03', { status: 'offline' }),
          reading('CAM-P2', { status: 'offline' }),
          reading('LPR-IN', { status: 'offline' }),
          reading('G-IN', { status: 'fault' }),
          reading('FLAP-P2-S01', { status: 'fault' }),
          reading('EV-1', { status: 'fault' }),
          reading('DISP-1F', { status: 'online' }),
        ],
      }),
    );
    expect(alarms.map((a) => [a.rule, a.deviceId])).toEqual([
      ['sensor-offline', DEVICES['S-1F-A03']],
      ['camera-offline', DEVICES['CAM-P2']],
      ['camera-offline', DEVICES['LPR-IN']],
      ['gate-fault', DEVICES['G-IN']],
      ['gate-fault', DEVICES['FLAP-P2-S01']],
      ['charger-fault', DEVICES['EV-1']],
    ]);
    expect(alarms[0]).toMatchObject({ tier: 'device', levelId: LEVELS.l1, bayId: BAYS['1F-A03'] });
  });

  it('flags CO above the limit and help calls from an intercom as high', () => {
    const engine = createAlarmEngine(parking);
    const alarms = engine.check(
      snapshot({
        devices: [reading('CO-1F', { value: 80 }), reading('TEL-1', { status: 'calling' })],
      }),
    );
    expect(alarms.map((a) => [a.rule, a.level])).toEqual([
      ['co-high', 'high'],
      ['help-call', 'high'],
    ]);
    expect(
      createAlarmEngine(parking).check(snapshot({ devices: [reading('CO-1F', { value: 20 })] })),
    ).toEqual([]);
  });
});

describe('createAlarmEngine', () => {
  it('raises an alarm once while it lasts and again after it clears', () => {
    const engine = createAlarmEngine(parking);
    const offline = snapshot({ devices: [{ deviceId: DEVICES['S-2F-A01']!, status: 'offline' }] });
    expect(engine.check(offline)).toHaveLength(1);
    expect(engine.check({ ...offline, now: 12 * H + M })).toEqual([]);
    expect(
      engine.check(snapshot({ devices: [{ deviceId: DEVICES['S-2F-A01']!, status: 'online' }] })),
    ).toEqual([]);
    const again = engine.check({ ...offline, now: 13 * H });
    expect(again).toHaveLength(1);
    expect(again[0]!.time).toBe(13 * H);
  });

  it('gives every alarm a unique id', () => {
    const engine = createAlarmEngine(parking);
    const a = engine.check(snapshot({ parked: [parked('1F-A01', car('A')), parked('1F-A02', car('B'))] }));
    expect(new Set(a.map((x) => x.id)).size).toBe(2);
  });
});
