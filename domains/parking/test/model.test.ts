import { type RawCollection, validateImdf } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { createParking, maskPlate, parkingExtensions } from '../src/index';
import { BAYS, DEVICES, LEVELS, makeArchive, makeVenue } from './fixture';

const parking = createParking(makeVenue());

const issues = (mutate: (archive: ReturnType<typeof makeArchive>) => void) => {
  const archive = makeArchive();
  mutate(archive);
  const result = validateImdf(archive, parkingExtensions);
  return result.ok ? [] : result.issues;
};
const zonesOf = (a: ReturnType<typeof makeArchive>) => (a['parking-zone'] as RawCollection).features;
const devicesOf = (a: ReturnType<typeof makeArchive>) => (a['parking-device'] as RawCollection).features;
const lanesOf = (a: ReturnType<typeof makeArchive>) => (a['parking-lane'] as RawCollection).features;

describe('parking extensions', () => {
  it('pass validation for the fixture', () => {
    expect(issues(() => {})).toEqual([]);
  });

  it('reject bays that are not parking units or belong to two zones', () => {
    expect(
      issues((a) => {
        zonesOf(a)[0]!.properties.bays[0].unit_id = a.unit.features.find(
          (u) => u.properties.category === 'road',
        )!.id;
      }),
    ).toContainEqual(
      expect.objectContaining({ file: 'parking-zone', message: expect.stringMatching(/not a parking unit/) }),
    );
    expect(
      issues((a) => {
        zonesOf(a)[1]!.properties.bays.push(zonesOf(a)[0]!.properties.bays[0]);
      }),
    ).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/already in zone/) }));
  });

  it('rejects zones spread over two floors and unknown bay types', () => {
    expect(
      issues((a) => {
        zonesOf(a)[0]!.properties.bays.push(zonesOf(a)[2]!.properties.bays.pop());
      }),
    ).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/one floor/) }));
    expect(
      issues((a) => {
        zonesOf(a)[0]!.properties.bays[0].type = 'helipad';
      }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects devices on unknown floors or covering unknown units', () => {
    expect(
      issues((a) => {
        devicesOf(a)[0]!.properties.level_id = '00000000-0000-4000-8000-0000000000ff';
      }),
    ).toContainEqual(
      expect.objectContaining({ file: 'parking-device', message: expect.stringMatching(/unknown level/) }),
    );
    expect(
      issues((a) => {
        devicesOf(a)[0]!.properties.unit_ids = ['00000000-0000-4000-8000-0000000000ff'];
      }),
    ).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/unknown unit/) }));
  });

  it('rejects gateways that are not at the end of a lane', () => {
    expect(
      issues((a) => {
        const gateway = lanesOf(a).find((f) => f.feature_type === 'parking_gateway')!;
        gateway.geometry = { type: 'Point', coordinates: [1, 1] };
      }),
    ).toContainEqual(
      expect.objectContaining({ file: 'parking-lane', message: expect.stringMatching(/lane end/) }),
    );
  });
});

describe('createParking', () => {
  it('lists bays zone by zone with their code, type, detection and floor', () => {
    expect(parking.bays).toHaveLength(18);
    expect(parking.bayByCode('1F-A01')).toMatchObject({
      id: BAYS['1F-A01'],
      type: 'ev',
      detection: 'sensor',
      levelId: LEVELS.l1,
      index: 0,
    });
    expect(parking.bayByCode('P2-L03')).toMatchObject({ type: 'large', detection: 'camera', index: 2 });
    expect(parking.bay(BAYS['2F-B02']!).zoneId).toBe(parking.zoneByCode('2F-B').id);
  });

  it('knows each zone’s floor, kind and site', () => {
    expect(parking.zones.map((z) => [z.code, z.kind, z.site])).toEqual([
      ['1F-A', 'general', 'garage'],
      ['1F-B', 'monthly', 'garage'],
      ['2F-A', 'general', 'garage'],
      ['2F-B', 'general', 'garage'],
      ['P2-S', 'general', 'surface'],
      ['P2-L', 'large', 'surface'],
    ]);
    expect(parking.zoneByCode('2F-A').levelId).toBe(LEVELS.l2);
    expect(parking.zoneByCode('2F-A').name.en).toBe('Zone A');
  });

  it('splits floors into the garage (bottom to top) and the surface lot', () => {
    expect(parking.garageLevels).toEqual([LEVELS.l1, LEVELS.l2]);
    expect(parking.surfaceLevels).toEqual([LEVELS.surface]);
  });

  it('finds the devices that detect a bay', () => {
    expect(
      parking
        .devicesOfBay(BAYS['1F-A01']!)
        .map((d) => d.code)
        .sort(),
    ).toEqual(['EV-1', 'S-1F-A01']);
    expect(
      parking
        .devicesOfBay(BAYS['P2-S01']!)
        .map((d) => d.code)
        .sort(),
    ).toEqual(['CAM-P2', 'FLAP-P2-S01']);
    expect(parking.device(DEVICES['CO-1F']!)).toMatchObject({ kind: 'co-sensor', levelId: LEVELS.l1 });
    expect(parking.devicesOf('gate').map((d) => d.code)).toEqual(['G-IN', 'G-OUT']);
  });

  it('throws for unknown ids', () => {
    expect(() => parking.bay('nope')).toThrow(/unknown bay/);
    expect(() => parking.zoneByCode('9F-Z')).toThrow(/unknown zone/);
    expect(() => parking.device('nope')).toThrow(/unknown device/);
  });

  it('fails clearly when the venue was loaded without the extensions', async () => {
    const { buildVenueModel } = await import('@indoorkit/imdf');
    expect(() => createParking(buildVenueModel(makeArchive()))).toThrow(/without the parking extensions/);
  });
});

describe('maskPlate', () => {
  it('hides the last two digits of the number', () => {
    expect(maskPlate('品川 300 あ 12-34')).toBe('品川 300 あ 12-**');
    expect(maskPlate('みなと 500 さ ・・-7')).toBe('みなと 500 さ ・・-*');
  });
});
