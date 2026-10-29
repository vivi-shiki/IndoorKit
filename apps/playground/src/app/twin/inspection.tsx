import type { Locale } from '../../i18n';
import type { IndoorItem, IndoorMode } from './indoor';
import { TWIN_MESSAGES } from './messages';

/** Same search/row/drawer presentation as the individual map pages. */
export function IndoorList({
  mode,
  items,
  selected,
  query,
  locale,
  floor,
  onQuery,
  onSelect,
}: {
  mode: IndoorMode;
  items: readonly IndoorItem[];
  selected: string | null;
  query: string;
  locale: Locale;
  floor: string;
  onQuery(value: string): void;
  onSelect(item: IndoorItem): void;
}) {
  const t = TWIN_MESSAGES[locale];
  return (
    <section data-testid="twin-business-list">
      <h2 data-testid="twin-business-title">
        {t[mode.label]} · {floor}
      </h2>
      <input
        type="search"
        className="search"
        data-testid="twin-search"
        aria-label={t.search}
        placeholder={t.search}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
      />
      <p className="muted">
        {t.results}: <b data-testid="twin-result-count">{items.length}</b>
      </p>
      <ul className="rows">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="row"
              data-testid="twin-entity"
              data-id={item.id}
              aria-pressed={selected === item.id}
              onClick={() => onSelect(item)}
            >
              <span className="twin-object-name">
                <span className="dot" style={{ background: item.color }} />
                <span>
                  {item.name}
                  <small className="muted">{item.kind}</small>
                </span>
              </span>
              <span className="muted twin-object-status">{item.status}</span>
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="muted" data-testid="twin-empty" role="status">
          {t.noResults}
        </p>
      )}
      <p>
        <a className="link" href={mode.href}>
          {t.more} →
        </a>
      </p>
    </section>
  );
}

export function IndoorDetail({
  item,
  locale,
  floor,
  onClose,
}: {
  item: IndoorItem;
  locale: Locale;
  floor: string;
  onClose(): void;
}) {
  const t = TWIN_MESSAGES[locale];
  return (
    <section className="drawer" data-testid="twin-entity-detail">
      <header>
        <h2>{item.name}</h2>
        <button
          type="button"
          className="close"
          data-testid="twin-close-detail"
          aria-label={t.closeCard}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <dl>
        <dt>{t.code}</dt>
        <dd>{item.id}</dd>
        <dt>{t.floors}</dt>
        <dd>{floor}</dd>
        <dt>{t.kind}</dt>
        <dd>{item.kind}</dd>
        <dt>{t.status}</dt>
        <dd>
          <span className="dot" style={{ background: item.color }} /> {item.status}
        </dd>
        {item.details.map((d) => (
          <div className="twin-detail-field" key={d.label}>
            <dt>{d.label}</dt>
            <dd>{d.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
