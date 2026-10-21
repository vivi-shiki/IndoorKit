import { buildVenueModel, validateImdf } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { createMuseum, museumExtensions } from '../src/index';
import { at, DEVICES, LEVELS, makeArchive, makeMuseum, OBJECTS, UNITS } from './fixture';

const museum = makeMuseum();

describe('museum extensions', () => {
  it('validates the five extension files', () => {
    expect(validateImdf(makeArchive(), museumExtensions).ok).toBe(true);
  });

  it('rejects a room that points at an unknown exhibition', () => {
    const archive = makeArchive();
    const room = (archive['museum-space'] as { features: { properties: Record<string, unknown> }[] })
      .features[1]!;
    room.properties.exhibition = 'NOPE';
    const result = validateImdf(archive, museumExtensions);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).toContain('unknown exhibition NOPE');
  });

  it('rejects a case on another floor than its room', () => {
    const archive = makeArchive();
    const c = (archive['museum-case'] as { features: { properties: Record<string, unknown> }[] })
      .features[0]!;
    c.properties.room_id = UNITS.g2;
    expect(JSON.stringify(validateImdf(archive, museumExtensions))).toContain('floor of its room');
  });

  it('only lets an object on loan have no location', () => {
    const archive = makeArchive();
    const o = (archive['museum-object'] as { features: { properties: Record<string, unknown> }[] })
      .features[0]!;
    o.properties.location = null;
    expect(JSON.stringify(validateImdf(archive, museumExtensions))).toContain('only an object on loan');
  });

  it('refuses a venue loaded without the extensions', () => {
    expect(() => createMuseum(buildVenueModel(makeArchive()))).toThrow(/without the museum extensions/);
  });
});

describe('createMuseum', () => {
  it('finds rooms, cases, objects, devices and routes by id and code', () => {
    expect(museum.roomByCode('G1').unitId).toBe(UNITS.g1);
    expect(museum.room(UNITS.g1).name.en).toBe('Gallery 1');
    expect(museum.room(UNITS.g2).levelId).toBe(LEVELS.l2);
    expect(museum.caseByCode('C1')).toMatchObject({ unitId: UNITS.c1, roomId: UNITS.g1, sealed: true });
    expect(museum.isCase(UNITS.c1)).toBe(true);
    expect(museum.isCase(UNITS.g1)).toBe(false);
    expect(museum.objectByCode('O-1').id).toBe(OBJECTS['O-1']);
    expect(museum.deviceByCode('CL-G1').id).toBe(DEVICES['CL-G1']);
    expect(museum.route('P1').stops.map((s) => s.code)).toEqual(['CP-1', 'CP-2']);
    expect(() => museum.roomByCode('X')).toThrow(/unknown room/);
  });

  it('knows which room a case is in and what is in a case or room', () => {
    expect(museum.roomOf(UNITS.c2).code).toBe('G1');
    expect(museum.roomOf(UNITS.s1).code).toBe('S1');
    expect(museum.casesIn(UNITS.g1).map((c) => c.code)).toEqual(['C1', 'C2']);
    expect(museum.objectsAt(UNITS.c1).map((o) => o.code)).toEqual(['O-1']);
    expect(
      museum
        .objectsAt(UNITS.g1)
        .map((o) => o.code)
        .sort(),
    ).toEqual(['O-1', 'O-2']);
    expect(museum.objectsAt(UNITS.s1).map((o) => o.code)).toEqual(['O-3']);
    expect(museum.devicesAt(UNITS.c1).map((d) => d.code)).toEqual(['CL-C1', 'LX-C1', 'DR-C1', 'VB-C1']);
  });

  it('applies the standard of the most sensitive object', () => {
    expect(museum.standardOf(UNITS.c1).sensitivity).toBe('high');
    expect(museum.standardOf(UNITS.c2).sensitivity).toBe('low');
    expect(museum.standardOf(UNITS.g1).sensitivity).toBe('high');
    expect(museum.standardOf(UNITS.c3).sensitivity).toBe('medium');
    expect(museum.standardOf(UNITS.core1).sensitivity).toBe('low');
  });

  it('walks out of the door, along the hall and through the stair core to another floor', () => {
    const path = museum.walkPath(UNITS.c1, UNITS.g2);
    expect(path.map((p) => p.levelId)).toEqual([
      LEVELS.l1,
      LEVELS.l1,
      LEVELS.l1,
      LEVELS.l1,
      LEVELS.l1,
      LEVELS.l2,
      LEVELS.l2,
      LEVELS.l2,
      LEVELS.l2,
      LEVELS.l2,
    ]);
    expect(path[1]!.coord).toEqual(at(10, 9));
    expect(path[2]!.coord).toEqual(at(10, 12));
    expect(path[3]!.coord).toEqual(at(33, 12));
    expect(path.at(-1)!.coord).toEqual(museum.room(UNITS.g2).center);
  });

  it('stays on the floor between two rooms on it and inside a room', () => {
    expect(museum.walkPath(UNITS.g1, UNITS.s1).map((p) => p.coord)).toEqual([
      museum.room(UNITS.g1).center,
      at(10, 9),
      at(10, 12),
      at(25, 12),
      at(25, 9),
      museum.room(UNITS.s1).center,
    ]);
    expect(museum.walkPath(UNITS.c1, UNITS.c2)).toHaveLength(2);
  });
});
