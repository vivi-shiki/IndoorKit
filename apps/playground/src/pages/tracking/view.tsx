import type { DepartmentModel, HospitalLocation, HospitalVenue, Person } from '@indoorkit/hospital';
import type { FloorApi, Sample, VenueIndex } from '@indoorkit/plugins';
import { hospitalHref } from '../../app/routes';
import { useT } from '../../app-i18n';
import { ROLE_COLORS } from '../../presentation/colors';
import { departmentName, label, personName, placeText } from '../../presentation/format';
import { floorName } from '../map-page';

export const TAG_COUNTS = [500, 2000, 5000];
const GROUP_LIMIT = 50;

export interface TrackingViewContext {
  venue: HospitalVenue;
  index: VenueIndex;
  floor: FloorApi;
  /** 一个人最新的位置和所在区块、科室 */
  where(id: string): { sample: Sample; location: HospitalLocation | null } | null;
}

type Where = NonNullable<ReturnType<TrackingViewContext['where']>>;
const placeOf = (ctx: TrackingViewContext, w: Where) =>
  `${floorName(ctx.floor, w.sample.levelId)} · ${placeText(ctx.index, ctx.venue, w.location)}`;

const Dot = ({ person }: { person: Person }) => (
  <span className="dot" style={{ background: ROLE_COLORS[person.role] }} />
);

/** 选中人员的卡片 */
export function PersonCard(props: {
  ctx: TrackingViewContext;
  person: Person;
  follow: boolean;
  onClose: () => void;
  onFollow: () => void;
}) {
  const t = useT();
  const { ctx, person } = props;
  const w = ctx.where(person.id);
  const own = w?.location?.departmentId === person.departmentId;
  return (
    <>
      <header>
        <h2>
          <Dot person={person} />
          {personName(person)} <span className="muted">{person.id}</span>
        </h2>
        <button
          type="button"
          className="close"
          data-testid="close-card"
          aria-label={t('action.close')}
          onClick={props.onClose}
        >
          ×
        </button>
      </header>
      <dl>
        <dt>{t('detail.role')}</dt>
        <dd>{t(`role.${person.role}`)}</dd>
        <dt>{t('detail.department')}</dt>
        <dd data-testid="person-department">{departmentName(ctx.venue, person.departmentId)}</dd>
        <dt>{t('detail.location')}</dt>
        <dd data-testid="person-location">
          {w ? (
            <>
              {placeOf(ctx, w)}{' '}
              <span className={own ? 'tag' : 'tag warn'}>{t(own ? 'place.inOwn' : 'place.outsideOwn')}</span>
            </>
          ) : (
            '—'
          )}
        </dd>
      </dl>
      <p className="actions">
        <a href={hospitalHref('trail', `tag=${person.id}`)}>{t('action.trail')}</a>
        <button
          type="button"
          className="chip"
          data-testid="follow"
          aria-pressed={props.follow}
          onClick={props.onFollow}
        >
          {t(props.follow ? 'action.unfollow' : 'action.follow')}
        </button>
      </p>
    </>
  );
}

/** 左侧：按科室分组的人员，展开时才列出名单 */
export function PersonGroups(props: {
  ctx: TrackingViewContext;
  departments: readonly DepartmentModel[];
  byDept: Map<string, Person[]>;
  open: ReadonlySet<string>;
  onToggle: (id: string, open: boolean) => void;
  onPerson: (id: string) => void;
}) {
  const t = useT();
  const { ctx } = props;
  return (
    <div className="groups" data-testid="person-groups">
      {props.departments
        .filter((d) => props.byDept.has(d.id))
        .map((d) => {
          const people = props.byDept.get(d.id)!;
          const outside = people.filter((p) => ctx.where(p.id)?.location?.departmentId !== d.id).length;
          const open = props.open.has(d.id);
          return (
            <details
              key={d.id}
              data-testid="person-group"
              data-dept={d.id}
              open={open}
              onToggle={(e) => {
                if (e.currentTarget.open !== open) props.onToggle(d.id, e.currentTarget.open);
              }}
            >
              <summary>
                <span>{label(d.name)}</span>
                <span className="count">
                  {people.length}
                  {outside > 0 && (
                    <>
                      {' '}
                      <em title={t('place.outsideOwn')}>{outside}</em>
                    </>
                  )}
                </span>
              </summary>
              {open && (
                <ul className="rows">
                  {people.slice(0, GROUP_LIMIT).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="row"
                        data-person={p.id}
                        onClick={() => props.onPerson(p.id)}
                      >
                        <span className="name">
                          <Dot person={p} />
                          {personName(p)}
                        </span>
                        <span className="muted">{placeOf(ctx, ctx.where(p.id)!)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
    </div>
  );
}

/** 搜索结果：姓名（当前语言）或编号 */
export function SearchResults(props: {
  ctx: TrackingViewContext;
  found: Person[];
  onPerson: (id: string) => void;
}) {
  const t = useT();
  return (
    <ul className="results" data-testid="search-results">
      {props.found.length > 0 ? (
        props.found.map((p) => {
          const w = props.ctx.where(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                className="row"
                data-testid="search-result"
                data-person={p.id}
                onClick={() => props.onPerson(p.id)}
              >
                <span className="name">
                  {personName(p)} <span className="muted">{p.id}</span>
                </span>
                <span className="muted">{w ? placeOf(props.ctx, w) : ''}</span>
              </button>
            </li>
          );
        })
      ) : (
        <li className="muted">{t('search.none')}</li>
      )}
    </ul>
  );
}
