import { describe, expect, it, vi } from 'vitest';
import { createThemeSetting, THEME_STORAGE_KEY } from '../src/theme';

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

describe('createThemeSetting', () => {
  it('prefers a saved theme', () => {
    const setting = createThemeSetting({ storage: memoryStorage({ [THEME_STORAGE_KEY]: 'dark' }), prefersDark: false });
    expect(setting.value).toBe('dark');
  });

  it('falls back to the system preference, then light', () => {
    expect(createThemeSetting({ storage: memoryStorage(), prefersDark: true }).value).toBe('dark');
    expect(createThemeSetting({ storage: memoryStorage(), prefersDark: false }).value).toBe('light');
  });

  it('ignores an invalid saved value', () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: 'purple' });
    expect(createThemeSetting({ storage, prefersDark: false }).value).toBe('light');
  });

  it('saves the choice, notifies listeners and restores it next time', () => {
    const storage = memoryStorage();
    const setting = createThemeSetting({ storage, prefersDark: false });
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.set('dark');
    expect(listener).toHaveBeenCalledWith('dark');
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(createThemeSetting({ storage, prefersDark: false }).value).toBe('dark');
  });
});
