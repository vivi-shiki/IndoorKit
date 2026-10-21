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

  it('prefers the innermost unit when units are nested', () => {
    const archive = makeArchive();
    const inner = '00000000-0000-4000-8000-0000000000aa';
    // 房间里的一个小区块（如展示柜），画在房间之后
    archive.unit.features.push({
      type: 'Feature',
      id: inner,
      feature_type: 'unit',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0.0004, 0.0004],
            [0.0006, 0.0004],
            [0.0006, 0.0006],
            [0.0004, 0.0006],
            [0.0004, 0.0004],
          ],
        ],
      },
      properties: { category: 'unspecified', level_id: IDS.level1, name: null },
    });
    const nested = createVenueIndex(buildVenueModel(archive));
    expect(nested.locate(IDS.level1, [0.0005, 0.0005])).toEqual({ unitId: inner });
    expect(nested.locate(IDS.level1, [0.0002, 0.0002])).toEqual({ unitId: IDS.room });
  });

  it('throws for unknown ids', () => {
    expect(() => index.unit('nope')).toThrow(/unknown unit/);
  });
});
