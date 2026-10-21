import { useEffect } from 'react';
import { i18n, useLocale } from '../app-i18n';
import { MUSEUM_MESSAGES, type MuseumKey } from './messages';

export type { MuseumKey } from './messages';

/** 博物馆的文案自己维护，语言的选择和保存用外框的 i18n */

/** 按当前语言翻译 */
export function mt(key: MuseumKey, params?: Record<string, string | number>): string {
  const template = MUSEUM_MESSAGES[i18n.locale][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
}

/** 翻译函数，组件随语言切换重新渲染 */
export function useMuseumT() {
  useLocale();
  return mt;
}

/** 浏览器标签页显示「页面名 | 博物馆演示名」 */
export function useMuseumTitle(key: MuseumKey) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${mt(key)} | ${mt('app.name')}`;
  }, [key, locale]);
}
