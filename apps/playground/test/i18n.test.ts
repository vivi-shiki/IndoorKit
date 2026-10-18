import { describe, expect, it, vi } from 'vitest';
import { createI18n, detectLocale, LOCALES, messages, STORAGE_KEY } from '../src/i18n';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    data,
  };
}

describe('messages', () => {
  it('has every key in all three languages', () => {
    const keys = Object.keys(messages.zh).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(messages[locale]).sort()).toEqual(keys);
      for (const key of keys) expect(messages[locale][key as keyof typeof messages.zh]).not.toBe('');
    }
  });
});

describe('detectLocale', () => {
  it('prefers a saved locale', () => {
    expect(detectLocale(memoryStorage({ [STORAGE_KEY]: 'ja' }), ['en-US'])).toBe('ja');
  });

  it('ignores an invalid saved value', () => {
    expect(detectLocale(memoryStorage({ [STORAGE_KEY]: 'fr' }), ['ja-JP'])).toBe('ja');
  });

  it('matches the browser language by prefix', () => {
    expect(detectLocale(memoryStorage(), ['zh-TW', 'en'])).toBe('zh');
    expect(detectLocale(memoryStorage(), ['de-DE', 'ja'])).toBe('ja');
  });

  it('falls back to English', () => {
    expect(detectLocale(memoryStorage(), ['fr-FR'])).toBe('en');
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(detectLocale(broken, ['ja'])).toBe('ja');
  });
});

describe('createI18n', () => {
  it('translates with parameters', () => {
    const i18n = createI18n({ storage: memoryStorage(), languages: ['en'] });
    expect(i18n.locale).toBe('en');
    expect(i18n.t('demo.basic.title')).toBe(messages.en['demo.basic.title']);
    expect(i18n.t('metric.ms', { value: 12 })).toBe('12 ms');
  });

  it('saves the new locale and notifies listeners', () => {
    const storage = memoryStorage();
    const i18n = createI18n({ storage, languages: ['en'] });
    const listener = vi.fn();
    i18n.subscribe(listener);
    i18n.setLocale('ja');
    expect(i18n.locale).toBe('ja');
    expect(storage.data.get(STORAGE_KEY)).toBe('ja');
    expect(listener).toHaveBeenCalledWith('ja');
  });

  it('restores the saved locale in a new session', () => {
    const storage = memoryStorage();
    createI18n({ storage, languages: ['en'] }).setLocale('zh');
    expect(createI18n({ storage, languages: ['en'] }).locale).toBe('zh');
  });

  it('does not notify when the locale is unchanged', () => {
    const i18n = createI18n({ storage: memoryStorage(), languages: ['en'] });
    const listener = vi.fn();
    i18n.subscribe(listener);
    i18n.setLocale('en');
    expect(listener).not.toHaveBeenCalled();
  });
});
