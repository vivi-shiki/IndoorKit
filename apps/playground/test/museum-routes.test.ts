import { describe, expect, it } from 'vitest';
import { parseRoute, routeKey } from '../src/app/routes';
import { MUSEUM_GROUPS, MUSEUM_PAGES, museumHref } from '../src/museum/routes';

describe('museum routes', () => {
  it('opens a museum page with its query', () => {
    const { route, redirect } = parseRoute('#/museum/collection?t=10:00');
    expect(redirect).toBeUndefined();
    expect(route).toMatchObject({ name: 'museum', page: 'collection' });
    expect(route.name === 'museum' && route.query.get('t')).toBe('10:00');
  });

  it('enters the museum demo on the conservation environment map', () => {
    for (const hash of ['#/museum', '#/museum/', '#/museum/unknown']) {
      const { route, redirect } = parseRoute(hash);
      expect(route).toMatchObject({ name: 'museum', page: 'environment' });
      expect(redirect).toBe('#/museum/environment');
    }
  });

  it('mounts the page again when the page or its query changes', () => {
    const key = (hash: string) => routeKey(parseRoute(hash).route);
    expect(key('#/museum/security')).not.toBe(key('#/museum/visitors'));
    expect(key('#/museum/security?t=21:00')).not.toBe(key('#/museum/security'));
    expect(key('#/museum/environment')).not.toBe(key('#/parking/availability'));
  });

  it('builds the links the menu uses', () => {
    expect(museumHref('guide')).toBe('#/museum/guide');
    expect(museumHref('security', 't=21:00')).toBe('#/museum/security?t=21:00');
  });
});

describe('museum menu', () => {
  it('splits the five pages into the curator, operations and visitor views', () => {
    expect(MUSEUM_GROUPS).toEqual([
      { id: 'curator', pages: ['environment', 'collection'] },
      { id: 'operations', pages: ['visitors', 'security'] },
      { id: 'visitor', pages: ['guide'] },
    ]);
    expect(MUSEUM_PAGES).toEqual(MUSEUM_GROUPS.flatMap((g) => g.pages));
  });
});
