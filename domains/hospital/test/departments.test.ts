import { buildVenueModel, type RawCollection, validateImdf } from '@indoorkit/imdf';
import { createVenueIndex } from '@indoorkit/plugins';
import { describe, expect, it } from 'vitest';
import { IDS, makeArchive } from '../../../packages/imdf/test/fixture';
import { createHospital, departmentExtension, departmentsOf } from '../src/index';

const venue = buildVenueModel(makeArchive(), [departmentExtension]);
const hospital = createHospital(venue, createVenueIndex(venue));

describe('departmentExtension', () => {
  it('reads the department file into the venue model', () => {
    expect(departmentsOf(venue)).toEqual([
      {
        id: IDS.department,
        code: 'internal',
        name: { ja: '内科', en: 'Internal Medicine' },
        unitIds: [IDS.room],
      },
    ]);
  });

  it('has no departments when the archive has none', () => {
    const archive = makeArchive();
    delete archive.department;
    expect(departmentsOf(buildVenueModel(archive, [departmentExtension]))).toEqual([]);
  });

  it('rejects unknown units and units listed by two departments', () => {
    const archive = makeArchive();
    const departments = archive.department as RawCollection;
    departments.features[0]!.properties.unit_ids = ['00000000-0000-4000-8000-0000000000ff'];
    const unknown = validateImdf(archive, [departmentExtension]);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.issues[0]).toMatchObject({ file: 'department', message: /unknown unit/ });

    const twice = makeArchive();
    const list = (twice.department as RawCollection).features;
    list.push({ ...list[0]!, id: '00000000-0000-4000-8000-0000000000fe' });
    const result = validateImdf(twice, [departmentExtension]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.message).toMatch(/already belongs to/);
  });

  it('validates the department file with its own schema', () => {
    const archive = makeArchive();
    (archive.department as RawCollection).features[0]!.properties.code = '';
    expect(validateImdf(archive, [departmentExtension]).ok).toBe(false);
  });
});

describe('createHospital', () => {
  it('finds the unit and the department that cover a point', () => {
    expect(hospital.locate(IDS.level1, [0.0005, 0.0005])).toEqual({
      unitId: IDS.room,
      departmentId: IDS.department,
    });
  });

  it('reports a public area as a unit without a department', () => {
    expect(hospital.locate(IDS.level1, [0.0015, 0.0005])).toEqual({ unitId: IDS.hall, departmentId: null });
  });

  it('returns null outside every unit', () => {
    expect(hospital.locate(IDS.level1, [0.0025, 0.0005])).toBeNull();
  });

  it('looks departments up by id, code and unit, and lists their floors', () => {
    expect(hospital.departments.map((d) => d.id)).toEqual([IDS.department]);
    expect(hospital.department(IDS.department).code).toBe('internal');
    expect(hospital.departmentByCode('internal').id).toBe(IDS.department);
    expect(hospital.departmentOfUnit(IDS.room)).toBe(IDS.department);
    expect(hospital.departmentOfUnit(IDS.hall)).toBeNull();
    expect(hospital.departmentLevels(IDS.department)).toEqual([IDS.level1]);
  });

  it('describes departments as zones for the map', () => {
    expect(hospital.zones()).toEqual([{ id: IDS.department, unitIds: [IDS.room] }]);
  });

  it('throws for unknown ids', () => {
    expect(() => hospital.department('nope')).toThrow(/unknown department/);
    expect(() => hospital.departmentByCode('nope')).toThrow(/unknown department/);
  });
});
