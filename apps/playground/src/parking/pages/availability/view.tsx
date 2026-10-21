import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import { feeFor, type Parking, type Zone } from '@indoorkit/parking';
import { useLocale } from '../../../app-i18n';
import type { BayState } from '../../adapters/live';
import type { LiveSnapshot } from '../../adapters/venue';
import { useParkingT } from '../../i18n';
import { clockText, durationText, plateText, yen } from '../../presentation/format';

/** 区的显示名：1F · A 区 */
export const zoneName = (zone: Zone, levelShort: string, locale: string) =>
  `${levelShort} · ${pickLabel(zone.name, languageFallbacks(locale)) ?? zone.code}`;

/** 左侧列表：各区的空闲数和需要处理的车位数，点一行高亮这个区 */
export function ZoneList(props: {
  parking: Parking;
  live: LiveSnapshot;
  levelShort: (levelId: string) => string;
  selected: string | null;
  onSelect: (zoneId: string | null) => void;
}) {
  const t = useParkingT();
  const locale = useLocale();
  const { parking, live } = props;
  return (
    <ul className="rows" data-testid="zone-list">
      {parking.zones.map((zone) => {
        const states = zone.bayIds.map((id) => live.states.get(id));
        const free = states.filter((s) => s === 'free').length;
        const alerts = states.filter((s) => s === 'alert').length;
        return (
          <li key={zone.id}>
            <button
              type="button"
              className="row"
              data-testid="zone-row"
              aria-pressed={props.selected === zone.id}
              onClick={() => props.onSelect(props.selected === zone.id ? null : zone.id)}
            >
              <span className="name">{zoneName(zone, props.levelShort(zone.levelId), locale)}</span>
              <span className="count">
                {t('zone.free', { free, total: zone.bayIds.length })}
                {alerts > 0 && (
                  <>
                    {' · '}
                    <em>{t('zone.alerts', { count: alerts })}</em>
                  </>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 点车位后的抽屉：状态、类型、检测设备，有车时显示车牌、入场时间和当前费用 */
export function BayDrawer(props: {
  parking: Parking;
  bayId: string;
  live: LiveSnapshot;
  levelShort: string;
  platesShown: boolean;
  reservation: { id: string; from: number; to: number } | null;
  onClose: () => void;
}) {
  const t = useParkingT();
  const locale = useLocale();
  const { parking, live } = props;
  const bay = parking.bay(props.bayId);
  const state = live.states.get(bay.id) as BayState;
  const parked = live.parkedByBay.get(bay.id);
  const detectors = parking
    .devicesOfBay(bay.id)
    .filter((d) => d.kind === 'bay-sensor' || d.kind === 'ai-camera')
    .map((d) => `${t(`device.${d.kind}`)} ${d.code}`);
  const fee =
    parked && parked.vehicle.contract.kind !== 'monthly' ? feeFor(parked.enteredAt, live.time) : null;
  return (
    <aside className="drawer" data-testid="bay-drawer">
      <header>
        <h2>{t('bay.title', { code: bay.code })}</h2>
        <button type="button" className="close" aria-label={t('action.close')} onClick={props.onClose}>
          ×
        </button>
      </header>
      <dl>
        <dt>{t('bay.state')}</dt>
        <dd>{t(`bayState.${state}`)}</dd>
        <dt>{t('bay.type')}</dt>
        <dd>{t(`bayType.${bay.type}`)}</dd>
        <dt>{t('bay.zone')}</dt>
        <dd>{zoneName(parking.zone(bay.zoneId), props.levelShort, locale)}</dd>
        <dt>{t('bay.detection')}</dt>
        <dd>{detectors.join('、')}</dd>
        {props.reservation && (
          <>
            <dt>{t('contract.reservation')}</dt>
            <dd>
              {t('bay.reservation', {
                id: props.reservation.id,
                from: clockText(props.reservation.from),
                to: clockText(props.reservation.to),
              })}
            </dd>
          </>
        )}
        {parked ? (
          <>
            <dt>{t('bay.plate')}</dt>
            <dd data-testid="bay-plate">{plateText(parked.vehicle.plate, props.platesShown)}</dd>
            <dt>{t('bay.contract')}</dt>
            <dd>{t(`contract.${parked.vehicle.contract.kind}`)}</dd>
            <dt>{t('bay.entered')}</dt>
            <dd>{clockText(parked.enteredAt)}</dd>
            <dt>{t('bay.duration')}</dt>
            <dd>{durationText(live.time - parked.parkedAt)}</dd>
            {fee && (
              <>
                <dt>{t('bay.fee')}</dt>
                <dd>{yen(fee.total)}</dd>
              </>
            )}
          </>
        ) : (
          <>
            <dt>{t('bay.plate')}</dt>
            <dd>{t('bay.empty')}</dd>
          </>
        )}
      </dl>
    </aside>
  );
}
