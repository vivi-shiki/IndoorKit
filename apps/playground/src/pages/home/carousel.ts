/** 走马灯里卡片的位置：聚焦的在中间，前一张在左，后一张在右 */
export type Slot = 'left' | 'center' | 'right';

/** 第 i 张卡片在聚焦第 index 张时的位置，首尾相接 */
export function slotOf(i: number, index: number, total: number): Slot {
  const offset = (i - index + total) % total;
  if (offset === 0) return 'center';
  return offset === 1 ? 'right' : 'left';
}
