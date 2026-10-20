import {
  type Asset,
  type DepartmentModel,
  type HospitalLocation,
  type HospitalVenue,
  statusSummary,
} from '@indoorkit/hospital';
import type { FloorApi, VenueIndex } from '@indoorkit/plugins';
import type { TagPosition } from '@indoorkit/rtls';
import type { CSSProperties } from 'react';
import { useT } from '../../app-i18n';
import { STATUS_COLORS, STATUS_ORDER } from '../../presentation/colors';
import {
  assetName,
  departmentName,
  formatClock,
  formatDuration,
  label,
  placeText,
  unitLabel,
} from '../../presentation/format';
import { floorName } from '../map-page';

const DAY_MS = 24 * 3600_000;

/** 视图需要的场馆查询；只读，不改地图 */
export interface AssetsViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  departmentOfUnit(unitId: string): string | null;
}

/** 左侧：科室 → 区块；选中的科室展开它有设备的区块 */
export function DepartmentList(props: {
  ctx: AssetsViewContext;
  departments: readonly DepartmentModel[];
  counts: Map<string, { total: number; abnormal: number }>;
  selected: string | null;
  membersOf: (unitId: string) => number;
  onDepartment: (id: string) => void;
  onUnit: (unitId: string) => void;
}) {
  const { ctx } = props;
  return (
    <ul className="rows" data-testid="dept-list">
      {props.departments.map((d) => {
        const c = props.counts.get(d.id) ?? { total: 0, abnormal: 0 };
        const pressed = d.id === props.selected;
        return (
          <li key={d.id}>
            <button
              type="button"
              className="row"
              data-testid="dept-row"
              data-dept={d.id}
              aria-pressed={pressed}
              onClick={() => props.onDepartment(d.id)}
            >
              <span>{label(d.name)}</span>
              <span className="count">
                {c.total}
                {c.abnormal > 0 && (
                  <>
                    {' '}
                    <em>{c.abnormal}</em>
                  </>
                )}
              </span>
            </button>
            {pressed && (
              <ul className="sub">
                {d.unitIds.map((u) => {
                  const n = props.membersOf(u);
                  return n > 0 ? (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: 区块行和原来一样只响应点击，键盘用户可从地图聚合点打开
                    <li key={u} data-testid="unit-row" data-unit={u} onClick={() => props.onUnit(u)}>
                      <span>
                        {floorName(ctx.floor, ctx.index.unit(u).levelId)} {unitLabel(ctx.index, ctx.venue, u)}
                      </span>
                      <b>{n}</b>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 右侧：一个区块里的设备，按状态从严重到轻微 */
export function UnitDrawer(props: {
  ctx: AssetsViewContext;
  unitId: string;
  members: TagPosition[];
  assets: Map<string, Asset>;
  now: number;
  onClose: () => void;
  onAsset: (id: string) => void;
}) {
  const t = useT();
  const { ctx, now } = props;
  const unit = ctx.index.unit(props.unitId);
  const unitDepartment = ctx.departmentOfUnit(unit.id);
  const sorted = [...props.members].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status as never) - STATUS_ORDER.indexOf(b.status as never),
  );
  const abnormal = sorted.filter((p) => p.status === 'offline' || p.status === 'maintenance').length;
  return (
    <>
      <header>
        <h2>
          {floorName(ctx.floor, unit.levelId)} {unitLabel(ctx.index, ctx.venue, unit.id)}
        </h2>
        <button
          type="button"
          className="close"
          data-testid="close-drawer"
          aria-label={t('action.close')}
          onClick={props.onClose}
        >
          ×
        </button>
      </header>
      <p className="muted">
        {departmentName(ctx.venue, unitDepartment)} · {t('detail.devices', { value: sorted.length })}
        {abnormal > 0 && (
          <>
            {' · '}
            <em>{t('detail.abnormal', { value: abnormal })}</em>
          </>
        )}
      </p>
      <ul className="rows">
        {sorted.map((p) => {
          const asset = props.assets.get(p.id)!;
          const summary = statusSummary(asset, now);
          return (
            <li key={asset.id}>
              <button
                type="button"
                className="row asset"
                data-testid="asset-row"
                data-asset={asset.id}
                onClick={() => props.onAsset(asset.id)}
              >
                <span className="status" style={{ '--c': STATUS_COLORS[summary.status] } as CSSProperties}>
                  {t(`status.${summary.status}`)}
                </span>
                <span className="name">
                  {assetName(asset)}
                  {asset.departmentId !== unitDepartment && (
                    <span className="tag">
                      {t('place.belongsTo', { value: departmentName(ctx.venue, asset.departmentId) })}
                    </span>
                  )}
                </span>
                <span className="muted">
                  {formatDuration(now - summary.since)} · {t('detail.runToday')}{' '}
                  {formatDuration(summary.runMs)} · {asset.battery}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 当天到此刻为止的状态色条 */
function Timeline({ asset, now }: { asset: Asset; now: number }) {
  const t = useT();
  const end = now % DAY_MS;
  return (
    <div className="timeline" data-testid="status-timeline">
      {asset.schedule
        .filter((s) => s.from < end)
        .map((s) => (
          <span
            key={s.from}
            data-status={s.status}
            style={{
              width: `${((Math.min(s.to, end) - s.from) / end) * 100}%`,
              background: STATUS_COLORS[s.status],
            }}
            title={`${formatClock(s.from)} ${t(`status.${s.status}`)}`}
          />
        ))}
    </div>
  );
}

/** 右侧：一台设备的详情 */
export function AssetDetail(props: {
  ctx: AssetsViewContext;
  asset: Asset;
  position: TagPosition | undefined;
  where: HospitalLocation | null;
  now: number;
  moves: { time: number; place: string }[];
  onClose: () => void;
}) {
  const t = useT();
  const { ctx, asset, position, where, now } = props;
  const summary = statusSummary(asset, now);
  const outside = position !== undefined && where?.departmentId !== asset.departmentId;
  return (
    <>
      <header>
        <h2>{assetName(asset)}</h2>
        <button
          type="button"
          className="close"
          data-testid="close-detail"
          aria-label={t('action.close')}
          onClick={props.onClose}
        >
          ×
        </button>
      </header>
      <dl>
        <dt>{t('detail.department')}</dt>
        <dd data-testid="asset-department">{departmentName(ctx.venue, asset.departmentId)}</dd>
        <dt>{t('detail.location')}</dt>
        <dd>
          {position && `${floorName(ctx.floor, position.levelId)} · `}
          {placeText(ctx.index, ctx.venue, where)}
          {outside && <span className="tag warn">{t('place.outsideOwn')}</span>}
        </dd>
        <dt>{t('detail.status')}</dt>
        <dd data-testid="asset-status">
          <span className="status" style={{ '--c': STATUS_COLORS[summary.status] } as CSSProperties}>
            {t(`status.${summary.status}`)}
          </span>{' '}
          {t('detail.since', { value: formatDuration(now - summary.since) })}
        </dd>
        <dt>{t('detail.runToday')}</dt>
        <dd data-testid="asset-run-today">{formatDuration(summary.runMs)}</dd>
        <dt>{t('detail.battery')}</dt>
        <dd>{asset.battery}%</dd>
      </dl>
      <h3>
        {t('detail.timeline')} <span className="muted">00:00 – {formatClock(now)}</span>
      </h3>
      <Timeline asset={asset} now={now} />
      <h3>{t('detail.moves')}</h3>
      <ul className="moves">
        {props.moves.length > 0 ? (
          props.moves.map((m) => (
            <li key={m.time}>
              {formatClock(m.time)} → {m.place}
            </li>
          ))
        ) : (
          <li className="muted">{t('detail.noMoves')}</li>
        )}
      </ul>
    </>
  );
}

/** 搜索结果：编号或类型名 */
export function SearchResults(props: {
  found: { asset: Asset; place: string }[];
  onAsset: (id: string) => void;
}) {
  const t = useT();
  return (
    <ul className="results" data-testid="search-results">
      {props.found.length > 0 ? (
        props.found.map(({ asset, place }) => (
          <li key={asset.id}>
            <button
              type="button"
              className="row"
              data-testid="search-result"
              data-asset={asset.id}
              onClick={() => props.onAsset(asset.id)}
            >
              <span className="name">{assetName(asset)}</span>
              <span className="muted">{place}</span>
            </button>
          </li>
        ))
      ) : (
        <li className="muted">{t('search.none')}</li>
      )}
    </ul>
  );
}
