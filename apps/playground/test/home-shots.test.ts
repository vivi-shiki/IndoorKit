import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../src/pages/home/scenarios';
import { SHOTS } from '../src/pages/home/shots';

describe('home page screenshots', () => {
  it('has a light and a dark screenshot for every use case', () => {
    for (const scenario of SCENARIOS) {
      const shot = SHOTS[scenario.id];
      expect(shot.light, scenario.id).toBeTruthy();
      expect(shot.dark, scenario.id).toBeTruthy();
      expect(shot.dark, scenario.id).not.toBe(shot.light);
    }
  });

  it('keeps the dark screenshots next to the light ones in docs/images', () => {
    for (const name of ['tracking', 'parking-availability', 'museum-environment']) {
      for (const file of [`${name}.png`, `${name}-dark.png`]) {
        expect(existsSync(new URL(`../../../docs/images/${file}`, import.meta.url)), file).toBe(true);
      }
    }
  });
});
