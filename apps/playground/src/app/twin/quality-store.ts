import { type Quality, RENDER_LEVELS, type RenderOverrides, validateOverrides } from '@indoorkit/core';

export const QUALITY_KEY = 'indoorkit.twin.quality';

export interface QualityChoice {
  quality: Quality;
  overrides: RenderOverrides;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const DEFAULT: QualityChoice = { quality: 'auto', overrides: {} };

/** 画质选择按浏览器保存；数据损坏、存储被禁用时回到自动 */
export function loadQuality(storage: Store): QualityChoice {
  try {
    const raw = storage.getItem(QUALITY_KEY);
    if (!raw) return { ...DEFAULT };
    const value = JSON.parse(raw) as Partial<QualityChoice>;
    const quality = value.quality;
    if (quality !== 'auto' && !RENDER_LEVELS.includes(quality as never)) return { ...DEFAULT };
    return { quality: quality as Quality, overrides: { ...validateOverrides(value.overrides) } };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveQuality(storage: Store, choice: QualityChoice) {
  try {
    storage.setItem(QUALITY_KEY, JSON.stringify(choice));
  } catch {
    // 存储不可用时只在本次会话里生效
  }
}

/** localStorage 在部分浏览器的隐私模式下一读就抛错 */
export function browserStorage(): Store {
  try {
    return localStorage;
  } catch {
    return { getItem: () => null, setItem: () => {} };
  }
}
