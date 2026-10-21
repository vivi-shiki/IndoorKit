import type { HospitalVenue } from '@indoorkit/hospital';
import type { VenueIndex } from '@indoorkit/plugins';
import { useT } from '../../app-i18n';
import { countText, departmentName, unitLabel } from '../../presentation/format';

/** 可选的统计窗口（分钟） */
export const HEAT_WINDOWS = [1, 5, 15];
export const DEFAULT_WINDOW = 5;

/** 上报最多的区块，附所属科室 */
export function BusyList(props: {
  ctx: { venue: HospitalVenue; index: VenueIndex; departmentOfUnit(unitId: string): string | null };
  rows: [string, number][];
  /** 所选时段内的上报总数；为 0 时才说没有上报 */
  reports: number;
}) {
  const t = useT();
  const { ctx } = props;
  if (props.rows.length === 0 && props.reports === 0) {
    return (
      <p className="muted" data-testid="busy-none">
        {t('busy.none')}
      </p>
    );
  }
  return (
    <ol className="rows" data-testid="busy-list">
      {props.rows.map(([id, n]) => (
        <li key={id} data-testid="busy-row">
          <span className="name">
            {unitLabel(ctx.index, ctx.venue, id)}{' '}
            <span className="muted">{departmentName(ctx.venue, ctx.departmentOfUnit(id))}</span>
          </span>
          <span className="count">{countText(n, 'busy.report', 'busy.reports')}</span>
        </li>
      ))}
    </ol>
  );
}
