import { useEffect, useSyncExternalStore } from 'react';
import { createI18n, type Locale, type MessageKey, type StorageLike } from './i18n';

export { LOCALE_NAMES, LOCALES, type Locale } from './i18n';

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

const url = new URL(location.href);
export const i18n = createI18n({
  storage,
  languages: navigator.languages ?? [navigator.language],
  requested: url.searchParams.get('lang'),
});
// 链接上的语言用过即去掉，之后以保存的选择为准，切换按钮也不会被地址栏覆盖
if (url.searchParams.has('lang')) {
  url.searchParams.delete('lang');
  history.replaceState(history.state, '', url);
}

/** 当前语言；语言切换时使用它的组件重新渲染 */
export function useLocale(): Locale {
  const read = () => i18n.locale;
  return useSyncExternalStore(i18n.subscribe, read, read);
}

/** 翻译函数，组件随语言切换重新渲染 */
export function useT() {
  useLocale();
  return i18n.t;
}

/** 浏览器标签页显示「页面名 | 医院演示名」，首页只显示 SDK 名 */
export function usePageTitle(key: MessageKey | null) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = key ? `${i18n.t(key)} | ${i18n.t('app.name')}` : 'IndoorKit';
  }, [key, locale]);
}
