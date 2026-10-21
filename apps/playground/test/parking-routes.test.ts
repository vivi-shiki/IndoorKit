import { describe, expect, it } from 'vitest';
import { parseRoute, routeKey } from '../src/app/routes';
import { PARKING_GROUPS, PARKING_PAGES, parkingHref } from '../src/parking/routes';

describe('parking routes', () => {
  it('opens a parking page with its query', () => {
    const { route, redirect } = parseRoute('#/parking/vehicles?t=09:30');
    expect(redirect).toBeUndefined();
    expect(route).toMatchObject({ name: 'parking', page: 'vehicles' });
    expect(route.name === 'parking' && route.query.get('t')).toBe('09:30');
  });

  it('enters the parking demo on the availability map', () => {
    for (const hash of ['#/parking', '#/parking/', '#/parking/unknown']) {
      const { route, redirect } = parseRoute(hash);
      expect(route).toMatchObject({ name: 'parking', page: 'availability' });
      expect(redirect).toBe('#/parking/availability');
    }
  });

  it('mounts the page again when the page or its query changes', () => {
    const key = (hash: string) => routeKey(parseRoute(hash).route);
    expect(key('#/parking/alerts')).not.toBe(key('#/parking/vehicles'));
    expect(key('#/parking/alerts?t=10:00')).not.toBe(key('#/parking/alerts'));
    expect(key('#/parking/alerts')).not.toBe(key('#/hospital/alerts'));
  });

  it('builds the links the menu uses', () => {
    expect(parkingHref('reserve')).toBe('#/parking/reserve');
    expect(parkingHref('analytics', 'range=lunch')).toBe('#/parking/analytics?range=lunch');
  });
});

describe('parking menu', () => {
  it('splits the five pages into the operator view and the driver view', () => {
    expect(PARKING_GROUPS).toEqual([
      { id: 'operator', pages: ['availability', 'vehicles', 'alerts', 'analytics'] },
      { id: 'driver', pages: ['reserve'] },
    ]);
    expect(PARKING_PAGES).toEqual(PARKING_GROUPS.flatMap((g) => g.pages));
  });
});
