export interface ChartLine {
  /** 图例文字 */
  label: string;
  /** 线的样式类：line-a 实线、line-b 虚线 */
  kind: 'line-a' | 'line-b';
  points: readonly { time: number; value: number }[];
}

/** 坐标轴上只写时刻，不写「昨天」 */
const hourText = (t: number) => {
  const minutes = ((Math.round(t / 60_000) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

const W = 300;
const H = 140;
const PAD = { left: 34, right: 8, top: 8, bottom: 20 };

/**
 * 24 小时曲线：一两条读数线，阈值范围用浅色带表示。
 * 只有几百个点，直接画 SVG，不引入图表库。
 */
export function LineChart(props: {
  label: string;
  from: number;
  to: number;
  lines: readonly ChartLine[];
  /** 标准范围；只有上限时 min 为 null */
  band: { min: number | null; max: number } | null;
}) {
  const values = props.lines.flatMap((l) => l.points.map((p) => p.value));
  if (props.band) {
    values.push(props.band.max);
    if (props.band.min !== null) values.push(props.band.min);
  }
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const span = hi - lo || 1;
  const y0 = lo - span * 0.1;
  const y1 = hi + span * 0.1;
  const x = (t: number) =>
    PAD.left + ((t - props.from) / (props.to - props.from)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => props.from + k * (props.to - props.from));
  const band = props.band;
  return (
    <figure className="museum-chart" data-testid="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={props.label}>
        {band && (
          <rect
            className="chart-band"
            x={PAD.left}
            width={W - PAD.left - PAD.right}
            y={y(band.max)}
            height={y(band.min ?? y0) - y(band.max)}
          />
        )}
        <line
          className="chart-axis"
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
        />
        {[y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1].map((v) => (
          <text key={v} className="chart-tick" x={PAD.left - 4} y={y(v) + 3} textAnchor="end">
            {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}
          </text>
        ))}
        {ticks.map((t) => (
          <text key={t} className="chart-tick" x={x(t)} y={H - 6} textAnchor="middle">
            {hourText(t)}
          </text>
        ))}
        {props.lines.map((line) => (
          <polyline
            key={line.label}
            className={`chart-line ${line.kind}`}
            points={line.points.map((p) => `${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <figcaption className="chart-legend">
        {props.lines.map((line) => (
          <span key={line.label}>
            <span className={`chart-key ${line.kind}`} />
            {line.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
