import type { Museum, MuseumObject } from './model';
import { STANDARDS } from './standards';

/** 预算用到这个比例的展品建议换下 */
export const SWAP_FROM = 0.9;
/** 替换品的预算用量要低于这个比例 */
export const SWAP_TO = 0.5;

export interface SwapSuggestion {
  /** 建议撤下的展品 */
  objectId: string;
  /** 同一系列、收藏中、光照余量多的替换品 */
  replacementId: string;
  share: number;
}

/**
 * 建议更换的展品：累计光照量超过预算 90% 的展品，同一系列里有收藏中、用量不到一半的替换品时给出。
 * lxh 是每件藏品今年的累计光照量。
 */
export function suggestSwaps(museum: Museum, lxh: ReadonlyMap<string, number>): SwapSuggestion[] {
  const shareOf = (o: MuseumObject) => {
    const budget = STANDARDS[museum.sensitivityOf(o)].annualLxh;
    return budget === null ? null : (lxh.get(o.id) ?? 0) / budget;
  };
  const out: SwapSuggestion[] = [];
  const taken = new Set<string>();
  const shown = museum.objects
    .filter((o) => o.status === 'display' && o.series !== null)
    .map((o) => ({ o, share: shareOf(o) }))
    .filter((x): x is { o: MuseumObject; share: number } => x.share !== null && x.share >= SWAP_FROM)
    .sort((a, b) => b.share - a.share);
  for (const { o, share } of shown) {
    const replacement = museum.objects
      .filter((r) => r.series === o.series && r.status === 'storage' && !taken.has(r.id))
      .map((r) => ({ r, share: shareOf(r) ?? 0 }))
      .filter((x) => x.share < SWAP_TO)
      .sort((a, b) => a.share - b.share)[0];
    if (!replacement) continue;
    taken.add(replacement.r.id);
    out.push({ objectId: o.id, replacementId: replacement.r.id, share });
  }
  return out;
}
