import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import type { MoveResult, MuseumObject, SwapSuggestion } from '@indoorkit/museum';
import { CONSERVATION_LIMITS } from '@indoorkit/museum';
import { useLocale } from '../../../app-i18n';
import { budgetState, type ObjectRow } from '../../adapters/live';
import type { MuseumContext } from '../../adapters/venue';
import { useMuseumT } from '../../i18n';
import { useRoomName } from '../../map';
import { clockText, lxhText, percent, valueText } from '../../presentation/format';
import { Swatch } from '../../presentation/swatch';

/** 列表只显示前这么多件 */
const MAX_SHOWN = 60;

/** 藏品名（按当前语言） */
export function useObjectTitle() {
  const locale = useLocale();
  return (o: MuseumObject) => pickLabel(o.title, languageFallbacks(locale)) ?? o.code;
}

/** 藏品所在的地方：展示室 · 展示柜、收藏库；借出时没有地点 */
function useWhere(ctx: MuseumContext) {
  const t = useMuseumT();
  const roomName = useRoomName(ctx);
  return (location: string | null) => {
    if (!location) return t('object.away');
    if (!ctx.museum.isCase(location)) return roomName(location);
    return `${roomName(location)} · ${ctx.museum.case(location).code}`;
  };
}

/** 预算用量的进度条 */
function BudgetBar({ share }: { share: number | null }) {
  const t = useMuseumT();
  if (share === null) return <span className="muted">{t('exposure.unlimited')}</span>;
  const state = budgetState(share)!;
  return (
    <span className="budget">
      <span className="budget-bar" role="presentation">
        <span className={`budget-fill ${state}`} style={{ width: `${Math.min(100, share * 100)}%` }} />
      </span>
      <span className="budget-text">{percent(share)}</span>
    </span>
  );
}

/** 藏品列表：按光照预算用掉的比例从高到低，点一行看详情并在地图上高亮所在的展示柜 */
export function ObjectList(props: {
  ctx: MuseumContext;
  rows: readonly ObjectRow[];
  selected: string | null;
  onSelect: (objectId: string | null) => void;
}) {
  const t = useMuseumT();
  const title = useObjectTitle();
  const where = useWhere(props.ctx);
  return (
    <ul className="rows object-rows" data-testid="object-list">
      {props.rows.length === 0 && <li className="muted">{t('object.none')}</li>}
      {props.rows.slice(0, MAX_SHOWN).map((r) => (
        <li key={r.object.id}>
          <button
            type="button"
            className="row"
            data-testid="object-row"
            data-code={r.object.code}
            aria-pressed={props.selected === r.object.id}
            onClick={() => props.onSelect(props.selected === r.object.id ? null : r.object.id)}
          >
            <span className="name">
              {title(r.object)}
              {r.object.designated && <span className="tag">{t('designated.short')}</span>}
            </span>
            <span className="count muted">{where(r.state.location)}</span>
            <BudgetBar share={r.share} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 藏品卡片：材质、敏感度、所在地、当前照度、今天和今年的累计光照量、预计用完、公开天数 */
export function ObjectCard(props: { ctx: MuseumContext; row: ObjectRow; time: number; onClose: () => void }) {
  const t = useMuseumT();
  const locale = useLocale();
  const title = useObjectTitle();
  const where = useWhere(props.ctx);
  const { ctx, row, time } = props;
  const { object: o, state } = row;
  const label = (map: Record<string, string>) => pickLabel(map, languageFallbacks(locale)) ?? '';
  const lux =
    state.location && state.status === 'display'
      ? (ctx.day.series(state.location, 'illuminance', time, time)[0]?.value ?? null)
      : null;
  const today = row.lxh - ctx.day.exposureAt(o, 0);
  return (
    <aside className="drawer" data-testid="object-card">
      <header>
        <h2>{title(o)}</h2>
        <button type="button" className="close" aria-label={t('action.close')} onClick={props.onClose}>
          ×
        </button>
      </header>
      <Swatch material={o.material} code={o.code} label={t('object.swatch')} />
      <p className="muted">{t('object.swatchNote')}</p>
      <dl>
        <dt>{t('object.code')}</dt>
        <dd>{o.code}</dd>
        <dt>{t('object.artist')}</dt>
        <dd>{label(o.artist)}</dd>
        <dt>{t('object.period')}</dt>
        <dd>{label(o.period)}</dd>
        <dt>{t('object.material')}</dt>
        <dd>
          {t(`material.${o.material}`)} · {t('sensitivity.label')}{' '}
          {t(`sensitivity.${ctx.museum.sensitivityOf(o)}`)}
        </dd>
        <dt>{t('object.status')}</dt>
        <dd data-testid="object-status">{t(`status.${state.status}`)}</dd>
        <dt>{t('object.location')}</dt>
        <dd>{where(state.location)}</dd>
        {lux !== null && (
          <>
            <dt>{t('metric.illuminance')}</dt>
            <dd>{valueText('illuminance', lux)}</dd>
          </>
        )}
        <dt>{t('exposure.today')}</dt>
        <dd>{lxhText(today)}</dd>
        <dt>{t('exposure.label')}</dt>
        <dd data-testid="object-exposure">
          {row.budget === null
            ? `${lxhText(row.lxh)}（${t('exposure.unlimited')}）`
            : t('exposure.ofBudget', { value: lxhText(row.lxh), budget: lxhText(row.budget) })}
        </dd>
        {row.budget !== null && (
          <>
            <dt>{t('exposure.share')}</dt>
            <dd>
              <BudgetBar share={row.share} />
            </dd>
            <dt>{t('exposure.daysLeft')}</dt>
            <dd data-testid="days-left">
              {row.daysLeft === null ? '—' : t('exposure.days', { days: row.daysLeft })}
            </dd>
          </>
        )}
        {o.designated && (
          <>
            <dt>{t('display.label')}</dt>
            <dd data-testid="display-days">
              {t('display.days', { days: row.displayDays, limit: CONSERVATION_LIMITS.displayDays })}
            </dd>
          </>
        )}
      </dl>
    </aside>
  );
}

/** 今天的换展：计划、RFID 读写器的记录和核对结果；点一行在地图上画出搬运路线 */
export function MoveList(props: {
  ctx: MuseumContext;
  results: readonly MoveResult[];
  selected: string | null;
  onSelect: (moveId: string | null) => void;
}) {
  const t = useMuseumT();
  const title = useObjectTitle();
  const where = useWhere(props.ctx);
  const { museum } = props.ctx;
  return (
    <ul className="rows" data-testid="move-list">
      {props.results.map(({ move, status, lastRead }) => (
        <li key={move.id}>
          <button
            type="button"
            className={`row move ${status}`}
            data-testid="move-row"
            data-status={status}
            aria-pressed={props.selected === move.id}
            onClick={() => props.onSelect(props.selected === move.id ? null : move.id)}
          >
            <span className="name">
              {clockText(move.at)} {title(museum.object(move.objectId))}
            </span>
            <span className="count">{t('move.plan', { from: where(move.from), to: where(move.to) })}</span>
            <span className="count">
              <span className={`move-status ${status}`}>{t(`move.${status}`)}</span>
              {lastRead && (
                <span className="muted">
                  {' · '}
                  {t('move.lastRead', { place: where(lastRead.unitId), time: clockText(lastRead.time) })}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 更换建议：光照预算快用完的展品和同一系列里收藏中的替换品 */
export function SwapList(props: {
  ctx: MuseumContext;
  swaps: readonly SwapSuggestion[];
  onSelect: (objectId: string) => void;
}) {
  const t = useMuseumT();
  const title = useObjectTitle();
  const { museum } = props.ctx;
  return (
    <>
      <p className="muted">{t('swap.rule')}</p>
      <ul className="rows" data-testid="swap-list">
        {props.swaps.length === 0 && <li className="muted">{t('swap.none')}</li>}
        {props.swaps.map((s) => (
          <li key={s.objectId}>
            <button
              type="button"
              className="row"
              data-testid="swap-row"
              onClick={() => props.onSelect(s.objectId)}
            >
              <span className="name">{title(museum.object(s.objectId))}</span>
              <span className="count">
                {t('swap.text', {
                  share: percent(s.share),
                  replacement: title(museum.object(s.replacementId)),
                })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
