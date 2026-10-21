import { useSyncExternalStore } from 'react';
import { storage } from './app-i18n';
import { createThemeSetting, type ThemeName } from './theme';

export const appTheme = createThemeSetting({
  storage,
  prefersDark: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
});

// 地图上的浮层样式按 data-theme 取颜色
const apply = () => {
  document.documentElement.dataset.theme = appTheme.value;
};
apply();
appTheme.subscribe(apply);

/** 当前主题；切换时使用它的组件重新渲染 */
export function useThemeName(): ThemeName {
  const read = () => appTheme.value;
  return useSyncExternalStore(appTheme.subscribe, read, read);
}
