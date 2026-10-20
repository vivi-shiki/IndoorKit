import {
  type Alarm,
  dayTime,
  type HospitalLocation,
  type HospitalVenue,
  type Person,
} from '@indoorkit/hospital';
import type { FloorApi, Stop, VenueIndex } from '@indoorkit/plugins';
import { ROLE_COLORS } from '../../presentation/colors';
import {
  departmentName,
  formatClock,
  formatDuration,
  personName,
  placeText,
  t,
} from '../../presentation/format';
import { escapeHtml } from '../../presentation/ui';
import { floorName, radioGroup } from '../map-page';

export const RANGES = [15, 30, 60];
export const SPEEDS = [1, 4, 16];

export interface TrailViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  locate(levelId: string, coord: [number, number]): HospitalLocation | null;
}

export const controls = `
  <label class="select"><span data-i18n="trail.person"></span>
    <select data-testid="trail-person"></select></label>
  ${radioGroup(
    'range',
    'trail.range',
    RANGES.map((m) => ({ value: String(m), text: `<span data-minutes="${m}"></span>` })),
    '60',
  )}
  ${radioGroup(
    'speed',
    'trail.speed',
    SPEEDS.map((s) => ({ value: String(s), text: `${s}×` })),
    '4',
  )}`;

export const overlays = `
  <aside class="panel" data-testid="trail-panel">
    <p class="muted" data-testid="trail-loading" data-i18n="trail.loading"></p>
    <div data-testid="trail-person-card"></div>
    <h2 data-i18n="trail.stops"></h2>
    <ul class="rows" data-testid="stop-list"></ul>
    <h2 data-i18n="trail.alarms"></h2>
    <ul class="rows" data-testid="trail-alarms"></ul>
  </aside>
  <div class="player">
    <button type="button" class="chip" data-testid="trail-play"></button>
    <input type="range" data-testid="trail-seek" min="0" max="0" step="1000" value="0" />
    <span class="clock" data-testid="trail-clock"></span>
  </div>`;

export const personOptions = (people: readonly Person[], selected: string) =>
  people
    .map(
      (p) =>
        `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${p.id} ${escapeHtml(personName(p))}</option>`,
    )
    .join('');

export const personCard = (ctx: TrailViewContext, person: Person) => `
  <h2><span class="dot" style="background:${ROLE_COLORS[person.role]}"></span>${escapeHtml(personName(person))} <span class="muted">${person.id}</span></h2>
  <p class="muted">${t(`role.${person.role}`)} · ${escapeHtml(departmentName(ctx.venue, person.departmentId))}</p>`;

/** 停留点，不在本科室的标出来 */
export const stopList = (ctx: TrailViewContext, person: Person, stops: readonly Stop[]) =>
  stops
    .map((s, i) => {
      const where = ctx.locate(s.levelId, s.coord);
      const outside = where?.departmentId !== person.departmentId;
      return `<li><button type="button" class="row" data-testid="stop-row" data-stop="${i}">
        <span class="name">${formatClock(dayTime(s.start))} · ${floorName(ctx.floor, s.levelId)} ${escapeHtml(placeText(ctx.index, ctx.venue, where))}${
          outside ? ` <span class="tag warn">${t('place.outsideOwn')}</span>` : ''
        }</span>
        <span class="muted">${formatDuration(s.durationMs)}</span>
      </button></li>`;
    })
    .join('');

/** 途中报警 */
export const alarmList = (ctx: TrailViewContext, alarms: readonly Alarm[]) =>
  alarms.length
    ? alarms
        .map(
          (a) => `<li><button type="button" class="row" data-time="${a.time}">
            <span class="name"><span class="level ${a.level}">${t(`level.${a.level}`)}</span> ${t(`alarm.${a.kind}`)}</span>
            <span class="muted">${formatClock(dayTime(a.time))} · ${floorName(ctx.floor, a.levelId)} ${escapeHtml(placeText(ctx.index, ctx.venue, a.unitId ? { unitId: a.unitId, departmentId: a.departmentId } : null))}</span>
          </button></li>`,
        )
        .join('')
    : `<li class="muted">${t('trail.noAlarms')}</li>`;
