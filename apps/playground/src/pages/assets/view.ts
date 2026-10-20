import type { HospitalVenue } from '@indoorkit/hospital';
import { type Asset, type DepartmentModel, type HospitalLocation, statusSummary } from '@indoorkit/hospital';
import type { FloorApi, VenueIndex } from '@indoorkit/plugins';
import type { TagPosition } from '@indoorkit/rtls';
import { STATUS_COLORS, STATUS_ORDER } from '../../presentation/colors';
import {
  assetName,
  departmentName,
  formatClock,
  formatDuration,
  label,
  placeText,
  t,
  unitLabel,
} from '../../presentation/format';
import { escapeHtml } from '../../presentation/ui';
import { floorName } from '../map-page';

const DAY_MS = 24 * 3600_000;

/** 视图需要的场馆查询；只读，不改地图 */
export interface AssetsViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  departmentOfUnit(unitId: string): string | null;
}

export const controls = `
  <span class="metric"><span data-i18n="metric.assets"></span>: <b data-testid="asset-count">0</b></span>
  <span class="metric"><span data-i18n="metric.outside"></span>: <b data-testid="outside-count">0</b></span>
  <span class="chips" data-chips="status"></span>
  <button type="button" class="chip" data-testid="toggle-departments" aria-pressed="true" data-i18n="control.departments"></button>`;

export const overlays = `
  <aside class="panel" data-testid="asset-panel">
    <input type="search" class="search" data-testid="asset-search" data-i18n-placeholder="search.asset" />
    <ul class="results" data-testid="search-results"></ul>
    <div class="chips" data-chips="type"></div>
    <h2 data-i18n="panel.departments"></h2>
    <ul class="rows" data-testid="dept-list"></ul>
  </aside>
  <section class="drawer" data-testid="unit-drawer" hidden></section>
  <section class="drawer" data-testid="asset-detail" hidden></section>`;

/** 左侧：科室 → 区块；选中的科室展开它有设备的区块 */
export function departmentList(
  ctx: AssetsViewContext,
  departments: readonly DepartmentModel[],
  counts: Map<string, { total: number; abnormal: number }>,
  selected: string | null,
  membersOf: (unitId: string) => number,
) {
  return departments
    .map((d) => {
      const c = counts.get(d.id) ?? { total: 0, abnormal: 0 };
      const pressed = d.id === selected;
      const units = pressed
        ? `<ul class="sub">${d.unitIds
            .map((u) => {
              const n = membersOf(u);
              return n > 0
                ? `<li data-testid="unit-row" data-unit="${u}"><span>${floorName(ctx.floor, ctx.index.unit(u).levelId)} ${escapeHtml(unitLabel(ctx.index, ctx.venue, u))}</span><b>${n}</b></li>`
                : '';
            })
            .join('')}</ul>`
        : '';
      return `<li><button type="button" class="row" data-testid="dept-row" data-dept="${d.id}" aria-pressed="${pressed}">
          <span>${escapeHtml(label(d.name))}</span>
          <span class="count">${c.total}${c.abnormal ? ` <em>${c.abnormal}</em>` : ''}</span>
        </button>${units}</li>`;
    })
    .join('');
}

/** 右侧：一个区块里的设备，按状态从严重到轻微 */
export function unitDrawer(
  ctx: AssetsViewContext,
  unitId: string,
  members: TagPosition[],
  assets: Map<string, Asset>,
  now: number,
) {
  const unit = ctx.index.unit(unitId);
  const unitDepartment = ctx.departmentOfUnit(unit.id);
  const sorted = [...members].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status as never) - STATUS_ORDER.indexOf(b.status as never),
  );
  const abnormal = sorted.filter((p) => p.status === 'offline' || p.status === 'maintenance').length;
  return `
    <header>
      <h2>${floorName(ctx.floor, unit.levelId)} ${escapeHtml(unitLabel(ctx.index, ctx.venue, unit.id))}</h2>
      <button type="button" class="close" data-testid="close-drawer" aria-label="${t('action.close')}">×</button>
    </header>
    <p class="muted">${escapeHtml(departmentName(ctx.venue, unitDepartment))} · ${t('detail.devices', { value: sorted.length })}${
      abnormal ? ` · <em>${t('detail.abnormal', { value: abnormal })}</em>` : ''
    }</p>
    <ul class="rows">${sorted
      .map((p) => {
        const asset = assets.get(p.id)!;
        const summary = statusSummary(asset, now);
        const foreign =
          asset.departmentId !== unitDepartment
            ? `<span class="tag">${escapeHtml(t('place.belongsTo', { value: departmentName(ctx.venue, asset.departmentId) }))}</span>`
            : '';
        return `<li><button type="button" class="row asset" data-testid="asset-row" data-asset="${asset.id}">
          <span class="status" style="--c:${STATUS_COLORS[summary.status]}">${t(`status.${summary.status}`)}</span>
          <span class="name">${escapeHtml(assetName(asset))}${foreign}</span>
          <span class="muted">${formatDuration(now - summary.since)} · ${t('detail.runToday')} ${formatDuration(summary.runMs)} · ${asset.battery}%</span>
        </button></li>`;
      })
      .join('')}</ul>`;
}

/** 当天到此刻为止的状态色条 */
function timeline(asset: Asset, now: number) {
  const end = now % DAY_MS;
  return asset.schedule
    .filter((s) => s.from < end)
    .map((s) => {
      const width = ((Math.min(s.to, end) - s.from) / end) * 100;
      return `<span data-status="${s.status}" style="width:${width}%;background:${STATUS_COLORS[s.status]}" title="${formatClock(s.from)} ${t(`status.${s.status}`)}"></span>`;
    })
    .join('');
}

/** 右侧：一台设备的详情 */
export function assetDetail(
  ctx: AssetsViewContext,
  asset: Asset,
  position: TagPosition | undefined,
  where: HospitalLocation | null,
  now: number,
  moves: string[],
) {
  const summary = statusSummary(asset, now);
  const outside = position !== undefined && where?.departmentId !== asset.departmentId;
  return `
    <header>
      <h2>${escapeHtml(assetName(asset))}</h2>
      <button type="button" class="close" data-testid="close-detail" aria-label="${t('action.close')}">×</button>
    </header>
    <dl>
      <dt>${t('detail.department')}</dt><dd data-testid="asset-department">${escapeHtml(departmentName(ctx.venue, asset.departmentId))}</dd>
      <dt>${t('detail.location')}</dt><dd>${position ? `${floorName(ctx.floor, position.levelId)} · ` : ''}${escapeHtml(placeText(ctx.index, ctx.venue, where))}${
        outside ? ` <span class="tag warn">${t('place.outsideOwn')}</span>` : ''
      }</dd>
      <dt>${t('detail.status')}</dt><dd data-testid="asset-status"><span class="status" style="--c:${STATUS_COLORS[summary.status]}">${t(`status.${summary.status}`)}</span> ${t('detail.since', { value: formatDuration(now - summary.since) })}</dd>
      <dt>${t('detail.runToday')}</dt><dd data-testid="asset-run-today">${formatDuration(summary.runMs)}</dd>
      <dt>${t('detail.battery')}</dt><dd>${asset.battery}%</dd>
    </dl>
    <h3>${t('detail.timeline')} <span class="muted">00:00 – ${formatClock(now)}</span></h3>
    <div class="timeline" data-testid="status-timeline">${timeline(asset, now)}</div>
    <h3>${t('detail.moves')}</h3>
    <ul class="moves">${moves.length ? moves.map((m) => `<li>${m}</li>`).join('') : `<li class="muted">${t('detail.noMoves')}</li>`}</ul>`;
}

/** 搜索结果：编号或类型名 */
export function searchResults(found: { asset: Asset; place: string }[]) {
  return found.length
    ? found
        .map(
          ({
            asset,
            place,
          }) => `<li><button type="button" class="row" data-testid="search-result" data-asset="${asset.id}">
            <span class="name">${escapeHtml(assetName(asset))}</span><span class="muted">${escapeHtml(place)}</span></button></li>`,
        )
        .join('')
    : `<li class="muted">${t('search.none')}</li>`;
}
