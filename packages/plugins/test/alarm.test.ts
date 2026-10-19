import { createManualProvider } from '@indoorkit/core/testing';
import { buildVenueModel, type ImdfArchive } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../imdf/test/fixture';
import {
  type AlarmSubject,
  alarmPlugin,
  createAlarmEngine,
  createVenueIndex,
  type DepartmentRule,
  type FenceRule,
  floorPlugin,
  polygonPlugin,
  positionStreamPlugin,
} from '../src/index';
import { batch, openMap, tag } from './helpers';

/**
 * 1F：西半边是内科房间，东北角是外科房间，东南角是公共走廊。
 *   (0,0.001) ┌──────────┬──────────┐ (0.002,0.001)
 *             │ 内科 room │ 外科 ward │
 *             │          ├──────────┤ 0.0005
 *             │          │ 走廊 hall │
 *   (0,0)     └──────────┴──────────┘
 */
const WARD = '00000000-0000-4000-8000-00000000000a';
const SURGERY = '00000000-0000-4000-8000-00000000000b';
function archive(): ImdfArchive {
  const a = makeArchive();
  const hall = a.unit.features.find((u) => u.id === IDS.hall)!;
  hall.geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0.001, 0],
        [0.002, 0],
        [0.002, 0.0005],
        [0.001, 0.0005],
        [0.001, 0],
      ],
    ],
  };
  a.unit.features.push({
    type: 'Feature',
    id: WARD,
    feature_type: 'unit',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0.001, 0.0005],
          [0.002, 0.0005],
          [0.002, 0.001],
          [0.001, 0.001],
          [0.001, 0.0005],
        ],
      ],
    },
    properties: { category: 'room', level_id: IDS.level1, name: { ja: '外科', en: 'Surgery' } },
  });
  a.department!.features.push({
    type: 'Feature',
    id: SURGERY,
    feature_type: 'department',
    geometry: null,
    properties: { code: 'surgery', name: { ja: '外科', en: 'Surgery' }, unit_ids: [WARD] },
  });
  return a;
}
const venue = buildVenueModel(archive());
const INTERNAL = IDS.department;
const ROOM: [number, number] = [0.0005, 0.0005];
const HALL: [number, number] = [0.0015, 0.0002];
const WARD_AT: [number, number] = [0.0015, 0.0008];
const L1 = IDS.level1;

const subjects: AlarmSubject[] = [
  { id: 'patient', kind: 'person', role: 'patient', departmentId: INTERNAL },
  { id: 'nurse', kind: 'person', role: 'nurse', departmentId: INTERNAL },
  { id: 'surgeon', kind: 'person', role: 'nurse', departmentId: SURGERY },
  { id: 'visitor', kind: 'person', role: 'visitor', departmentId: INTERNAL },
  { id: 'pump', kind: 'asset', type: 'infusion-pump', departmentId: INTERNAL },
];
const patientLeaves: DepartmentRule = {
  id: 'patient-outside',
  selector: { roles: ['patient'] },
  when: 'outside-own',
  level: 'high',
};
const visitorEnters: DepartmentRule = {
  id: 'visitor-enter',
  selector: { roles: ['visitor'] },
  when: 'enter-other',
  level: 'medium',
};
const wardFence = (rule: Partial<FenceRule> = {}): FenceRule => ({
  id: 'ward',
  label: 'Ward',
  levelId: L1,
  coordinates: [
    [0.001, 0.0005],
    [0.002, 0.0005],
    [0.002, 0.001],
    [0.001, 0.001],
    [0.001, 0.0005],
  ],
  rule: 'forbid',
  level: 'high',
  ...rule,
});
const engine = (departmentRules: DepartmentRule[], fences: FenceRule[] = []) => {
  const e = createAlarmEngine({ index: createVenueIndex(venue), subjects, departmentRules });
  for (const f of fences) e.addFence(f);
  return e;
};
const kinds = (alarms: { subjectId: string; kind: string }[]) =>
  alarms.map((a) => `${a.subjectId}:${a.kind}`);

describe('department layer', () => {
  it('raises once when a subject is outside its own department, and again after it returns and leaves', () => {
    const e = engine([patientLeaves]);
    expect(e.check(batch(0, [tag('patient', L1, ROOM)]))).toEqual([]);
    const [alarm] = e.check(batch(1000, [tag('patient', L1, HALL)]));
    expect(alarm).toMatchObject({
      subjectId: 'patient',
      layer: 'department',
      kind: 'outside-own',
      ruleId: 'patient-outside',
      level: 'high',
      levelId: L1,
      unitId: IDS.hall,
      departmentId: null,
      time: 1000,
      coord: HALL,
    });
    expect(e.check(batch(2000, [tag('patient', L1, HALL)]))).toEqual([]);
    expect(e.check(batch(3000, [tag('patient', L1, ROOM)]))).toEqual([]);
    expect(kinds(e.check(batch(4000, [tag('patient', L1, WARD_AT)])))).toEqual(['patient:outside-own']);
  });

  it('waits for the grace period before raising outside-own', () => {
    const e = engine([{ ...patientLeaves, graceMs: 5000 }]);
    e.check(batch(0, [tag('patient', L1, HALL)]));
    expect(e.check(batch(4000, [tag('patient', L1, HALL)]))).toEqual([]);
    expect(kinds(e.check(batch(5000, [tag('patient', L1, HALL)])))).toEqual(['patient:outside-own']);
    expect(e.check(batch(9000, [tag('patient', L1, HALL)]))).toEqual([]);
  });

  it('raises enter-other on entering another department, not in public areas or its own', () => {
    const e = engine([visitorEnters]);
    expect(e.check(batch(0, [tag('visitor', L1, ROOM)]))).toEqual([]);
    expect(e.check(batch(1000, [tag('visitor', L1, HALL)]))).toEqual([]);
    const [alarm] = e.check(batch(2000, [tag('visitor', L1, WARD_AT)]));
    expect(alarm).toMatchObject({ kind: 'enter-other', departmentId: SURGERY, unitId: WARD });
    expect(e.check(batch(3000, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
  });

  it('applies rules only to the subjects they select', () => {
    const e = engine([patientLeaves, visitorEnters]);
    expect(e.check(batch(0, [tag('nurse', L1, WARD_AT), tag('pump', L1, WARD_AT)]))).toEqual([]);
  });

  it('ignores positions of unknown subjects', () => {
    const e = engine([patientLeaves]);
    expect(e.check(batch(0, [tag('stranger', L1, HALL)]))).toEqual([]);
  });
});

describe('fence layer', () => {
  it('checks the department layer first, then custom fences', () => {
    const e = engine([visitorEnters], [wardFence()]);
    const alarms = e.check(batch(0, [tag('visitor', L1, WARD_AT)]));
    expect(alarms.map((a) => `${a.layer}:${a.kind}`)).toEqual(['department:enter-other', 'fence:forbid']);
    expect(alarms[1]).toMatchObject({ fenceId: 'ward', ruleId: 'ward' });
  });

  it('lets members of exempt departments into a forbidden fence', () => {
    const e = engine([], [wardFence({ exemptDepartments: [SURGERY] })]);
    expect(kinds(e.check(batch(0, [tag('surgeon', L1, WARD_AT), tag('visitor', L1, WARD_AT)])))).toEqual([
      'visitor:forbid',
    ]);
  });

  it('restricts a fence to selected kinds or to one department', () => {
    const antitheft = engine([], [wardFence({ selector: { kinds: ['asset'] } })]);
    expect(kinds(antitheft.check(batch(0, [tag('nurse', L1, WARD_AT), tag('pump', L1, WARD_AT)])))).toEqual([
      'pump:forbid',
    ]);
    const bound = engine([], [wardFence({ departmentId: SURGERY })]);
    expect(kinds(bound.check(batch(0, [tag('nurse', L1, WARD_AT), tag('surgeon', L1, WARD_AT)])))).toEqual([
      'surgeon:forbid',
    ]);
  });

  it('raises forbid once per entry', () => {
    const e = engine([], [wardFence()]);
    expect(e.check(batch(0, [tag('visitor', L1, WARD_AT)]))).toHaveLength(1);
    expect(e.check(batch(1000, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
    expect(e.check(batch(2000, [tag('visitor', L1, HALL)]))).toEqual([]);
    expect(e.check(batch(3000, [tag('visitor', L1, WARD_AT)]))).toHaveLength(1);
  });

  it('raises dwell after staying long enough, once per stay', () => {
    const e = engine([], [wardFence({ rule: 'dwell', dwellMs: 3000 })]);
    expect(e.check(batch(0, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
    expect(e.check(batch(2000, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
    expect(kinds(e.check(batch(3000, [tag('visitor', L1, WARD_AT)])))).toEqual(['visitor:dwell']);
    expect(e.check(batch(6000, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
  });

  it('raises leave when a subject walks out of the fence', () => {
    const e = engine([], [wardFence({ rule: 'leave', selector: { roles: ['patient'] } })]);
    expect(e.check(batch(0, [tag('patient', L1, WARD_AT)]))).toEqual([]);
    expect(kinds(e.check(batch(1000, [tag('patient', L1, HALL)])))).toEqual(['patient:leave']);
  });

  it('ignores fences on other floors and removed fences', () => {
    const e = engine([], [wardFence({ levelId: IDS.level2 })]);
    expect(e.check(batch(0, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
    const other = engine([], [wardFence()]);
    expect(other.removeFence('ward')).toBe(true);
    expect(other.fences()).toEqual([]);
    expect(other.check(batch(0, [tag('visitor', L1, WARD_AT)]))).toEqual([]);
  });

  it('rejects duplicate fence ids and open rings', () => {
    const e = engine([], [wardFence()]);
    expect(() => e.addFence(wardFence())).toThrow(/already exists/);
    expect(() =>
      e.addFence(
        wardFence({
          id: 'open',
          coordinates: [
            [0, 0],
            [1, 1],
            [1, 0],
          ],
        }),
      ),
    ).toThrow(/closed ring/);
  });
});

describe('status layer', () => {
  it('raises when an asset goes offline or a person calls for help, not on first sight', () => {
    const e = engine([]);
    const pump = (status: string) => ({ ...tag('pump', L1, ROOM), status });
    const nurse = (status?: string) => ({ ...tag('nurse', L1, ROOM), ...(status ? { status } : {}) });
    expect(e.check(batch(0, [pump('offline'), nurse('sos')]))).toEqual([]);
    expect(e.check(batch(1000, [pump('running'), nurse()]))).toEqual([]);
    const alarms = e.check(batch(2000, [pump('offline'), nurse('sos')]));
    expect(alarms.map((a) => `${a.subjectId}:${a.layer}:${a.kind}`)).toEqual([
      'pump:status:offline',
      'nurse:status:sos',
    ]);
    expect(e.check(batch(3000, [pump('offline'), nurse('sos')]))).toEqual([]);
  });

  it('numbers alarms uniquely', () => {
    const e = engine([patientLeaves], [wardFence()]);
    const alarms = [
      ...e.check(batch(0, [tag('patient', L1, WARD_AT)])),
      ...e.check(batch(1000, [tag('visitor', L1, WARD_AT)])),
    ];
    expect(alarms).toHaveLength(3);
    expect(new Set(alarms.map((a) => a.id)).size).toBe(3);
  });
});

describe('alarmPlugin', () => {
  it('checks every position update, draws its fences and keeps the alarms', async () => {
    const provider = createManualProvider();
    const { map } = await openMap([
      floorPlugin,
      polygonPlugin,
      positionStreamPlugin({ provider, intervalMs: 1000, frame: () => () => {} }),
      alarmPlugin({ subjects, departmentRules: [patientLeaves] }),
    ] as const);
    const raised: string[] = [];
    map.events.on('alarm:raise', (a) => raised.push(`${a.subjectId}:${a.kind}`));
    const { levelId: _, ...fence } = wardFence();
    map.plugins.alarm.addFence({ ...fence, floor: '1F' });
    expect(map.plugins.polygon.count()).toBe(1);
    expect(map.plugins.alarm.fences().map((f) => f.id)).toEqual(['ward']);

    provider.emit(batch(0, [tag('patient', L1, HALL)]));
    expect(raised).toEqual(['patient:outside-own']);
    expect(map.plugins.alarm.alarms().map((a) => a.subjectId)).toEqual(['patient']);

    expect(map.plugins.alarm.removeFence('ward')).toBe(true);
    expect(map.plugins.polygon.count()).toBe(0);
    await map.destroy();
    expect(map.resources.size).toBe(0);
  });
});
