import { type Alarm, DEPARTMENT_RULES, subjectsOf } from '@indoorkit/hospital';
import {
  floorPlugin,
  polygonPlugin,
  popupPlugin,
  positionStreamPlugin,
  zonePlugin,
} from '@indoorkit/plugins';
import { hospitalAlarmPlugin } from '../../adapters/alarm';
import { createRoster, createSimProvider, SIM_INTERVAL_MS } from '../../adapters/sim';
import { placesOf } from '../../adapters/venue';
import { i18n, translate } from '../../app-i18n';
import { roleColor } from '../../presentation/colors';
import { assetName, personName, placeText, t } from '../../presentation/format';
import { chipGroup } from '../../presentation/ui';
import { floorName, mountMapPage } from '../map-page';
import { type AlarmState, alarmItem, controls, overlays } from './view';

const PEOPLE = 600;
const ASSETS = 200;
/** 列表只显示最新的这么多条；已确认、处理中的始终显示 */
const MAX_SHOWN = 50;
const LAYERS = ['department', 'fence', 'status'] as const;

/** 禁入区域告警：科室范围、自定义围栏和设备状态三类告警的实时列表与处理 */
export async function mountAlertsPage(root: HTMLElement) {
  let decorate = (_id: string): Record<string, string> => ({});
  const page = await mountMapPage(root, {
    demo: 'alerts',
    readyWhen: 'first-positions',
    title: 'page.alerts.title',
    controls,
    overlays,
    plugins: (venue) => {
      const roster = createRoster(venue, { people: PEOPLE, assets: ASSETS });
      return [
        floorPlugin,
        polygonPlugin,
        popupPlugin,
        zonePlugin({ zones: placesOf(venue).hospital.zones() }),
        hospitalAlarmPlugin({ subjects: subjectsOf(roster), departmentRules: DEPARTMENT_RULES }),
        positionStreamPlugin({
          provider: createSimProvider(venue, { people: PEOPLE, assets: ASSETS, seed: 'alerts' }),
          intervalMs: SIM_INTERVAL_MS,
          decorate: (id) => decorate(id),
          circleColor: roleColor,
        }),
      ] as const;
    },
    floor: '3F',
  });
  const { indoor, venue, index, hospital, floor, hooks, cleanups } = page;
  const { alarm, popup } = indoor.plugins;
  const roster = createRoster(venue, { people: PEOPLE, assets: ASSETS });
  const people = new Map(roster.people.map((p) => [p.id, p]));
  const assets = new Map(roster.assets.map((a) => [a.id, a]));
  // 设备用灰色画，人员按角色着色
  decorate = (id) => ({ role: people.get(id)?.role ?? 'asset' });
  const $ = <E extends HTMLElement>(selector: string) => root.querySelector<E>(selector)!;

  // 第二层：自定义围栏
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
  const fences = [
    {
      id: 'icu-restricted',
      key: 'fence.icu',
      floor: '3F',
      coordinates: unitOn('3F', 'ICU', 'middle'),
      rule: 'forbid' as const,
      selector: { kinds: ['person' as const] },
      exemptDepartments: [hospital.departmentByCode('icu').id],
      level: 'high' as const,
      color: '#dc2626',
    },
    {
      id: 'exit-antitheft',
      key: 'fence.exit',
      floor: '1F',
      coordinates: unitOn('1F', 'lobby'),
      rule: 'forbid' as const,
      selector: { kinds: ['asset' as const] },
      level: 'high' as const,
      color: '#ea580c',
    },
    {
      id: 'ward-dwell',
      key: 'fence.wardDwell',
      floor: '4F',
      coordinates: unitOn('4F', 'Ward 401'),
      rule: 'dwell' as const,
      dwellMs: 120_000,
      selector: { roles: ['visitor'] },
      level: 'medium' as const,
      color: '#9333ea',
    },
  ];
  for (const { key, ...fence } of fences) alarm.addFence({ ...fence, label: t(key) });

  const states = new Map<string, AlarmState>();
  const stateOf = (id: string): AlarmState => states.get(id) ?? 'open';
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
  const where = (a: Alarm) =>
    `${floorName(floor, a.levelId)} · ${placeText(index, venue, a.unitId ? { unitId: a.unitId, departmentId: a.departmentId } : null)}`;

  const layerChips = chipGroup({
    container: $('[data-chips="layer"]'),
    testId: 'layer-chip',
    items: () => LAYERS.map((l) => ({ value: l, text: t(`layer.${l}`) })),
    onChange: () => refresh(true),
  });

  const renderFeed = () => {
    const layers = layerChips.selected();
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
    $('[data-testid="alert-list"]').innerHTML = shown
      .map((a) =>
        alarmItem(
          a,
          {
            floor: floorName(floor, a.levelId),
            kind: kindText(a),
            subject: subjectName(a.subjectId),
            place: where(a),
          },
          stateOf(a.id),
        ),
      )
      .join('');
    $('[data-testid="alert-count"]').textContent = String(alarm.alarms().length);
    $('[data-testid="unhandled-count"]').textContent = String(unhandled());
  };
  const unhandled = () => alarm.alarms().filter((a) => stateOf(a.id) !== 'resolved').length;

  // 记住弹窗对应的告警，切换语言时用新语言重开
  let popupAlarm: Alarm | null = null;
  const showPopup = (a: Alarm) => {
    popupAlarm = a;
    popup.open({ id: 'alarm', coord: a.coord, text: `${subjectName(a.subjectId)} · ${kindText(a)}` });
  };
  const locate = (a: Alarm) => {
    floor.set(a.levelId);
    indoor.camera.focus(a.coord);
    showPopup(a);
  };
  $('[data-testid="alert-list"]').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('[data-alarm]');
    if (!item) return;
    const a = alarm.alarms().find((x) => x.id === item.dataset.alarm)!;
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'ack') states.set(a.id, 'acknowledged');
    else if (action === 'resolve') states.set(a.id, 'resolved');
    else if (target.closest('[data-testid="alarm-subject"]')) locate(a);
    else return;
    refresh(true);
  });

  // 告警在位置上报时产生，每次上报后最多重画一次列表
  let dirty = false;
  const refresh = (force = false) => {
    if (force) renderFeed();
    else dirty = true;
  };
  indoor.events.on('alarm:raise', (a) => {
    // 当前楼层的新告警弹窗提示
    if (a.levelId === floor.current().id) showPopup(a);
    dirty = true;
  });
  indoor.events.on('positions:update', () => {
    if (!dirty) return;
    dirty = false;
    renderFeed();
  });

  const relabel = () => {
    layerChips.render();
    translate(root);
    if (popupAlarm && popup.list().includes('alarm')) showPopup(popupAlarm);
    refresh(true);
  };
  cleanups.push(i18n.subscribe(relabel));
  relabel();

  hooks.fenceIds = () => alarm.fences().map((f) => f.id);
  hooks.alertCount = () => alarm.alarms().length;
  hooks.alarmLayers = () => [...new Set(alarm.alarms().map((a) => a.layer))].sort();
  hooks.alarmState = (id) => stateOf(id);
  hooks.unhandledCount = unhandled;

  return page.unmount;
}
