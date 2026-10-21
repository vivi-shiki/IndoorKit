import { type ParkingSummary, type Suggestion, suggest, summarize } from '@indoorkit/parking';
import { DAY_MS } from '@indoorkit/parking-simulator';
import { floorPlugin, unitStatePlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { parseClockParam } from '../../adapters/clock';
import type { ParkingContext } from '../../adapters/venue';
import { useParkingT } from '../../i18n';
import { levelName, ParkingMapLayout, useParkingMap, useTick } from '../../map';
import { bucketOf, UTILIZATION_COLORS, type UtilizationBucket } from '../../presentation/colors';
import { durationText, percent, yen } from '../../presentation/format';
import { ChoiceChips, Legend } from '../../presentation/ui';
import type { ParkingPageProps } from '../../routes';
import { HourlyChart, Kpi, ZoneRevenue } from './view';

const H = 3600_000;
const RANGES = ['today', 'day', 'lunch', 'yesterday'] as const;
type Range = (typeof RANGES)[number];
const BUCKETS = Object.keys(UTILIZATION_COLORS) as UtilizationBucket[];
/** 每种建议最多列几条 */
const PER_CODE = 1;

/** 时段对应的窗口；今天的时段截到当前时刻，还没开始时用昨天的同一时段 */
function windowOf(range: Range, now: number) {
  if (range === 'yesterday') return { from: -DAY_MS, to: 0 };
  const [from, to] = range === 'today' ? [0, now] : range === 'day' ? [8 * H, 22 * H] : [12 * H, 14 * H];
  if (from >= now) return { from: from - DAY_MS, to: to - DAY_MS };
  return { from, to: Math.min(to, now) };
}

function analyze(ctx: ParkingContext, range: Range, now: number) {
  const records = { sessions: ctx.day.sessions(now), monthlyContracts: ctx.day.monthlyContracts };
  return summarize(ctx.parking, records, windowOf(range, now));
}

/** 昨天一整天的数据给出的建议，每种取利用率最极端的一条 */
function suggestionsOf(ctx: ParkingContext): Suggestion[] {
  const all = suggest(
    ctx.parking,
    { sessions: ctx.day.sessions(0), monthlyContracts: ctx.day.monthlyContracts },
    -DAY_MS,
  );
  const out: Suggestion[] = [];
  for (const code of ['peak-pricing', 'ev-capacity', 'monthly-recruit'] as const) {
    const of = all
      .filter((s) => s.code === code)
      .sort((a, b) => (code === 'monthly-recruit' ? a.value - b.value : b.value - a.value));
    out.push(...of.slice(0, PER_CODE));
  }
  return out;
}

/** 运营分析：按时段的车位利用率着色、指标卡、每小时在场车辆、各区收入和运营建议 */
export function AnalyticsPage({ query }: ParkingPageProps) {
  const t = useParkingT();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useParkingMap(stageRef, {
    page: 'analytics',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: () =>
      [floorPlugin, unitStatePlugin({ colors: UTILIZATION_COLORS, order: [...BUCKETS].reverse() })] as const,
  });
  const [range, setRange] = useState<Range>(
    (RANGES as readonly string[]).includes(query.get('range') ?? '')
      ? (query.get('range') as Range)
      : 'today',
  );
  const [summary, setSummary] = useState<ParkingSummary | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const refresh = (time: number) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = analyze(ctx, range, time);
    const states = new Map(ctx.parking.bays.map((b) => [b.id, bucketOf(next.bayUtilization.get(b.id) ?? 0)]));
    indoor.plugins['unit-state'].setStates(states);
    hooks.stateCounts = () =>
      Object.fromEntries(BUCKETS.map((u) => [u, [...states.values()].filter((v) => v === u).length]));
    if (!summary) void indoor.rendered().then(() => (hooks.ready = true));
    setSummary(next);
  };

  // 今天的时段随时间变化，每 5 秒重算一次
  useTick(page, 5000, refresh);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 换时段时立即重算
  useEffect(() => {
    if (page) refresh(page.ctx.clock.time());
  }, [range]);
  useEffect(() => {
    if (page) setSuggestions(suggestionsOf(page.ctx));
  }, [page]);

  const zoneLabel = (zoneId: string) => {
    if (!page) return '';
    const z = page.ctx.parking.zone(zoneId);
    return `${levelName(page.floor, z.levelId)} ${z.code.slice(z.code.indexOf('-') + 1)}`;
  };
  const revenueRows = summary
    ? [...summary.revenueByZone.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([zoneId, value]) => ({ label: page!.ctx.parking.zone(zoneId).code, value }))
    : [];

  return (
    <ParkingMapLayout
      title="page.analytics.title"
      desc="page.analytics.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <ChoiceChips
          testId="range-chip"
          label={t('control.range')}
          items={RANGES.map((r) => ({ value: r, text: t(`range.${r}`) }))}
          selected={range}
          onChange={setRange}
        />
      }
    >
      <aside className="panel analytics-panel">
        {summary && (
          <>
            <div className="kpis">
              <Kpi
                label={t('kpi.utilization')}
                testId="kpi-utilization"
                value={percent(summary.utilization)}
              />
              <Kpi
                label={t('kpi.turnover')}
                testId="kpi-turnover"
                value={t('kpi.turnoverValue', { value: summary.turnover.toFixed(1) })}
              />
              <Kpi label={t('kpi.stay')} testId="kpi-stay" value={durationText(summary.averageStayMs)} />
              <Kpi label={t('kpi.revenue')} testId="kpi-revenue" value={yen(summary.revenue)} />
              <Kpi label={t('kpi.unpaid')} testId="kpi-unpaid" value={yen(summary.unpaid)} />
              <Kpi label={t('kpi.vacant')} testId="kpi-vacant" value={String(summary.monthlyVacant)} />
            </div>
            <h2>{t('legend.utilization')}</h2>
            <Legend
              items={BUCKETS.map((u, i) => ({
                color: UTILIZATION_COLORS[u],
                text: `${i * 20}–${(i + 1) * 20}%`,
              }))}
            />
            <HourlyChart hourly={summary.hourly} />
            <ZoneRevenue rows={revenueRows} />
          </>
        )}
        <h2>{t('panel.suggestions')}</h2>
        <ul className="suggestions">
          {page && suggestions.length === 0 && <li className="muted">{t('suggest.none')}</li>}
          {suggestions.map((s) => (
            <li key={`${s.code}:${s.zoneId}`} data-testid="suggestion" data-code={s.code}>
              {t(`suggest.${s.code}`, { zone: zoneLabel(s.zoneId), value: percent(s.value) })}
            </li>
          ))}
        </ul>
      </aside>
    </ParkingMapLayout>
  );
}
