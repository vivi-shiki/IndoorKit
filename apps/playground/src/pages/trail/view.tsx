import {
  type Alarm,
  dayTime,
  type HospitalLocation,
  type HospitalVenue,
  type Person,
} from '@indoorkit/hospital';
import type { FloorApi, Stop, VenueIndex } from '@indoorkit/plugins';
import { useT } from '../../app-i18n';
import { ROLE_COLORS } from '../../presentation/colors';
import {
  departmentName,
  formatClock,
  formatDuration,
  personName,
  placeText,
} from '../../presentation/format';
import { floorName } from '../map-page';

export const RANGES = [15, 30, 60];
export const SPEEDS = [1, 4, 16];

export interface TrailViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  locate(levelId: string, coord: [number, number]): HospitalLocation | null;
}

export function PersonSelect(props: {
  people: readonly Person[];
  selected: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  return (
    <label className="select">
      <span>{t('trail.person')}</span>
      <select
        data-testid="trail-person"
        value={props.selected}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id} {personName(p)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PersonCard({ ctx, person }: { ctx: TrailViewContext; person: Person }) {
  const t = useT();
  return (
    <div data-testid="trail-person-card">
      <h2>
        <span className="dot" style={{ background: ROLE_COLORS[person.role] }} />
        {personName(person)} <span className="muted">{person.id}</span>
      </h2>
      <p className="muted">
        {t(`role.${person.role}`)} · {departmentName(ctx.venue, person.departmentId)}
      </p>
    </div>
  );
}

/** 停留点，不在本科室的标出来 */
export function StopList(props: {
  ctx: TrailViewContext;
  person: Person;
  stops: readonly Stop[];
  onStop: (stop: Stop) => void;
}) {
  const t = useT();
  const { ctx } = props;
  return (
    <ul className="rows" data-testid="stop-list">
      {props.stops.map((s) => {
        const where = ctx.locate(s.levelId, s.coord);
        const outside = where?.departmentId !== props.person.departmentId;
        return (
          <li key={s.start}>
            <button type="button" className="row" data-testid="stop-row" onClick={() => props.onStop(s)}>
              <span className="name">
                {formatClock(dayTime(s.start))} · {floorName(ctx.floor, s.levelId)}{' '}
                {placeText(ctx.index, ctx.venue, where)}
                {outside && <span className="tag warn">{t('place.outsideOwn')}</span>}
              </span>
              <span className="muted">{formatDuration(s.durationMs)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** 途中报警 */
export function AlarmList(props: {
  ctx: TrailViewContext;
  alarms: readonly Alarm[];
  onAlarm: (a: Alarm) => void;
}) {
  const t = useT();
  const { ctx } = props;
  return (
    <ul className="rows" data-testid="trail-alarms">
      {props.alarms.length > 0 ? (
        props.alarms.map((a) => (
          <li key={a.id}>
            <button type="button" className="row" data-time={a.time} onClick={() => props.onAlarm(a)}>
              <span className="name">
                <span className={`level ${a.level}`}>{t(`level.${a.level}`)}</span> {t(`alarm.${a.kind}`)}
              </span>
              <span className="muted">
                {formatClock(dayTime(a.time))} · {floorName(ctx.floor, a.levelId)}{' '}
                {placeText(
                  ctx.index,
                  ctx.venue,
                  a.unitId ? { unitId: a.unitId, departmentId: a.departmentId } : null,
                )}
              </span>
            </button>
          </li>
        ))
      ) : (
        <li className="muted">{t('trail.noAlarms')}</li>
      )}
    </ul>
  );
}
