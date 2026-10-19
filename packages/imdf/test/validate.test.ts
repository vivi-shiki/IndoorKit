import { describe, expect, it } from 'vitest';
import { validateImdf } from '../src/index';
import { IDS, makeArchive } from './fixture';

const messages = (input: unknown) => {
  const result = validateImdf(input);
  return result.ok ? [] : result.issues.map((i) => `${i.file}: ${i.message}`);
};

describe('validateImdf', () => {
  it('accepts a valid archive', () => {
    const result = validateImdf(makeArchive());
    expect(result.ok).toBe(true);
  });

  it('reports a missing required file', () => {
    const archive: Record<string, unknown> = { ...makeArchive() };
    delete archive.manifest;
    expect(messages(archive).some((m) => m.startsWith('manifest:'))).toBe(true);
  });

  it('rejects an unknown unit category', () => {
    const archive = makeArchive();
    archive.unit.features[0]!.properties.category = 'spaceship';
    expect(messages(archive).some((m) => m.startsWith('unit:'))).toBe(true);
  });

  it('rejects a unit whose level does not exist', () => {
    const archive = makeArchive();
    archive.unit.features[0]!.properties.level_id = '00000000-0000-4000-8000-0000000000ff';
    expect(messages(archive).some((m) => /unknown level/.test(m))).toBe(true);
  });

  it('rejects a level that points at a missing building', () => {
    const archive = makeArchive();
    archive.level.features[0]!.properties.building_ids = ['00000000-0000-4000-8000-0000000000ee'];
    expect(messages(archive).some((m) => /unknown building/.test(m))).toBe(true);
  });

  it('rejects duplicate feature ids across files', () => {
    const archive = makeArchive();
    archive.opening.features[0]!.id = IDS.room;
    expect(messages(archive).some((m) => /duplicate id/.test(m))).toBe(true);
  });

  it('rejects a unit that is not a polygon', () => {
    const archive = makeArchive();
    (archive.unit.features[0] as { geometry: unknown }).geometry = { type: 'Point', coordinates: [0, 0] };
    expect(messages(archive).some((m) => m.startsWith('unit:'))).toBe(true);
  });

  it('rejects an opening that is not a line', () => {
    const archive = makeArchive();
    (archive.opening.features[0] as { geometry: unknown }).geometry = {
      type: 'Point',
      coordinates: [0, 0],
    };
    expect(messages(archive).some((m) => m.startsWith('opening:'))).toBe(true);
  });

  it('rejects a feature whose feature_type does not match its file', () => {
    const archive = makeArchive();
    (archive.unit.features[0] as { feature_type: string }).feature_type = 'level';
    expect(messages(archive).some((m) => m.startsWith('unit:'))).toBe(true);
  });

  it('rejects non-uuid ids', () => {
    const archive = makeArchive();
    archive.unit.features[0]!.id = 'room-1';
    expect(messages(archive).some((m) => m.startsWith('unit:'))).toBe(true);
  });

  it('accepts an archive without departments', () => {
    const archive = makeArchive();
    delete archive.department;
    expect(validateImdf(archive).ok).toBe(true);
  });

  it('rejects a department that points at a missing unit', () => {
    const archive = makeArchive();
    archive.department!.features[0]!.properties.unit_ids = ['00000000-0000-4000-8000-0000000000ff'];
    expect(messages(archive)).toContain('department: unknown unit 00000000-0000-4000-8000-0000000000ff');
  });

  it('rejects a unit that belongs to two departments', () => {
    const archive = makeArchive();
    const first = archive.department!.features[0]!;
    archive.department!.features.push({
      ...first,
      id: '00000000-0000-4000-8000-0000000000aa',
      properties: { ...first.properties, code: 'surgery' },
    });
    expect(messages(archive)).toContain(`department: unit ${IDS.room} already belongs to ${IDS.department}`);
  });

  it('rejects a department without units or without a code', () => {
    const archive = makeArchive();
    archive.department!.features[0]!.properties.unit_ids = [];
    expect(messages(archive).some((m) => m.startsWith('department:'))).toBe(true);
    const other = makeArchive();
    delete other.department!.features[0]!.properties.code;
    expect(messages(other).some((m) => m.startsWith('department:'))).toBe(true);
  });
});
