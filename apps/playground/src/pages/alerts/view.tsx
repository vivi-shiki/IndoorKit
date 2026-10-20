import { type Alarm, dayTime } from '@indoorkit/hospital';
import { useT } from '../../app-i18n';
import { formatClock } from '../../presentation/format';

export type AlarmState = 'open' | 'acknowledged' | 'resolved';

/** 告警列表的一项：级别、类型、对象、地点和处理按钮 */
export function AlarmItem(props: {
  alarm: Alarm;
  text: { floor: string; kind: string; subject: string; place: string };
  state: AlarmState;
  onAction: (action: 'ack' | 'resolve' | 'locate') => void;
}) {
  const t = useT();
  const { alarm: a, text, state } = props;
  return (
    <li
      data-testid="alarm-item"
      data-alarm={a.id}
      data-layer={a.layer}
      data-floor={text.floor}
      className={state}
    >
      <div className="line">
        <span className={`level ${a.level}`}>{t(`level.${a.level}`)}</span>
        <strong>{text.kind}</strong>
        <span className="tag" data-testid="alarm-layer">
          {t(`layer.${a.layer}`)}
        </span>
        <span className="muted">{formatClock(dayTime(a.time), true)}</span>
      </div>
      <button
        type="button"
        className="link"
        data-testid="alarm-subject"
        onClick={() => props.onAction('locate')}
      >
        {text.subject}
      </button>
      <div className="muted">{text.place}</div>
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
