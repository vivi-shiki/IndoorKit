import type { Locale } from '../../i18n';
import type { TwinKey } from './messages';

/** Translated presentation data; the scenario adapter owns all business rules. */
export interface IndoorItem {
  id: string;
  levelId: string;
  coord: [number, number];
  name: string;
  kind: string;
  status: string;
  color: string;
  details: { label: string; value: string }[];
}

export interface IndoorMode {
  id: string;
  label: TwinKey;
  href: string;
  items(time: number, locale: Locale): IndoorItem[];
}

/** One projection feeds both the markers and the list, preventing contradictory filters. */
export function filterIndoorItems(items: readonly IndoorItem[], levelId: string, query: string) {
  const q = query.trim().toLocaleLowerCase();
  return items.filter(
    (item) =>
      item.levelId === levelId &&
      (!q ||
        [item.id, item.name, item.kind, item.status, ...item.details.map((d) => d.value)].some((text) =>
          text.toLocaleLowerCase().includes(q),
        )),
  );
}
