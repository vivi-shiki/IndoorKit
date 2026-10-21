import { describe, expect, it } from 'vitest';
import { messages } from '../src/i18n';
import { SCENARIOS } from '../src/pages/home/scenarios';

describe('home page scenarios', () => {
  it('shows the hospital, parking and museum use cases in that order', () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(['hospital', 'parking', 'museum']);
  });

  it('opens the hospital and parking demos; the museum is still in development', () => {
    expect(SCENARIOS.map((s) => [s.id, s.href ?? null])).toEqual([
      ['hospital', '#/hospital'],
      ['parking', '#/parking'],
      ['museum', null],
    ]);
  });

  it('describes every scenario with at least two views, in every language', () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.views.length).toBeGreaterThanOrEqual(2);
      for (const locale of ['zh', 'en', 'ja'] as const) {
        for (const key of [
          scenario.title,
          scenario.description,
          ...scenario.views.flatMap((v) => [v.title, v.desc]),
        ]) {
          expect(messages[locale][key], `${locale} ${key}`).toBeTruthy();
        }
      }
    }
  });

  it('describes the planned parking and museum demos with their fictional venues', () => {
    const text = (id: string, locale: 'zh' | 'en' | 'ja') =>
      messages[locale][SCENARIOS.find((s) => s.id === id)!.description];
    expect(text('parking', 'ja')).toContain('みなと中央パーキング');
    expect(text('parking', 'en')).toContain('Minato Central Parking');
    expect(text('museum', 'ja')).toContain('みなと市立美術博物館');
    expect(text('museum', 'en')).toContain('Minato City Museum');
  });
});
