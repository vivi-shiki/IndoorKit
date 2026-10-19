import { i18n, storage } from './app-i18n';
import { createThemeSetting } from './theme';

export const appTheme = createThemeSetting({
  storage,
  prefersDark: typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches,
});

const apply = () => {
  document.documentElement.dataset.theme = appTheme.value;
};
apply();
appTheme.subscribe(apply);

/** 亮色 / 暗色切换按钮，文字是切换后的主题 */
export function themeToggle(): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  const render = () => {
    button.textContent = i18n.t(appTheme.value === 'dark' ? 'theme.light' : 'theme.dark');
    button.setAttribute('aria-pressed', String(appTheme.value === 'dark'));
  };
  render();
  button.addEventListener('click', () => appTheme.set(appTheme.value === 'dark' ? 'light' : 'dark'));
  appTheme.subscribe(render);
  i18n.subscribe(render);
  return button;
}
