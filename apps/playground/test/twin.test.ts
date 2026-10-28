import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/app/routes';
import { TWIN_MESSAGES } from '../src/app/twin/messages';

describe('digital twin routes', () => {
  it('provides the same cockpit vocabulary in all three languages', () => {
    for (const dictionary of Object.values(TWIN_MESSAGES)) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(TWIN_MESSAGES.en).sort());
      expect(Object.values(dictionary).every((s) => s.trim().length > 0)).toBe(true);
    }
  });
  for (const scenario of ['hospital', 'parking', 'museum']) {
    it(`opens the ${scenario} cockpit directly`, () => {
      const { route, redirect } = parseRoute(`#/${scenario}/twin`);
      expect(redirect).toBeUndefined();
      expect(route).toMatchObject({ name: scenario, page: 'twin' });
    });
  }
});
