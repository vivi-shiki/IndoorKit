import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../imdf/test/fixture';
import { createVenueIndex } from '../src/index';

const venue = buildVenueModel(makeArchive());
const index = createVenueIndex(venue);

describe('createVenueIndex', () => {
  it('finds the unit that covers a point', () => {
    expect(index.locate(IDS.level1, [0.0005, 0.0005])).toEqual({ unitId: IDS.room });
    expect(index.locate(IDS.level1, [0.0015, 0.0005])).toEqual({ unitId: IDS.hall });
  });

  it('returns null outside every unit or on another floor', () => {
    expect(index.locate(IDS.level1, [0.0025, 0.0005])).toBeNull();
    expect(index.locate(IDS.level2, [0.0005, 0.0005])).toBeNull();
  });

  it('describes units', () => {
    const unit = index.unit(IDS.room);
    expect(unit).toMatchObject({ id: IDS.room, levelId: IDS.level1, category: 'room' });
    expect(unit).not.toHaveProperty('departmentId');
    expect(unit.name.en).toBe('Internal Medicine');
    expect(unit.center[0]).toBeCloseTo(0.0005, 9);
    expect(unit.center[1]).toBeCloseTo(0.0005, 9);
    expect(index).not.toHaveProperty('department');
  });

  it('throws for unknown ids', () => {
    expect(() => index.unit('nope')).toThrow(/unknown unit/);
  });
});
