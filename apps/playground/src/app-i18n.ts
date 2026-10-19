import { createI18n, LOCALE_NAMES, LOCALES, type MessageKey, type StorageLike } from './i18n';

const memoryFallback = new Map<string, string>();
export const storage: StorageLike = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      memoryFallback.set(key, value);
    }
  },
};

export const i18n = createI18n({ storage, languages: navigator.languages ?? [navigator.language] });

let pageTitle: MessageKey | null = null;

/** 当前页面的标题；浏览器标签页显示「页面名 | 产品名」，首页只显示产品名 */
export function setPageTitle(key: MessageKey | null) {
  pageTitle = key;
  translate();
}

/** 把 data-i18n / data-i18n-aria 标记的元素翻译成当前语言 */
export function translate(root: ParentNode = document) {
  document.documentElement.lang = i18n.locale;
  document.title = pageTitle ? `${i18n.t(pageTitle)} | ${i18n.t('app.name')}` : i18n.t('app.name');
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    el.textContent = i18n.t(el.dataset.i18n as MessageKey);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    el.setAttribute('aria-label', i18n.t(el.dataset.i18nAria as MessageKey));
  }
}

i18n.subscribe(() => translate());

/** 语言切换按钮组：中文 / English / 日本語 */
export function languageSwitcher(): { element: HTMLElement; dispose: () => void } {
  const group = document.createElement('div');
  group.className = 'lang-switch';
  group.setAttribute('role', 'group');
  group.dataset.i18nAria = 'language.label';
  const render = () => {
    group.setAttribute('aria-label', i18n.t('language.label'));
    group.replaceChildren(
      ...LOCALES.map((locale) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.lang = locale;
        button.textContent = LOCALE_NAMES[locale];
        button.setAttribute('aria-pressed', String(locale === i18n.locale));
        button.addEventListener('click', () => i18n.setLocale(locale));
        return button;
      }),
    );
  };
  render();
  const dispose = i18n.subscribe(render);
  return { element: group, dispose: () => void dispose() };
}
