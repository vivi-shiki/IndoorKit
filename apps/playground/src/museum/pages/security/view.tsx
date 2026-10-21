import type { CheckpointResult, MuseumAlarm } from '@indoorkit/museum';
import type { PatrolRound } from '@indoorkit/museum-simulator';
import type { AlarmState } from '../../adapters/alarms';
import type { MuseumContext } from '../../adapters/venue';
import { mt, useMuseumT } from '../../i18n';
import { useRoomName } from '../../map';
import { clockText } from '../../presentation/format';

/** 告警的对象：设备或藏品编号，没有时为房间或展示柜编号 */
export function subjectText(a: MuseumAlarm, ctx: MuseumContext) {
  const { museum } = ctx;
  if (a.objectId) return museum.object(a.objectId).code;
  if (a.deviceId) {
    const device = museum.device(a.deviceId);
    return `${mt(`device.${device.kind}`)} ${device.code}`;
  }
  return museum.isCase(a.unitId) ? museum.case(a.unitId).code : museum.room(a.unitId).code;
}

/** 告警列表的一项：级别、规则、类型、时刻、对象、地点和处理按钮 */
export function AlarmItem(props: {
  alarm: MuseumAlarm;
  subject: string;
  place: string;
  state: AlarmState;
  onAction: (action: 'ack' | 'resolve' | 'locate') => void;
}) {
  const t = useMuseumT();
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

/** 巡逻检查点的核对：计划和实际经过的时刻，迟到和漏巡标红 */
export function CheckpointList(props: {
  ctx: MuseumContext;
  guardId: string;
  status: { round: PatrolRound; results: CheckpointResult[] } | null;
  onSelect: (unitId: string) => void;
}) {
  const t = useMuseumT();
  const roomName = useRoomName(props.ctx);
  const guard = props.ctx.day.guards.find((g) => g.id === props.guardId)!;
  if (!guard.routeCode) return <p className="muted">{t('guard.desk')}</p>;
  if (!props.status) return <p className="muted">{t('patrol.none')}</p>;
  const { round, results } = props.status;
  return (
    <>
      <h2>{t('patrol.round', { start: clockText(round.start) })}</h2>
      <ul className="rows" data-testid="checkpoint-list">
        {results.map((r) => (
          <li key={r.code}>
            <button
              type="button"
              className={`row checkpoint ${r.status}`}
              data-testid="checkpoint-row"
              data-code={r.code}
              data-status={r.status}
              onClick={() => props.onSelect(r.unitId)}
            >
              <span className="name">
                {t('checkpoint.label')} {r.code} · {roomName(r.unitId)}
              </span>
              <span className="count">
                {t('checkpoint.due', { time: clockText(r.due) })}
                {r.passedAt !== null && ` · ${t('checkpoint.passedAt', { time: clockText(r.passedAt) })}`}
                {' · '}
                <span className={`checkpoint-status ${r.status}`}>{t(`checkpoint.${r.status}`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
