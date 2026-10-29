import type { StatusPaint } from '@indoorkit/core';

/** 每层空位比例涂在立面色带上：四分之一以上充足，十分之一以下紧张 */
export function parkingLevelStatus(
  free: ReadonlyMap<string, number>,
  total: ReadonlyMap<string, number>,
): StatusPaint[] {
  return [...total].flatMap(([levelId, bays]) => {
    if (bays === 0) return [];
    const ratio = (free.get(levelId) ?? 0) / bays;
    return [{ levelId, status: ratio >= 0.25 ? 'good' : ratio >= 0.1 ? 'warn' : 'critical' }];
  });
}
