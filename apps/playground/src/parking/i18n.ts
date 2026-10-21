import { useEffect } from 'react';
import { i18n, useLocale } from '../app-i18n';
import { PARKING_MESSAGES, type ParkingKey } from './messages';

export type { ParkingKey } from './messages';

/** 停车场的文案自己维护，语言的选择和保存用外框的 i18n */

/** 按当前语言翻译 */
export function pt(key: ParkingKey, params?: Record<string, string | number>): string {
  const template = PARKING_MESSAGES[i18n.locale][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
}

/** 翻译函数，组件随语言切换重新渲染 */
export function useParkingT() {
  useLocale();
  return pt;
}

/** 浏览器标签页显示「页面名 | 停车场演示名」 */
export function useParkingTitle(key: ParkingKey) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${pt(key)} | ${pt('app.name')}`;
  }, [key, locale]);
}
