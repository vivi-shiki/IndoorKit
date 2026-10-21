import { ALARM_TIERS, type MuseumAlarm } from '@indoorkit/museum';
import { floorPlugin, markerPlugin, routePlugin, unitStatePlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseClockParam } from '../../adapters/clock';
import { patrolStatus } from '../../adapters/live';
import { useMuseumT } from '../../i18n';
import { codeOf, levelName, MuseumMapLayout, useMuseumMap, useRoomName, useTick } from '../../map';
import { ALERT_COLORS, GUARD_COLOR } from '../../presentation/colors';
import { ChipGroup, ChoiceChips, Metric } from '../../presentation/ui';
import type { MuseumPageProps } from '../../routes';
import { AlarmItem, CheckpointList, subjectText } from './view';

const H = 3600_000;
const M = 60_000;
const LEVELS = ['high', 'medium', 'low'] as const;
const TABS = ['alerts', 'patrol'] as const;
type Tab = (typeof TABS)[number];
/** 列表只显示最新的这么多条；已确认的始终显示 */
const MAX_SHOWN = 50;
const NONE: ReadonlySet<string> = new Set();
/** 「闭馆后」按钮跳到的时刻：21:10 有人进入考古展示室 */
const AFTER_HOURS = 21 * H + 5 * M;

/** 安全与巡逻：三层告警的列表与处理、警卫的位置和巡逻检查点的核对 */
export function SecurityPage({ query }: MuseumPageProps) {
  const t = useMuseumT();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMuseumMap(stageRef, {
    page: 'security',
    floor: '2F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: () =>
      [floorPlugin, unitStatePlugin({ colors: ALERT_COLORS }), markerPlugin, routePlugin()] as const,
  });
  const roomName = useRoomName(page?.ctx ?? null);
  const store = page?.ctx.alarms;
  // 告警和处理状态在页面之外，变化时重画
  const version = useSyncExternalStore(
    (l) => store?.subscribe(l) ?? (() => {}),
    () =>
      store
        ? `${store.all().length}:${store
            .all()
            .map((a) => store.state(a.id)[0])
            .join('')}`
        : '',
  );
  const [tab, setTab] = useState<Tab>('alerts');
  const [tiers, setTiers] = useState(NONE);
  const [levels, setLevels] = useState(NONE);
  const [guardId, setGuardId] = useState('SG-01');
  const [time, setTime] = useState<number | null>(null);
  const [online, setOnline] = useState<{ up: number; total: number } | null>(null);
  const guardLevels = useRef(new Map<string, string>());

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    hooks.highlighted = () => indoor.plugins['unit-state'].highlighted().map((id) => codeOf(ctx, id));
    hooks.markerCount = () => indoor.plugins.marker.count();
    hooks.alarms = () =>
      [...ctx.alarms.all()].reverse().map((a) => ({
        id: a.id,
        rule: a.rule,
        tier: a.tier,
        level: a.level,
        state: ctx.alarms.state(a.id),
      }));
    hooks.alarmState = (id) => ctx.alarms.state(id);
    hooks.routeLevels = () => indoor.plugins.route.levels().map((id) => levelName(page.floor, id));
    hooks.routeMeters = () => indoor.plugins.route.length();
  }, [page]);

  useTick(page, 1000, (at) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    ctx.alarms.update(at);
    // 有未解决的中、高级告警的房间和展示柜标红
    const alerting = new Set(
      ctx.alarms
        .all()
        .filter((a) => a.level !== 'low' && ctx.alarms.state(a.id) !== 'resolved')
        .map((a) => a.unitId),
    );
    indoor.plugins['unit-state'].setStates([...alerting].map((id) => [id, 'alert'] as const));
    hooks.stateCounts = () => ({ alert: alerting.size });
    hooks.stateOf = (code) => ([...alerting].some((id) => codeOf(ctx, id) === code) ? 'alert' : null);
    for (const g of ctx.day.guards) {
      const p = ctx.day.guardAt(g.id, at);
      const id = `guard:${g.id}`;
      // 标记属于一层：第一次和换层时重新添加，其他时候只移动
      if (guardLevels.current.get(g.id) === p.levelId) indoor.plugins.marker.update(id, { coord: p.coord });
      else {
        indoor.plugins.marker.remove(id);
        indoor.plugins.marker.add({ id, coord: p.coord, floor: p.levelId, label: g.id, color: GUARD_COLOR });
      }
      guardLevels.current.set(g.id, p.levelId);
    }
    const readings = ctx.day.readings(at);
    setOnline({ up: readings.filter((r) => r.online).length, total: readings.length });
    if (time === null) void indoor.rendered().then(() => (hooks.ready = true));
    setTime(at);
  });
  // 巡逻页签：画出所选警卫的巡逻路线
  useEffect(() => {
    if (!page) return;
    const route = page.indoor.plugins.route;
    const guard = page.ctx.day.guards.find((g) => g.id === guardId);
    if (tab !== 'patrol' || !guard?.routeCode) {
      route.clear();
      return;
    }
    const path = page.ctx.museum.route(guard.routeCode).path;
    route.set(path.map((p) => ({ floor: p.levelId, coord: p.coord })));
  }, [page, tab, guardId]);

  const placeOf = (a: MuseumAlarm) => {
    if (!page) return '';
    const level = levelName(page.floor, a.levelId);
    const { museum } = page.ctx;
    if (museum.isCase(a.unitId)) return `${level} · ${roomName(a.unitId)} · ${museum.case(a.unitId).code}`;
    return `${level} · ${roomName(a.unitId)}`;
  };

  const locate = (unitId: string, levelId: string) => {
    if (!page) return;
    const { ctx, indoor, floor } = page;
    floor.set(levelId);
    indoor.plugins['unit-state'].highlight([unitId]);
    const where = ctx.museum.isCase(unitId) ? ctx.museum.case(unitId) : ctx.museum.room(unitId);
    indoor.camera.focus(where.center);
  };

  const all = store?.all() ?? [];
  const filtered = all.filter(
    (a) => (tiers.size === 0 || tiers.has(a.tier)) && (levels.size === 0 || levels.has(a.level)),
  );
  const shown: MuseumAlarm[] = [];
  for (let i = filtered.length - 1, latest = 0; i >= 0; i--) {
    const a = filtered[i]!;
    if (latest < MAX_SHOWN) {
      latest++;
      shown.push(a);
    } else if (store!.state(a.id) === 'acknowledged') shown.push(a);
  }
  const unresolved = all.filter((a) => store!.state(a.id) !== 'resolved').length;
  const patrol = page && time !== null ? patrolStatus(page.ctx.day, guardId, time) : null;

  return (
    <MuseumMapLayout
      title="page.security.title"
      desc="page.security.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <Metric label={t('metric.alerts')} testId="alert-count" value={all.length} />
          <Metric label={t('metric.unresolved')} testId="unresolved-count" value={unresolved} />
          <Metric
            label={t('metric.deviceOnline')}
            testId="device-online"
            value={online ? `${online.up} / ${online.total}` : ''}
          />
          <ChoiceChips
            testId="tab-chip"
            label={t('control.view')}
            items={TABS.map((tb) => ({ value: tb, text: t(`tab.${tb}`) }))}
            selected={tab}
            onChange={setTab}
          />
          <button
            type="button"
            className="chip"
            data-testid="after-hours"
            onClick={() => page?.ctx.clock.set(AFTER_HOURS)}
          >
            {t('afterHours.jump')}
          </button>
        </>
      }
    >
      <aside className="panel alarm-panel" data-version={version}>
        {tab === 'alerts' && (
          <>
            <ChipGroup
              testId="tier-chip"
              label={t('control.tiers')}
              items={ALARM_TIERS.map((tier) => ({ value: tier, text: t(`tier.${tier}`) }))}
              selected={tiers}
              onChange={setTiers}
            />
            <ChipGroup
              testId="level-chip"
              label={t('control.levels')}
              items={LEVELS.map((level) => ({ value: level, text: t(`level.${level}`) }))}
              selected={levels}
              onChange={setLevels}
            />
            <ul className="alarm-feed" data-testid="alert-list">
              {page && shown.length === 0 && <li className="muted">{t('alarm.none')}</li>}
              {page &&
                shown.map((a) => (
                  <AlarmItem
                    key={a.id}
                    alarm={a}
                    subject={subjectText(a, page.ctx)}
                    place={placeOf(a)}
                    state={store!.state(a.id)}
                    onAction={(action) => {
                      if (action === 'locate') locate(a.unitId, a.levelId);
                      else store!.setState(a.id, action === 'ack' ? 'acknowledged' : 'resolved');
                    }}
                  />
                ))}
            </ul>
          </>
        )}
        {tab === 'patrol' && page && (
          <>
            <ChoiceChips
              testId="guard-chip"
              label={t('guard.label')}
              items={page.ctx.day.guards.map((g) => ({ value: g.id, text: g.id }))}
              selected={guardId}
              onChange={setGuardId}
            />
            <CheckpointList
              ctx={page.ctx}
              guardId={guardId}
              status={patrol}
              onSelect={(unitId) => {
                const room = page.ctx.museum.roomOf(unitId);
                locate(room.unitId, room.levelId);
              }}
            />
          </>
        )}
      </aside>
    </MuseumMapLayout>
  );
}
