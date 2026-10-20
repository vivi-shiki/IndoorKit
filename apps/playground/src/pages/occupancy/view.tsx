import type { HospitalVenue } from '@indoorkit/hospital';
import type { VenueIndex } from '@indoorkit/plugins';
import { useT } from '../../app-i18n';
import { departmentName, unitLabel } from '../../presentation/format';

/** 可选的统计窗口（分钟） */
export const HEAT_WINDOWS = [1, 5, 15];
export const DEFAULT_WINDOW = 5;

/** 上报最多的区块，附所属科室 */
export function BusyList(props: {
  ctx: { venue: HospitalVenue; index: VenueIndex; departmentOfUnit(unitId: string): string | null };
  rows: [string, number][];
}) {
  const t = useT();
  const { ctx } = props;
  return (
    <ol className="rows" data-testid="busy-list">
      {props.rows.map(([id, n]) => (
        <li key={id} data-testid="busy-row">
          <span className="name">
            {unitLabel(ctx.index, ctx.venue, id)}{' '}
            <span className="muted">{departmentName(ctx.venue, ctx.departmentOfUnit(id))}</span>
          </span>
          <span className="count">{t('busy.reports', { value: n })}</span>
        </li>
      ))}
    </ol>
  );
}
