import type { CrowdState } from '../../adapters/live';
import type { MuseumContext } from '../../adapters/venue';
import { useMuseumT } from '../../i18n';
import { useRoomName } from '../../map';
import { durationText, percent } from '../../presentation/format';

/** 热力图的时间窗口（分钟） */
export const HEAT_WINDOWS = [15, 30, 60] as const;
/** 停留时长排行显示前几名 */
const TOP = 10;
/** 可以回放的来馆者显示几位 */
const REPLAYABLE = 8;

/** 有定员的房间按「人数 / 定员」从高到低 */
export function CrowdList(props: {
  ctx: MuseumContext;
  states: ReadonlyMap<string, CrowdState>;
  time: number;
}) {
  const t = useMuseumT();
  const roomName = useRoomName(props.ctx);
  const { museum, day } = props.ctx;
  const rows = museum.rooms
    .filter((r) => r.capacity !== null)
    .map((r) => ({ room: r, count: day.occupancy(r.unitId, props.time) }))
    .sort((a, b) => b.count / b.room.capacity! - a.count / a.room.capacity!);
  return (
    <>
      <h2>{t('crowd.title')}</h2>
      <ul className="rows" data-testid="crowd-list">
        {rows.map(({ room, count }) => {
          const state = props.states.get(room.unitId)!;
          return (
            <li
              key={room.unitId}
              className="row static"
              data-testid="crowd-row"
              data-code={room.code}
              data-state={state}
            >
              <span className="name">{roomName(room.unitId)}</span>
              <span className="count">
                {t('crowd.count', { count, capacity: room.capacity! })} · {percent(count / room.capacity!)}
                {state !== 'calm' && (
                  <>
                    {' · '}
                    <em>{t(`crowd.${state}`)}</em>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** 展品前的平均停留时长排行（带标签的来馆者），点一行在地图上高亮展示柜 */
export function DwellList(props: { ctx: MuseumContext; time: number; onSelect: (caseId: string) => void }) {
  const t = useMuseumT();
  const roomName = useRoomName(props.ctx);
  const { museum, day } = props.ctx;
  const rows = [...day.dwellByCase(props.time)]
    .filter(([, d]) => d.count >= 3)
    .sort((a, b) => b[1].averageMs - a[1].averageMs)
    .slice(0, TOP);
  return (
    <>
      <h2>{t('dwell.title')}</h2>
      <ol className="rows" data-testid="dwell-list">
        {rows.map(([caseId, d]) => (
          <li key={caseId}>
            <button
              type="button"
              className="row"
              data-testid="dwell-row"
              onClick={() => props.onSelect(caseId)}
            >
              <span className="name">
                {museum.case(caseId).code} · {roomName(caseId)}
              </span>
              <span className="count">
                {t('dwell.label')} {durationText(d.averageMs)} · {t('dwell.count', { count: d.count })}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** 现在馆内、带标签的来馆者，点一位回放今天的参观路线和停留点 */
export function VisitorList(props: {
  ctx: MuseumContext;
  time: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useMuseumT();
  const { day } = props.ctx;
  const inside = day.visitors
    .filter((v) => v.tagged && v.enteredAt <= props.time && props.time < v.exitedAt)
    .slice(0, REPLAYABLE);
  return (
    <>
      <h2>{t('trail.title')}</h2>
      <p className="muted">{t('trail.hint')}</p>
      <ul className="rows" data-testid="visitor-list">
        {inside.length === 0 && <li className="muted">{t('trail.none')}</li>}
        {inside.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className="row"
              data-testid="visitor-row"
              aria-pressed={props.selected === v.id}
              onClick={() => props.onSelect(props.selected === v.id ? null : v.id)}
            >
              <span className="name">{t('trail.visitor', { id: v.id })}</span>
              <span className="count">{durationText(props.time - v.enteredAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
