import { describe, expect, it } from 'vitest';
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  type Asset,
  DAY_START_MS,
  DEPARTMENT_RULES,
  dayTime,
  MOBILE_ASSET_TYPES,
  type Person,
  ROLES,
  sosActive,
  statusAt,
  statusSummary,
  subjectsOf,
} from '../src/index';

const MINUTE = 60_000;
const asset: Asset = {
  id: 'A0001',
  kind: 'asset',
  type: 'monitor',
  departmentId: 'd1',
  code: 'MON-0001',
  battery: 80,
  schedule: [
    { status: 'running', from: 0, to: 60 * MINUTE },
    { status: 'idle', from: 60 * MINUTE, to: 90 * MINUTE },
    { status: 'running', from: 90 * MINUTE, to: 24 * 60 * MINUTE },
  ],
};
const person: Person = {
  id: 'P0001',
  kind: 'person',
  role: 'patient',
  departmentId: 'd1',
  name: { en: 'Ken Sato' },
  sos: { from: 10 * MINUTE, to: 11 * MINUTE },
};

describe('hospital model', () => {
  it('lists the roles, asset types and asset statuses', () => {
    expect(ROLES).toEqual(['doctor', 'nurse', 'patient', 'visitor', 'caregiver', 'security']);
    expect(ASSET_TYPES).toContain('infusion-pump');
    expect(MOBILE_ASSET_TYPES.every((t) => ASSET_TYPES.includes(t))).toBe(true);
    expect(ASSET_STATUSES).toEqual(['running', 'idle', 'offline', 'maintenance']);
  });

  it('starts the working day at nine', () => {
    expect(DAY_START_MS).toBe(9 * 3600_000);
    expect(dayTime(0)).toBe(DAY_START_MS);
  });

  it('reads the status of an asset at a time and summarises the day so far', () => {
    expect(statusAt(asset, 30 * MINUTE)).toBe('running');
    expect(statusAt(asset, 70 * MINUTE)).toBe('idle');
    expect(statusSummary(asset, 100 * MINUTE)).toEqual({
      status: 'running',
      since: 90 * MINUTE,
      runMs: 70 * MINUTE,
    });
  });

  it('knows when a person is calling for help', () => {
    expect(sosActive(person, 10 * MINUTE)).toBe(true);
    expect(sosActive(person, 11 * MINUTE)).toBe(false);
  });

  it('turns a roster into alarm subjects', () => {
    expect(subjectsOf({ people: [person], assets: [asset] })).toEqual([
      { id: 'P0001', kind: 'person', role: 'patient', departmentId: 'd1' },
      { id: 'A0001', kind: 'asset', type: 'monitor', departmentId: 'd1' },
    ]);
  });

  it('keeps the department rules of the hospital', () => {
    expect(DEPARTMENT_RULES.map((r) => r.id)).toEqual([
      'asset-outside',
      'asset-enter-other',
      'patient-outside',
      'visitor-enter-other',
    ]);
  });
});
