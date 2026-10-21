import type { Parking, ParkingAlarm } from '@indoorkit/parking';
import type { AlarmState } from '../../adapters/alarms';
import { useParkingT } from '../../i18n';
import { clockText, plateText } from '../../presentation/format';

/** 告警的对象：车牌（打码）或设备编号 */
export function subjectText(a: ParkingAlarm, parking: Parking, platesShown: boolean) {
  if (a.plate) return plateText(a.plate, platesShown);
  if (a.deviceId) return parking.device(a.deviceId).code;
  return a.bayId ? parking.bay(a.bayId).code : '';
}

/** 告警列表的一项：级别、规则、类型、时刻、对象、地点和处理按钮 */
export function AlarmItem(props: {
  alarm: ParkingAlarm;
  subject: string;
  place: string;
  state: AlarmState;
  onAction: (action: 'ack' | 'resolve' | 'locate') => void;
}) {
  const t = useParkingT();
  const { alarm: a, state } = props;
  return (
    <li data-testid="alarm-item" data-alarm={a.id} data-tier={a.tier} data-rule={a.rule} className={state}>
      <div className="line">
        <span className={`level ${a.level}`}>{t(`level.${a.level}`)}</span>
        <strong>{t(`rule.${a.rule}`)}</strong>
        <span className="tag" data-testid="alarm-tier">
          {t(`tier.${a.tier}`)}
        </span>
        <span className="muted">{clockText(a.time)}</span>
      </div>
      <button
        type="button"
        className="link"
        data-testid="alarm-subject"
        onClick={() => props.onAction('locate')}
      >
        {props.subject}
      </button>
      <div className="muted">{props.place}</div>
      <div className="line">
        <span className="state">{t(`state.${state}`)}</span>
        {state === 'open' && (
          <button type="button" className="chip" onClick={() => props.onAction('ack')}>
            {t('action.ack')}
          </button>
        )}
        {state !== 'resolved' && (
          <button type="button" className="chip" onClick={() => props.onAction('resolve')}>
            {t('action.resolve')}
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * 识别快照：真实系统在这里回放相机录像，演示用一张示意图代替——
 * 车位、车辆轮廓和识别出的车牌（或设备）。
 */
export function Snapshot(props: { label: string; subject: string; vehicle: boolean }) {
  return (
    <svg className="snapshot" viewBox="0 0 240 140" role="img" aria-label={props.label}>
      <rect x="0" y="0" width="240" height="140" rx="6" className="snapshot-bg" />
      <rect x="60" y="14" width="120" height="112" className="snapshot-bay" />
      {props.vehicle && <rect x="78" y="30" width="84" height="80" rx="14" className="snapshot-car" />}
      <rect x="70" y="92" width="100" height="26" rx="3" className="snapshot-plate" />
      <text x="120" y="110" textAnchor="middle" className="snapshot-text">
        {props.subject}
      </text>
    </svg>
  );
}

/** 点告警后的详情：快照示意图、规则、时刻和地点 */
export function AlarmDetail(props: {
  alarm: ParkingAlarm;
  subject: string;
  place: string;
  onClose: () => void;
}) {
  const t = useParkingT();
  const { alarm: a } = props;
  return (
    <aside className="drawer" data-testid="alarm-detail">
      <header>
        <h2>{t(`rule.${a.rule}`)}</h2>
        <button type="button" className="close" aria-label={t('action.close')} onClick={props.onClose}>
          ×
        </button>
      </header>
      <h3>{t('alarm.snapshot')}</h3>
      <Snapshot label={t('alarm.snapshot')} subject={props.subject} vehicle={a.plate !== null} />
      <p className="muted">{t('alarm.snapshotNote')}</p>
      <dl>
        <dt>{t('alarm.time')}</dt>
        <dd>{clockText(a.time)}</dd>
        <dt>{t('alarm.place')}</dt>
        <dd>{props.place}</dd>
      </dl>
    </aside>
  );
}
