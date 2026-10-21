import type { ParkingSummary } from '@indoorkit/parking';
import { useParkingT } from '../../i18n';
import { clockText, yen } from '../../presentation/format';

/** 指标卡 */
export function Kpi(props: { label: string; value: string; testId: string }) {
  return (
    <div className="kpi">
      <span className="muted">{props.label}</span>
      <b data-testid={props.testId}>{props.value}</b>
    </div>
  );
}

const W = 260;
const H = 110;
const PAD = { left: 28, right: 8, top: 8, bottom: 20 };

/** 每小时在场车辆数的折线图 */
export function HourlyChart(props: { hourly: ParkingSummary['hourly'] }) {
  const t = useParkingT();
  const { hourly } = props;
  const max = Math.max(1, ...hourly.map((h) => h.count));
  const x = (i: number) => PAD.left + (i / Math.max(1, hourly.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const d = hourly
    .map((h, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(h.count).toFixed(1)}`)
    .join(' ');
  const first = hourly[0];
  const last = hourly.at(-1);
  return (
    <figure className="chart">
      <figcaption>{t('chart.hourly')}</figcaption>
      <svg data-testid="hourly-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('chart.hourly')}>
        <line className="axis" x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom} />
        <text className="tick" x={PAD.left - 4} y={PAD.top + 4} textAnchor="end">
          {max}
        </text>
        <text className="tick" x={PAD.left - 4} y={H - PAD.bottom} textAnchor="end">
          0
        </text>
        {first && (
          <text className="tick" x={PAD.left} y={H - 4}>
            {clockText(first.time)}
          </text>
        )}
        {last && hourly.length > 1 && (
          <text className="tick" x={W - PAD.right} y={H - 4} textAnchor="end">
            {clockText(last.time)}
          </text>
        )}
        {hourly.length > 0 && <path className="line" d={d} />}
      </svg>
    </figure>
  );
}

/** 各区收入的横向柱状图，从高到低 */
export function ZoneRevenue(props: { rows: { label: string; value: number }[] }) {
  const t = useParkingT();
  const max = Math.max(1, ...props.rows.map((r) => r.value));
  return (
    <figure className="chart">
      <figcaption>{t('chart.revenue')}</figcaption>
      <ul className="bars">
        {props.rows.map((r) => (
          <li key={r.label} data-testid="zone-bar">
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
            <span className="bar-value">{yen(r.value)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
