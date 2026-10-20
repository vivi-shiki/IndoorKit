import { type Alarm, DEPARTMENT_RULES, type FenceRule, subjectsOf } from '@indoorkit/hospital';
import {
  floorPlugin,
  polygonPlugin,
  popupPlugin,
  positionStreamPlugin,
  zonePlugin,
} from '@indoorkit/plugins';
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react';
import { hospitalAlarmPlugin } from '../../adapters/alarm';
import { createRoster, createSimProvider, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { i18n, useT } from '../../app-i18n';
import type { MessageKey } from '../../i18n';
import { roleColor } from '../../presentation/colors';
import { assetName, personName, placeText } from '../../presentation/format';
import { ChipGroup } from '../../presentation/ui';
import { floorName, type MapPage, MapPageLayout, useMapEvent, useMapPage } from '../map-page';
import { AlarmItem, type AlarmState } from './view';

const PEOPLE = 600;
const ASSETS = 200;
/** 列表只显示最新的这么多条；已确认、处理中的始终显示 */
const MAX_SHOWN = 50;
const LAYERS = ['department', 'fence', 'status'] as const;
const NONE: ReadonlySet<string> = new Set();

type Fence = Omit<FenceRule, 'levelId' | 'label'> & { key: MessageKey; floor: string; color: string };

/** 第二层：自定义围栏，画在 ICU、1 层大厅和 401 病房 */
function presetFences({
  venue,
  floor,
  hospital,
}: Pick<MapPage<[]>, 'venue' | 'floor' | 'hospital'>): Fence[] {
  const unitOn = (floorRef: string, name: string, pick: 'middle' | 'first' = 'first') => {
    const levelId = floor.resolve(floorRef).id;
    const found = venue.features.units.features.filter(
      (u) =>
        u.properties.level_id === levelId &&
        (u.properties.label_en === name || u.properties.category === name),
    );
    const unit = found[pick === 'middle' ? Math.floor(found.length / 2) : 0];
    if (!unit) throw new Error(`no ${name} on ${floorRef}`);
    return (unit.geometry as GeoJSON.Polygon).coordinates[0] as [number, number][];
  };
  return [
    {
      id: 'icu-restricted',
      key: 'fence.icu',
      floor: '3F',
      coordinates: unitOn('3F', 'ICU', 'middle'),
      rule: 'forbid',
      selector: { kinds: ['person'] },
      exemptDepartments: [hospital.departmentByCode('icu').id],
      level: 'high',
      color: '#dc2626',
    },
    {
      id: 'exit-antitheft',
      key: 'fence.exit',
      floor: '1F',
      coordinates: unitOn('1F', 'lobby'),
      rule: 'forbid',
      selector: { kinds: ['asset'] },
      level: 'high',
      color: '#ea580c',
    },
    {
      id: 'ward-dwell',
      key: 'fence.wardDwell',
      floor: '4F',
      coordinates: unitOn('4F', 'Ward 401'),
      rule: 'dwell',
      dwellMs: 120_000,
      selector: { roles: ['visitor'] },
      level: 'medium',
      color: '#9333ea',
    },
  ];
}

/** 禁入区域告警：科室范围、自定义围栏和设备状态三类告警的实时列表与处理 */
export function AlertsPage() {
  const t = useT();
  const stageRef = useRef<HTMLDivElement>(null);
  // 设备用灰色画，人员按角色着色；名册在场馆加载后才有
  const roster = useRef<ReturnType<typeof createRoster> | null>(null);
  const page = useMapPage(stageRef, {
    demo: 'alerts',
    readyWhen: 'first-positions',
    floor: '3F',
    plugins: (venue) => {
      roster.current = createRoster(venue, { people: PEOPLE, assets: ASSETS });
      const roles = new Map(roster.current.people.map((p) => [p.id, p.role]));
      return [
        floorPlugin,
        polygonPlugin,
        popupPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        hospitalAlarmPlugin({ subjects: subjectsOf(roster.current), departmentRules: DEPARTMENT_RULES }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: PEOPLE, assets: ASSETS, seed: 'alerts' }),
          intervalMs: SIM_INTERVAL_MS,
          decorate: (id) => ({ role: roles.get(id) ?? 'asset' }),
          circleColor: roleColor,
        }),
      ] as const;
    },
  });
  const alarm = page?.indoor.plugins.alarm;
  const people = useMemo(() => new Map((page ? roster.current!.people : []).map((p) => [p.id, p])), [page]);
  const assets = useMemo(() => new Map((page ? roster.current!.assets : []).map((a) => [a.id, a])), [page]);

  const fences = useMemo(() => (page ? presetFences(page) : []), [page]);
  useEffect(() => {
    for (const { key, ...fence } of fences) alarm!.addFence({ ...fence, label: i18n.t(key) });
  }, [alarm, fences]);

  const [states, setStates] = useState(new Map<string, AlarmState>());
  const stateOf = (id: string): AlarmState => states.get(id) ?? 'open';
  const [layers, setLayers] = useState(NONE);

  const subjectName = (id: string) => {
    const p = people.get(id);
    if (p) return `${personName(p)} · ${t(`role.${p.role}`)}`;
    const a = assets.get(id);
    return a ? assetName(a) : id;
  };
  const kindText = (a: Alarm) => {
    const fence = a.fenceId ? fences.find((f) => f.id === a.fenceId) : undefined;
    return fence ? `${t(`alarm.${a.kind}`)} · ${t(fence.key)}` : t(`alarm.${a.kind}`);
  };

  // 记住弹窗对应的告警，切换语言时用新语言重开
  const [popupAlarm, setPopupAlarm] = useState<Alarm | null>(null);
  const showPopup = (a: Alarm) => {
    setPopupAlarm(a);
    page!.indoor.plugins.popup.open({
      id: 'alarm',
      coord: a.coord,
      text: `${subjectName(a.subjectId)} · ${kindText(a)}`,
    });
  };
  const reopenPopup = useEffectEvent(() => {
    if (popupAlarm && page?.indoor.plugins.popup.list().includes('alarm')) showPopup(popupAlarm);
  });
  useEffect(() => i18n.subscribe(() => reopenPopup()), []);

  // 告警在位置上报时产生，每次上报后最多重画一次列表
  const [, redraw] = useReducer((v: number) => v + 1, 0);
  const dirty = useRef(false);
  useMapEvent(page, 'alarm:raise', (a) => {
    // 当前楼层的新告警弹窗提示
    if (a.levelId === page!.floor.current().id) showPopup(a);
    dirty.current = true;
  });
  useMapEvent(page, 'positions:update', () => {
    if (!dirty.current) return;
    dirty.current = false;
    redraw();
  });

  const unhandled = alarm ? alarm.alarms().filter((a) => stateOf(a.id) !== 'resolved').length : 0;
  useEffect(() => {
    if (!page || !alarm) return;
    const { hooks } = page;
    hooks.fenceIds = () => alarm.fences().map((f) => f.id);
    hooks.alertCount = () => alarm.alarms().length;
    hooks.alarmLayers = () => [...new Set(alarm.alarms().map((a) => a.layer))].sort();
  }, [page, alarm]);
  useEffect(() => {
    if (!page || !alarm) return;
    page.hooks.alarmState = (id) => states.get(id) ?? 'open';
    page.hooks.unhandledCount = () =>
      alarm.alarms().filter((a) => (states.get(a.id) ?? 'open') !== 'resolved').length;
  }, [page, alarm, states]);

  let feed = null;
  if (page && alarm) {
    const { floor, index, venue } = page;
    const all = alarm.alarms().filter((a) => layers.size === 0 || layers.has(a.layer));
    const shown: Alarm[] = [];
    let latest = 0;
    for (let i = all.length - 1; i >= 0; i--) {
      const a = all[i]!;
      if (latest < MAX_SHOWN) {
        latest++;
        shown.push(a);
      } else if (stateOf(a.id) === 'acknowledged') shown.push(a);
    }
    const act = (a: Alarm, action: 'ack' | 'resolve' | 'locate') => {
      if (action === 'locate') {
        floor.set(a.levelId);
        page.indoor.camera.focus(a.coord);
        showPopup(a);
        redraw();
        return;
      }
      setStates(new Map(states).set(a.id, action === 'ack' ? 'acknowledged' : 'resolved'));
    };
    feed = shown.map((a) => (
      <AlarmItem
        key={a.id}
        alarm={a}
        text={{
          floor: floorName(floor, a.levelId),
          kind: kindText(a),
          subject: subjectName(a.subjectId),
          place: `${floorName(floor, a.levelId)} · ${placeText(index, venue, a.unitId ? { unitId: a.unitId, departmentId: a.departmentId } : null)}`,
        }}
        state={stateOf(a.id)}
        onAction={(action) => act(a, action)}
      />
    ));
  }

  return (
    <MapPageLayout
      title="page.alerts.title"
      stageRef={stageRef}
      page={page}
      controls={
        <>
          <span className="metric">
            {t('metric.alerts')}: <b data-testid="alert-count">{alarm?.alarms().length ?? 0}</b>
          </span>
          <span className="metric">
            {t('metric.unhandled')}: <b data-testid="unhandled-count">{unhandled}</b>
          </span>
          <ChipGroup
            testId="layer-chip"
            items={LAYERS.map((l) => ({ value: l, text: t(`layer.${l}`) }))}
            selected={layers}
            onChange={setLayers}
          />
        </>
      }
    >
      <aside className="panel alarm-panel">
        <ul className="alarm-feed" data-testid="alert-list">
          {feed}
        </ul>
      </aside>
    </MapPageLayout>
  );
}
