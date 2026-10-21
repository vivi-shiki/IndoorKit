import { useSyncExternalStore } from 'react';
import { storage } from '../app-i18n';
import { createChoice, readChoice } from '../settings';

/** 车牌默认打码；打开后在这个浏览器里保持 */
const KEY = 'indoorkit.parking.plates';
const VALUES = ['masked', 'shown'] as const;

export const plateSetting = createChoice({
  storage,
  key: KEY,
  initial: readChoice(storage, KEY, VALUES) ?? 'masked',
});

export function usePlatesShown(): boolean {
  const read = () => plateSetting.value === 'shown';
  return useSyncExternalStore(plateSetting.subscribe, read, read);
}
