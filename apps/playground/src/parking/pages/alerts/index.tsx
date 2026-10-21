import { ALARM_TIERS, type ParkingAlarm } from '@indoorkit/parking';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseClockParam } from '../../adapters/clock';
import { liveAt } from '../../adapters/venue';
import { bayOutlines, bayPlugins, syncSigns } from '../../bays';
import { useParkingT } from '../../i18n';
import { levelName, ParkingMapLayout, useParkingMap, useTick } from '../../map';
import { ChipGroup, Metric } from '../../presentation/ui';
import type { ParkingPageProps } from '../../routes';
import { usePlatesShown } from '../../settings';
import { AlarmDetail, AlarmItem, subjectText } from './view';

const LEVELS = ['high', 'medium', 'low'] as const;
/** 列表只显示最新的这么多条；已确认的始终显示 */
const MAX_SHOWN = 50;
const NONE: ReadonlySet<string> = new Set();
const LOCATE_MARKER = 'alarm:device';

/** 异常告警：三层告警（车位使用、停车时间、设备与环境）的列表、筛选与处理 */
export function AlertsPage({ query }: ParkingPageProps) {
  const t = useParkingT();
  const platesShown = usePlatesShown();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useParkingMap(stageRef, {
    page: 'alerts',
    floor: '1F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: bayPlugins,
  });
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
  const [tiers, setTiers] = useState(NONE);
  const [levels, setLevels] = useState(NONE);
  const [online, setOnline] = useState<{ up: number; total: number } | null>(null);
  const [detail, setDetail] = useState<ParkingAlarm | null>(null);
  const signs = useRef(new Set<string>());

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    indoor.plugins['unit-state'].setOutlines(bayOutlines(ctx));
    hooks.highlighted = () =>
      indoor.plugins['unit-state'].highlighted().map((id) => ctx.parking.bay(id).code);
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
  }, [page]);

  useTick(page, 1000, (time) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const live = liveAt(ctx, time);
    indoor.plugins['unit-state'].setStates(live.states);
    syncSigns(ctx, indoor.plugins.marker, live, signs.current);
    const down = new Set(
      ctx.day
        .deviceReadings(time)
        .filter((r) => r.status === 'offline' || r.status === 'fault')
        .map((r) => r.deviceId),
    );
    setOnline({ up: ctx.parking.devices.length - down.size, total: ctx.parking.devices.length });
    if (!online) void indoor.rendered().then(() => (hooks.ready = true));
  });

  const placeOf = (a: ParkingAlarm) => {
    if (!page) return '';
    const level = levelName(page.floor, a.levelId);
    if (a.bayId) return `${level} · ${page.ctx.parking.bay(a.bayId).code}`;
    if (a.deviceId) return `${level} · ${t(`device.${page.ctx.parking.device(a.deviceId).kind}`)}`;
    return level;
  };

  const locate = (a: ParkingAlarm) => {
    if (!page) return;
    const { ctx, indoor, floor } = page;
    floor.set(a.levelId);
    indoor.plugins.marker.remove(LOCATE_MARKER);
    if (a.bayId) {
      const bay = ctx.parking.bay(a.bayId);
      indoor.plugins['unit-state'].highlight([bay.id]);
      indoor.camera.focus(bay.center);
    } else if (a.deviceId) {
      const device = ctx.parking.device(a.deviceId);
      indoor.plugins['unit-state'].highlight(null);
      indoor.plugins.marker.add({
        id: LOCATE_MARKER,
        coord: device.coord,
        floor: device.levelId,
        label: device.code,
      });
      indoor.camera.focus(device.coord);
    }
    setDetail(a);
  };

  const all = store?.all() ?? [];
  const filtered = all.filter(
    (a) => (tiers.size === 0 || tiers.has(a.tier)) && (levels.size === 0 || levels.has(a.level)),
  );
  const shown: ParkingAlarm[] = [];
  for (let i = filtered.length - 1, latest = 0; i >= 0; i--) {
    const a = filtered[i]!;
    if (latest < MAX_SHOWN) {
      latest++;
      shown.push(a);
    } else if (store!.state(a.id) === 'acknowledged') shown.push(a);
  }
  const unresolved = all.filter((a) => store!.state(a.id) !== 'resolved').length;

  return (
    <ParkingMapLayout
      title="page.alerts.title"
      desc="page.alerts.desc"
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
          <ChipGroup
            testId="tier-chip"
            label={t('page.alerts.title')}
            items={ALARM_TIERS.map((tier) => ({ value: tier, text: t(`tier.${tier}`) }))}
            selected={tiers}
            onChange={setTiers}
          />
          <ChipGroup
            testId="level-chip"
            label={t('page.alerts.title')}
            items={LEVELS.map((level) => ({ value: level, text: t(`level.${level}`) }))}
            selected={levels}
            onChange={setLevels}
          />
        </>
      }
    >
      <aside className="panel alarm-panel" data-version={version}>
        <ul className="alarm-feed" data-testid="alert-list">
          {page && shown.length === 0 && <li className="muted">{t('alarm.none')}</li>}
          {page &&
            shown.map((a) => (
              <AlarmItem
                key={a.id}
                alarm={a}
                subject={subjectText(a, page.ctx.parking, platesShown)}
                place={placeOf(a)}
                state={store!.state(a.id)}
                onAction={(action) => {
                  if (action === 'locate') locate(a);
                  else store!.setState(a.id, action === 'ack' ? 'acknowledged' : 'resolved');
                }}
              />
            ))}
        </ul>
      </aside>
      {page && detail && (
        <AlarmDetail
          alarm={detail}
          subject={subjectText(detail, page.ctx.parking, platesShown)}
          place={placeOf(detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </ParkingMapLayout>
  );
}
