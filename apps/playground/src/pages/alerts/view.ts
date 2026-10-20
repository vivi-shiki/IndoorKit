import { type Alarm, dayTime } from '@indoorkit/hospital';
import { formatClock, t } from '../../presentation/format';
import { escapeHtml } from '../../presentation/ui';

export type AlarmState = 'open' | 'acknowledged' | 'resolved';

export const controls = `
  <span class="metric"><span data-i18n="metric.alerts"></span>: <b data-testid="alert-count">0</b></span>
  <span class="metric"><span data-i18n="metric.unhandled"></span>: <b data-testid="unhandled-count">0</b></span>
  <span class="chips" data-chips="layer"></span>`;

export const overlays = `
  <aside class="panel alarm-panel">
    <ul class="alarm-feed" data-testid="alert-list"></ul>
  </aside>`;

/** 告警列表的一项：级别、类型、对象、地点和处理按钮 */
export function alarmItem(
  a: Alarm,
  text: { floor: string; kind: string; subject: string; place: string },
  state: AlarmState,
) {
  return `<li data-testid="alarm-item" data-alarm="${a.id}" data-layer="${a.layer}" data-floor="${text.floor}" class="${state}">
    <div class="line">
      <span class="level ${a.level}">${t(`level.${a.level}`)}</span>
      <strong>${escapeHtml(text.kind)}</strong>
      <span class="tag" data-testid="alarm-layer">${t(`layer.${a.layer}`)}</span>
      <span class="muted">${formatClock(dayTime(a.time), true)}</span>
    </div>
    <button type="button" class="link" data-testid="alarm-subject">${escapeHtml(text.subject)}</button>
    <div class="muted">${escapeHtml(text.place)}</div>
    <div class="line">
      <span class="state">${t(`state.${state}`)}</span>
      ${state === 'open' ? `<button type="button" class="chip" data-action="ack">${t('action.ack')}</button>` : ''}
      ${state !== 'resolved' ? `<button type="button" class="chip" data-action="resolve">${t('action.resolve')}</button>` : ''}
    </div>
  </li>`;
}
