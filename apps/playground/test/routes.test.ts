import { describe, expect, it } from 'vitest';
import { HOSPITAL_GROUPS, HOSPITAL_PAGES, parseRoute, routeKey } from '../src/app/routes';

describe('parseRoute', () => {
  it('opens the home page for an empty hash', () => {
    for (const hash of ['', '#', '#/']) expect(parseRoute(hash)).toEqual({ route: { name: 'home' } });
  });

  it('opens a hospital page with its query', () => {
    const { route, redirect } = parseRoute('#/hospital/tracking?tags=500');
    expect(redirect).toBeUndefined();
    expect(route).toMatchObject({ name: 'hospital', page: 'tracking' });
    expect(route.name === 'hospital' && route.query.get('tags')).toBe('500');
  });

  it('enters the hospital demo on its first page, so the map shows straight away', () => {
    for (const hash of ['#/hospital', '#/hospital/', '#/hospital/unknown']) {
      const { route, redirect } = parseRoute(hash);
      expect(route).toMatchObject({ name: 'hospital', page: 'assets' });
      expect(redirect).toBe('#/hospital/assets');
    }
  });

  it('keeps the old page links working by moving them under the hospital demo', () => {
    expect(parseRoute('#/trail?tag=P0001')).toMatchObject({
      route: { name: 'hospital', page: 'trail' },
      redirect: '#/hospital/trail?tag=P0001',
    });
    expect(parseRoute('#/assets').redirect).toBe('#/hospital/assets');
  });

  it('sends removed and unknown pages to the home page', () => {
    for (const old of [
      'basic',
      'memory',
      'realtime',
      'cluster',
      'geofence',
      'heatmap',
      'parking',
      'museum',
    ]) {
      expect(parseRoute(`#/${old}`)).toEqual({ route: { name: 'home' }, redirect: '#/' });
    }
  });
});

describe('routeKey', () => {
  it('differs when the page or its query changes, so the page is mounted again', () => {
    const key = (hash: string) => routeKey(parseRoute(hash).route);
    expect(key('#/hospital/tracking?tags=500')).not.toBe(key('#/hospital/tracking?tags=2000'));
    expect(key('#/hospital/tracking')).not.toBe(key('#/hospital/trail'));
    expect(key('#/')).toBe(key(''));
  });
});

describe('hospital menu', () => {
  it('groups the five pages into the equipment view and the people view', () => {
    expect(HOSPITAL_GROUPS).toEqual([
      { id: 'efficiency', pages: ['assets'] },
      { id: 'people', pages: ['tracking', 'trail', 'alerts', 'occupancy'] },
    ]);
    expect(HOSPITAL_PAGES).toEqual(HOSPITAL_GROUPS.flatMap((g) => g.pages));
  });
});
