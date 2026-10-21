import { type Fee, feeFor, type Parking } from '@indoorkit/parking';
import type { ParkingEvent, Visit } from '@indoorkit/parking-simulator';
import { useParkingT } from '../../i18n';
import { clockText, durationText, plateText, yen } from '../../presentation/format';

/** 识别记录的一项：时刻、事件、车牌、车位或出入口；未缴费出场标红 */
export function EventItem(props: {
  event: ParkingEvent;
  parking: Parking;
  platesShown: boolean;
  onSelect: () => void;
}) {
  const t = useParkingT();
  const { event: e, parking } = props;
  const unpaid = e.kind === 'exit' && e.paid === false;
  return (
    <li data-testid="event-item" data-kind={e.kind} className={unpaid ? 'warn' : e.kind}>
      <span className="clock">{clockText(e.time)}</span>
      <span className={`event-kind ${e.kind}`}>{t(`event.${e.kind}`)}</span>
      <button type="button" className="link" onClick={props.onSelect}>
        {plateText(e.plate, props.platesShown)}
      </button>
      <span className="muted">
        {e.kind === 'entry' || e.kind === 'exit'
          ? parking.device(e.deviceId).code
          : parking.bay(e.bayId).code}
      </span>
      {unpaid && <em>{t('rule.unpaid-exit')}</em>}
    </li>
  );
}

const visitState = (v: Visit, t: number) =>
  t >= v.exitedAt ? 'exited' : t >= v.parkedAt && t < v.leftAt ? 'parked' : 'driving';

/** 车辆卡片：状态、车位、入场时间、停车时长、支付方式和按时段拆分的费用 */
export function VehicleCard(props: {
  visit: Visit;
  parking: Parking;
  now: number;
  platesShown: boolean;
  onClose: () => void;
}) {
  const t = useParkingT();
  const { visit: v, now } = props;
  const bay = props.parking.bay(v.bayId);
  const end = Math.min(now, v.exitedAt);
  const fee: Fee | null = v.payment === 'contract' ? null : feeFor(v.enteredAt, end);
  const state = visitState(v, now);
  const paid = state === 'exited' ? v.paid : false;
  return (
    <aside className="drawer" data-testid="vehicle-card">
      <header>
        <h2>{plateText(v.vehicle.plate, props.platesShown)}</h2>
        <button type="button" className="close" aria-label={t('action.close')} onClick={props.onClose}>
          ×
        </button>
      </header>
      <dl>
        <dt>{t('bay.state')}</dt>
        <dd>{t(`vehicle.state.${state}`)}</dd>
        <dt>{t('result.bay')}</dt>
        <dd>{bay.code}</dd>
        <dt>{t('bay.contract')}</dt>
        <dd>{t(`contract.${v.vehicle.contract.kind}`)}</dd>
        <dt>{t('bay.entered')}</dt>
        <dd>{clockText(v.enteredAt)}</dd>
        <dt>{t('bay.duration')}</dt>
        <dd>{durationText(end - v.enteredAt)}</dd>
        <dt>{t('vehicle.payment')}</dt>
        <dd>{t(`payment.${v.payment}`)}</dd>
      </dl>
      {fee && (
        <>
          <ul className="fee-lines">
            {fee.lines.map((line) => (
              <li key={line.from} data-testid="fee-line">
                <span>
                  {clockText(line.from)}–{clockText(line.to)} {t(`fee.${line.kind}`)}
                </span>
                <span>{yen(line.amount)}</span>
              </li>
            ))}
            {fee.capped > 0 && (
              <li>
                <span>{t('fee.capped', { amount: fee.capped.toLocaleString('en-US') })}</span>
              </li>
            )}
          </ul>
          <p className="fee-total">
            {t('fee.total')} <b data-testid="fee-total">{yen(fee.total)}</b>{' '}
            <span className={paid ? 'tag' : 'tag warn'}>{t(paid ? 'fee.paid' : 'fee.unpaid')}</span>
          </p>
        </>
      )}
    </aside>
  );
}
