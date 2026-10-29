import { departmentExtension } from '@indoorkit/hospital';
import { buildVenueModel } from '@indoorkit/imdf';
import { createMuseum, museumExtensions } from '@indoorkit/museum';
import { createMuseumDay } from '@indoorkit/museum-simulator';
import { createBookings, createParking, parkingExtensions } from '@indoorkit/parking';
import { createParkingDay } from '@indoorkit/parking-simulator';
import {
  generateMuseum,
  generateParking,
  generateVenue,
  MINATO_MUSEUM,
  MINATO_PARKING,
  SAKURA_HOSPITAL,
} from '@indoorkit/venue-gen';
import { describe, expect, it } from 'vitest';
import { hospitalIndoor } from '../src/adapters/twin-indoor';
import { filterIndoorItems } from '../src/app/twin/indoor';
import { createAlarmStore as museumAlarms } from '../src/museum/adapters/alarms';
import { museumIndoor } from '../src/museum/adapters/twin-indoor';
import { createAlarmStore as parkingAlarms } from '../src/parking/adapters/alarms';
import { parkingIndoor } from '../src/parking/adapters/twin-indoor';

const H = 3600_000;
const hospitalVenue = buildVenueModel(generateVenue(SAKURA_HOSPITAL), [departmentExtension]);
const parkingVenue = buildVenueModel(generateParking(MINATO_PARKING), parkingExtensions);
const parking = createParking(parkingVenue);
const parkingDay = createParkingDay(parking, { seed: 'minato' });
const museumVenue = buildVenueModel(generateMuseum(MINATO_MUSEUM), museumExtensions);
const museum = createMuseum(museumVenue);
const museumDay = createMuseumDay(museum, { seed: 'minato-museum' });

const scenes = [
  { venue: hospitalVenue, modes: hospitalIndoor(hospitalVenue), expected: ['assets', 'people', 'alarms'] },
  {
    venue: parkingVenue,
    modes: parkingIndoor({
      venue: parkingVenue,
      parking,
      day: parkingDay,
      bookings: createBookings(parking),
      alarms: parkingAlarms(parking, parkingDay),
    }),
    expected: ['bays', 'devices', 'vehicles', 'alarms'],
  },
  {
    venue: museumVenue,
    modes: museumIndoor({
      venue: museumVenue,
      museum,
      day: museumDay,
      alarms: museumAlarms(museum, museumDay),
    }),
    expected: ['environment', 'visitors', 'security', 'collection', 'alarms'],
  },
];

describe('floor-scoped twin business adapters', () => {
  for (const { venue, modes, expected } of scenes) {
    it(`uses real domain objects for ${expected.join(', ')}`, () => {
      expect(modes.map((m) => m.id)).toEqual(expected);
      const levels = new Set(venue.levels.map((l) => l.id));
      for (const mode of modes) {
        const items = mode.items(14 * H, 'en');
        expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
        for (const item of items) {
          expect(levels.has(item.levelId)).toBe(true);
          expect(item.coord.every(Number.isFinite)).toBe(true);
          expect(item.name).toBeTruthy();
          expect(item.kind).toBeTruthy();
          expect(item.status).toBeTruthy();
          expect(JSON.stringify(item)).not.toContain('undefined');
        }
      }
    });
  }

  it('shares parking device incidents and parked vehicles with existing pages', () => {
    const modes = scenes[1]!.modes;
    expect(modes.find((m) => m.id === 'bays')!.items(14 * H, 'en')).toHaveLength(parking.bays.length);
    expect(modes.find((m) => m.id === 'vehicles')!.items(14 * H, 'en')).toHaveLength(
      parkingDay.parkedAt(14 * H).length + parkingDay.movingAt(14 * H).length,
    );
    const sensor = parking
      .devicesOf('bay-sensor')
      .find((d) => d.unitIds.includes(parking.bayByCode('3F-C07').id))!;
    const devices = modes.find((m) => m.id === 'devices')!;
    expect(devices.items(11 * H, 'en').find((d) => d.id === sensor.id)!.status).toBe('Offline');
    expect(devices.items(12 * H, 'en').find((d) => d.id === sensor.id)!.status).toBe('Online');
  });

  it('uses museum readings, tagged visitors, guards and current object locations', () => {
    const modes = scenes[2]!.modes;
    const climate = museum.devicesOf('climate')[0]!;
    const reading = museumDay.reading(climate.id, 14 * H);
    const sensor = modes
      .find((m) => m.id === 'environment')!
      .items(14 * H, 'en')
      .find((d) => d.id === climate.id)!;
    expect(sensor.details.some((d) => d.value.includes(reading.values.temperature!.toFixed(1)))).toBe(true);
    expect(modes.find((m) => m.id === 'visitors')!.items(14 * H, 'en')).toHaveLength(
      museumDay.taggedAt(14 * H).length,
    );
    expect(
      modes
        .find((m) => m.id === 'security')!
        .items(14 * H, 'en')
        .filter((d) => d.id.startsWith('guard:')),
    ).toHaveLength(museumDay.guards.length);
    expect(modes.find((m) => m.id === 'visitors')!.items(3 * H, 'en')).toEqual([]);
  });

  it('filters the map and list from the same floor and query, including translated names', () => {
    const items = scenes[0]!.modes[0]!.items(14 * H, 'en');
    const first = items[0]!;
    const filtered = filterIndoorItems(items, first.levelId, first.name.toUpperCase());
    expect(filtered.map((i) => i.id)).toContain(first.id);
    expect(filtered.every((i) => i.levelId === first.levelId)).toBe(true);
    expect(filterIndoorItems(items, first.levelId, 'no-such-object-98765')).toEqual([]);
    const japanese = scenes[0]!.modes[0]!.items(14 * H, 'ja');
    expect(japanese[0]!.kind).not.toBe(first.kind);
  });
});
