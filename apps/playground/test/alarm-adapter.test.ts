import { createIndoorMap } from '@indoorkit/core';
import { fakeMapFactory } from '@indoorkit/core/testing';
import { type AlarmSubject, type DepartmentRule, departmentExtension } from '@indoorkit/hospital';
import { buildVenueModel } from '@indoorkit/imdf';
import { floorPlugin, polygonPlugin, positionStreamPlugin } from '@indoorkit/plugins';
import { createManualProvider } from '@indoorkit/rtls/testing';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../../packages/imdf/test/fixture';
import { hospitalAlarmPlugin } from '../src/adapters/alarm';

const HALL: [number, number] = [0.0015, 0.0005];
const subjects: AlarmSubject[] = [
  { id: 'patient', kind: 'person', role: 'patient', departmentId: IDS.department },
];
const patientLeaves: DepartmentRule = {
  id: 'patient-outside',
  selector: { roles: ['patient'] },
  when: 'outside-own',
  level: 'high',
};
const ring: [number, number][] = [
  [0.001, 0],
  [0.002, 0],
  [0.002, 0.001],
  [0.001, 0.001],
  [0.001, 0],
];

describe('hospitalAlarmPlugin', () => {
  it('checks every position update, draws its fences and keeps the alarms', async () => {
    const provider = createManualProvider();
    const map = await createIndoorMap({
      container: 'map',
      venue: buildVenueModel(makeArchive(), [departmentExtension]),
      mapFactory: fakeMapFactory(),
      plugins: [
        floorPlugin,
        polygonPlugin,
        positionStreamPlugin({ provider, intervalMs: 1000, frame: () => () => {} }),
        hospitalAlarmPlugin({ subjects, departmentRules: [patientLeaves] }),
      ] as const,
    });
    const raised: string[] = [];
    map.events.on('alarm:raise', (a) => raised.push(`${a.subjectId}:${a.kind}`));
    map.plugins.alarm.addFence({ id: 'ward', label: 'Ward', coordinates: ring, rule: 'forbid', level: 'high', floor: '1F' });
    expect(map.plugins.polygon.count()).toBe(1);
    expect(map.plugins.alarm.fences().map((f) => f.id)).toEqual(['ward']);

    provider.emit({ time: 0, positions: [{ id: 'patient', levelId: IDS.level1, coord: HALL }] });
    expect(raised).toEqual(['patient:outside-own', 'patient:forbid']);
    expect(map.plugins.alarm.alarms().map((a) => a.subjectId)).toEqual(['patient', 'patient']);

    expect(map.plugins.alarm.removeFence('ward')).toBe(true);
    expect(map.plugins.polygon.count()).toBe(0);
    await map.destroy();
    expect(map.resources.size).toBe(0);
  });

  it('needs a venue with departments', async () => {
    await expect(
      createIndoorMap({
        container: 'map',
        venue: buildVenueModel(makeArchive()),
        mapFactory: fakeMapFactory(),
        plugins: [floorPlugin, polygonPlugin, hospitalAlarmPlugin({ subjects, departmentRules: [] })] as const,
      }),
    ).rejects.toThrow(/department extension/);
  });
});
