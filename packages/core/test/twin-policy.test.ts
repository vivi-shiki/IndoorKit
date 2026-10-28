import { describe, expect, it } from 'vitest';
import { chooseQuality, nextView } from '../src/twin/policy';

describe('twin rendering policy', () => {
  it('uses hysteresis to avoid flashing at the indoor threshold', () => {
    expect(nextView('outdoor', 18.9)).toBe('indoor');
    expect(nextView('indoor', 18.7)).toBe('indoor');
    expect(nextView('outdoor', 18.7)).toBe('outdoor');
    expect(nextView('indoor', 18.4)).toBe('outdoor');
  });
  it('honours explicit quality and limits constrained devices', () => {
    expect(chooseQuality('auto', 390, 4, false)).toBe('low');
    expect(chooseQuality('auto', 1440, 8, false)).toBe('high');
    expect(chooseQuality('auto', 1440, 8, true)).toBe('low');
    expect(chooseQuality('low', 1440, 16, false)).toBe('low');
  });
});
