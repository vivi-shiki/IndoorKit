import type { Material } from '@indoorkit/museum';
import { MATERIAL_SWATCHES } from './colors';

/** 藏品的示意图：按材质的两色图案，不用真实作品图像 */
export function Swatch(props: { material: Material; code: string; label: string }) {
  const [base, accent] = MATERIAL_SWATCHES[props.material];
  // 编号决定图案的位置，同一件藏品每次一样
  const n = [...props.code].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <svg className="swatch-art" viewBox="0 0 120 80" role="img" aria-label={props.label}>
      <rect width="120" height="80" fill={base} />
      <circle cx={30 + (n % 60)} cy={20 + (n % 40)} r={14 + (n % 10)} fill={accent} opacity="0.85" />
      <rect x={(n * 7) % 80} y="56" width="40" height="8" fill={accent} opacity="0.6" />
    </svg>
  );
}
