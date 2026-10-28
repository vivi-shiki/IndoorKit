export type TwinView = 'outdoor' | 'indoor';
export type Quality = 'auto' | 'low' | 'high';

/** A dead band keeps a wheel gesture from flickering between the two representations. */
export const nextView = (current: TwinView, zoom: number): TwinView =>
  zoom > 18.85 ? 'indoor' : zoom < 18.5 ? 'outdoor' : current;

export function chooseQuality(
  requested: Quality,
  width: number,
  cores: number,
  saveData: boolean,
): 'low' | 'high' {
  return requested === 'auto' ? (width < 720 || cores <= 4 || saveData ? 'low' : 'high') : requested;
}
