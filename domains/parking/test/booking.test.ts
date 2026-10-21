import { describe, expect, it } from 'vitest';
import { createBookings, createParking, SLOT_MS } from '../src/index';
import { BAYS, makeVenue } from './fixture';

const H = 3600_000;
const parking = createParking(makeVenue());
const idle = { now: 8 * H, occupied: new Set<string>() };
const codes = (ids: readonly string[]) => ids.map((id) => parking.bay(id).code);

describe('reservations', () => {
  it('reserves in 15-minute slots', () => {
    expect(SLOT_MS).toBe(15 * 60_000);
    const b = createBookings(parking);
    expect(() => b.available({ from: 10 * H + 5 * 60_000, to: 11 * H, vehicle: 'standard' }, idle)).toThrow(
      /15-minute/,
    );
    expect(() => b.available({ from: 11 * H, to: 11 * H, vehicle: 'standard' }, idle)).toThrow(/after/);
  });

  it('offers bays that fit the vehicle and never monthly bays', () => {
    const b = createBookings(parking);
    const slot = { from: 10 * H, to: 12 * H };
    expect(codes(b.available({ ...slot, vehicle: 'standard' }, idle).map((x) => x.id))).toEqual([
      '1F-A03',
      '2F-A01',
      '2F-A02',
      '2F-A03',
      '2F-B01',
      '2F-B02',
      '2F-B03',
      'P2-S01',
      'P2-S02',
      'P2-S03',
    ]);
    expect(codes(b.available({ ...slot, vehicle: 'ev' }, idle).map((x) => x.id))).toEqual(['1F-A01']);
    expect(codes(b.available({ ...slot, vehicle: 'large' }, idle).map((x) => x.id))).toEqual([
      'P2-L01',
      'P2-L02',
      'P2-L03',
    ]);
    expect(
      codes(b.available({ ...slot, vehicle: 'standard', accessible: true }, idle).map((x) => x.id)),
    ).toEqual(['1F-A02']);
  });

  it('orders bays by the walk to the exit when asked', () => {
    const b = createBookings(parking);
    const near = b.available({ from: 10 * H, to: 11 * H, vehicle: 'standard', nearExit: true }, idle);
    const walks = near.map((bay) => b.walkMeters(bay.id));
    expect(walks).toEqual([...walks].sort((x, y) => x - y));
  });

  it('takes a reserved bay out of overlapping slots only', () => {
    const b = createBookings(parking);
    const r = b.reserve({ from: 10 * H, to: 12 * H, vehicle: 'standard', plate: 'P' }, idle, BAYS['2F-A01']);
    expect(r).toMatchObject({ id: 'R-0001', bayId: BAYS['2F-A01'], from: 10 * H, to: 12 * H, plate: 'P' });
    const ids = (from: number, to: number) =>
      b.available({ from, to, vehicle: 'standard' }, idle).map((x) => x.id);
    expect(ids(11 * H, 13 * H)).not.toContain(BAYS['2F-A01']);
    expect(ids(12 * H, 13 * H)).toContain(BAYS['2F-A01']);
    expect(b.reservationAt(BAYS['2F-A01']!, 11 * H)?.id).toBe('R-0001');
    expect(() => b.reserve({ from: 11 * H, to: 12 * H, vehicle: 'standard' }, idle, BAYS['2F-A01'])).toThrow(
      /not available/,
    );
    b.cancel('R-0001');
    expect(ids(11 * H, 13 * H)).toContain(BAYS['2F-A01']);
  });

  it('picks the first available bay when none is given', () => {
    const b = createBookings(parking);
    expect(codes([b.reserve({ from: 10 * H, to: 11 * H, vehicle: 'ev' }, idle).bayId])).toEqual(['1F-A01']);
    expect(() => b.reserve({ from: 10 * H, to: 11 * H, vehicle: 'ev' }, idle)).toThrow(/no bay/);
  });

  it('skips bays occupied right now for slots that start within 30 minutes', () => {
    const b = createBookings(parking);
    const busy = { now: 10 * H, occupied: new Set([BAYS['1F-A03']!]) };
    const ids = (from: number) =>
      b.available({ from, to: from + H, vehicle: 'standard' }, busy).map((x) => x.id);
    expect(ids(10 * H + 15 * 60_000)).not.toContain(BAYS['1F-A03']);
    expect(ids(14 * H)).toContain(BAYS['1F-A03']);
  });
});

describe('event bookings', () => {
  it('blocks a whole zone for its time and refuses overlapping reservations', () => {
    const b = createBookings(parking);
    const zone = parking.zoneByCode('2F-B');
    const result = b.bookEvent({ zoneId: zone.id, from: 10 * H, to: 18 * H, organizer: 'Festa' });
    expect(result.ok).toBe(true);
    const ids = b.available({ from: 12 * H, to: 13 * H, vehicle: 'standard' }, idle).map((x) => x.id);
    for (const bayId of zone.bayIds) expect(ids).not.toContain(bayId);
    expect(b.events()).toHaveLength(1);
  });

  it('reports the reservations that conflict with an event', () => {
    const b = createBookings(parking);
    const r = b.reserve({ from: 9 * H, to: 11 * H, vehicle: 'standard' }, idle, BAYS['2F-B02']);
    const result = b.bookEvent({
      zoneId: parking.zoneByCode('2F-B').id,
      from: 10 * H,
      to: 18 * H,
      organizer: 'X',
    });
    expect(result).toEqual({ ok: false, conflicts: [r] });
    expect(b.events()).toEqual([]);
  });

  it('does not let monthly zones be booked', () => {
    const b = createBookings(parking);
    expect(() =>
      b.bookEvent({ zoneId: parking.zoneByCode('1F-B').id, from: 10 * H, to: 12 * H, organizer: 'X' }),
    ).toThrow(/monthly/);
  });
});

describe('fleet bookings', () => {
  it('fills the large-vehicle zone first with neighbouring bays', () => {
    const b = createBookings(parking);
    const fleet = b.allocateFleet({ company: 'ACME', count: 2, from: 8 * H, to: 18 * H }, idle);
    expect(fleet).toMatchObject({ fits: true });
    expect(codes(fleet.bayIds)).toEqual(['P2-L01', 'P2-L02']);
  });

  it('spills over to the surface lot and then the top garage floor, keeping runs together', () => {
    const b = createBookings(parking);
    const fleet = b.allocateFleet({ company: 'ACME', count: 8, from: 8 * H, to: 18 * H }, idle);
    expect(fleet.fits).toBe(true);
    expect(codes(fleet.bayIds)).toEqual([
      'P2-L01',
      'P2-L02',
      'P2-L03',
      'P2-S01',
      'P2-S02',
      'P2-S03',
      '2F-A01',
      '2F-A02',
    ]);
    expect(fleet.zoneIds.map((id) => parking.zone(id).code)).toEqual(['P2-L', 'P2-S', '2F-A']);
  });

  it('says when the fleet does not fit and keeps confirmed bays out of later offers', () => {
    const b = createBookings(parking);
    expect(b.allocateFleet({ company: 'ACME', count: 99, from: 8 * H, to: 18 * H }, idle).fits).toBe(false);
    const fleet = b.allocateFleet({ company: 'ACME', count: 2, from: 8 * H, to: 18 * H }, idle);
    const booking = b.confirmFleet(fleet);
    expect(booking).toMatchObject({ id: 'F-0001', company: 'ACME', bayIds: fleet.bayIds });
    const again = b.allocateFleet({ company: 'B', count: 1, from: 9 * H, to: 10 * H }, idle);
    expect(codes(again.bayIds)).toEqual(['P2-L03']);
  });
});
