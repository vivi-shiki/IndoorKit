import type { DepartmentModel, HospitalLocation, HospitalVenue, Person } from '@indoorkit/hospital';
import type { FloorApi, Sample, VenueIndex } from '@indoorkit/plugins';
import { ROLE_COLORS } from '../../presentation/colors';
import { departmentName, label, personName, placeText, t } from '../../presentation/format';
import { escapeHtml } from '../../presentation/ui';
import { floorName, radioGroup } from '../map-page';

export const TAG_COUNTS = [500, 2000, 5000];
const GROUP_LIMIT = 50;

export interface TrackingViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  /** 一个人最新的位置和所在区块、科室 */
  where(id: string): { sample: Sample; location: HospitalLocation | null } | null;
}

export const controls = (tags: number) => `
  ${radioGroup(
    'tags',
    'control.tags',
    TAG_COUNTS.map((n) => ({ value: String(n), text: n.toLocaleString('en-US') })),
    String(tags),
  )}
  <span class="chips" data-chips="role"></span>
  <span class="hint" data-i18n="hint.replay"></span>`;

export const overlays = `
  <aside class="panel" data-testid="person-panel">
    <input type="search" class="search" data-testid="person-search" data-i18n-placeholder="search.person" />
    <ul class="results" data-testid="search-results"></ul>
    <h2 data-i18n="panel.departments"></h2>
    <div class="groups" data-testid="person-groups"></div>
  </aside>
  <div class="perf" data-testid="perf"></div>
  <section class="drawer" data-testid="person-card" hidden></section>`;

const placeOf = (ctx: TrackingViewContext, w: NonNullable<ReturnType<TrackingViewContext['where']>>) =>
  `${floorName(ctx.floor, w.sample.levelId)} · ${escapeHtml(placeText(ctx.index, ctx.venue, w.location))}`;

/** 选中人员的卡片 */
export function personCard(ctx: TrackingViewContext, person: Person, follow: boolean) {
  const w = ctx.where(person.id);
  const own = w?.location?.departmentId === person.departmentId;
  return `
    <header>
      <h2><span class="dot" style="background:${ROLE_COLORS[person.role]}"></span>${escapeHtml(personName(person))} <span class="muted">${person.id}</span></h2>
      <button type="button" class="close" data-testid="close-card" aria-label="${t('action.close')}">×</button>
    </header>
    <dl>
      <dt>${t('detail.role')}</dt><dd>${t(`role.${person.role}`)}</dd>
      <dt>${t('detail.department')}</dt><dd data-testid="person-department">${escapeHtml(departmentName(ctx.venue, person.departmentId))}</dd>
      <dt>${t('detail.location')}</dt><dd data-testid="person-location">${
        w
          ? `${placeOf(ctx, w)} <span class="tag${own ? '' : ' warn'}">${t(own ? 'place.inOwn' : 'place.outsideOwn')}</span>`
          : '—'
      }</dd>
    </dl>
    <p class="actions">
      <a href="#/trail?tag=${person.id}">${t('action.trail')}</a>
      <button type="button" class="chip" data-testid="follow" aria-pressed="${follow}">${t('action.follow')}</button>
    </p>`;
}

/** 左侧：按科室分组的人员，展开时才列出名单 */
export function personGroups(
  ctx: TrackingViewContext,
  departments: readonly DepartmentModel[],
  byDept: Map<string, Person[]>,
  open: Set<string>,
) {
  return departments
    .filter((d) => byDept.has(d.id))
    .map((d) => {
      const people = byDept.get(d.id)!;
      const outside = people.filter((p) => ctx.where(p.id)?.location?.departmentId !== d.id).length;
      const rows = open.has(d.id)
        ? `<ul class="rows">${people
            .slice(0, GROUP_LIMIT)
            .map(
              (p) => `<li><button type="button" class="row" data-person="${p.id}">
                <span class="name"><span class="dot" style="background:${ROLE_COLORS[p.role]}"></span>${escapeHtml(personName(p))}</span>
                <span class="muted">${placeOf(ctx, ctx.where(p.id)!)}</span>
              </button></li>`,
            )
            .join('')}</ul>`
        : '';
      return `<details data-testid="person-group" data-dept="${d.id}"${open.has(d.id) ? ' open' : ''}>
        <summary><span>${escapeHtml(label(d.name))}</span><span class="count">${people.length}${
          outside ? ` <em title="${t('place.outsideOwn')}">${outside}</em>` : ''
        }</span></summary>${rows}</details>`;
    })
    .join('');
}

/** 搜索结果：姓名（当前语言）或编号 */
export function searchResults(ctx: TrackingViewContext, found: Person[]) {
  return found.length
    ? found
        .map((p) => {
          const w = ctx.where(p.id);
          return `<li><button type="button" class="row" data-testid="search-result" data-person="${p.id}">
            <span class="name">${escapeHtml(personName(p))} <span class="muted">${p.id}</span></span>
            <span class="muted">${w ? placeOf(ctx, w) : ''}</span></button></li>`;
        })
        .join('')
    : `<li class="muted">${t('search.none')}</li>`;
}
