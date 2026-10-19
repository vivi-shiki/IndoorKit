import { type Choice, createChoice, readChoice, type StorageLike } from './settings';

export const THEMES = ['light', 'dark'] as const;
export type ThemeName = (typeof THEMES)[number];
export const THEME_STORAGE_KEY = 'vivi-map.theme';

/** 保存的主题优先，其次跟随系统深色设置，最后为亮色 */
export function createThemeSetting(options: {
  storage: StorageLike;
  prefersDark: boolean;
}): Choice<ThemeName> {
  const saved = readChoice(options.storage, THEME_STORAGE_KEY, THEMES);
  return createChoice({
    storage: options.storage,
    key: THEME_STORAGE_KEY,
    initial: saved ?? (options.prefersDark ? 'dark' : 'light'),
  });
}
