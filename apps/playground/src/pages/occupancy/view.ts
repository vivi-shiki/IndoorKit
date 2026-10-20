import type { HospitalVenue } from '@indoorkit/hospital';
import type { VenueIndex } from '@indoorkit/plugins';
import { departmentName, t, unitLabel } from '../../presentation/format';
import { escapeHtml } from '../../presentation/ui';
import { radioGroup } from '../map-page';

/** 可选的统计窗口（分钟） */
export const HEAT_WINDOWS = [1, 5, 15];
export const DEFAULT_WINDOW = 5;

export const controls = `
  ${radioGroup(
    'window',
    'control.window',
    HEAT_WINDOWS.map((m) => ({ value: String(m), text: `<span data-minutes="${m}"></span>` })),
    String(DEFAULT_WINDOW),
  )}
  <span class="metric"><span data-i18n="metric.heatPoints"></span>: <b data-testid="heat-points">0</b></span>
  <span class="chips" data-chips="role"></span>`;

export const overlays = `
  <aside class="panel">
    <h2 data-i18n="busy.title"></h2>
    <ol class="rows" data-testid="busy-list"></ol>
  </aside>`;

/** 上报最多的区块，附所属科室 */
export const busyList = (
  ctx: { venue: HospitalVenue; index: VenueIndex; departmentOfUnit(unitId: string): string | null },
  rows: [string, number][],
) =>
  rows
    .map(
      ([id, n]) =>
        `<li data-testid="busy-row"><span class="name">${escapeHtml(unitLabel(ctx.index, ctx.venue, id))} <span class="muted">${escapeHtml(
          departmentName(ctx.venue, ctx.departmentOfUnit(id)),
        )}</span></span><span class="count">${t('busy.reports', { value: n })}</span></li>`,
    )
    .join('');
