import { createReadingWindow, type ReadingWindow } from './exposure';
import type { Museum } from './model';
import {
  assess,
  CONSERVATION_LIMITS,
  HYSTERESIS,
  isOpen,
  MATERIAL_SENSITIVITY,
  STANDARDS,
} from './standards';

export type AlarmTier = 'access' | 'conservation' | 'device';
export type AlarmLevel = 'high' | 'medium' | 'low';

/**
 * 三层告警规则：① 区域与开馆时间，② 保存环境（含 24 小时窗口和年度累计），③ 展示柜与设备。
 * 键的顺序就是列表和筛选里的顺序。
 */
export const ALARM_RULES = {
  'after-hours': { tier: 'access', level: 'high' },
  'staff-area': { tier: 'access', level: 'medium' },
  'over-capacity': { tier: 'access', level: 'medium' },
  temperature: { tier: 'conservation', level: 'medium' },
  humidity: { tier: 'conservation', level: 'medium' },
  'humidity-swing': { tier: 'conservation', level: 'medium' },
  illuminance: { tier: 'conservation', level: 'medium' },
  'exposure-warning': { tier: 'conservation', level: 'low' },
  'exposure-exceeded': { tier: 'conservation', level: 'medium' },
  'display-days': { tier: 'conservation', level: 'low' },
  'case-opened': { tier: 'device', level: 'high' },
  'case-vibration': { tier: 'device', level: 'high' },
  'too-close': { tier: 'device', level: 'medium' },
  'missed-checkpoint': { tier: 'device', level: 'medium' },
  'sensor-offline': { tier: 'device', level: 'medium' },
  'low-battery': { tier: 'device', level: 'low' },
} as const satisfies Record<string, { tier: AlarmTier; level: AlarmLevel }>;

export type AlarmRule = keyof typeof ALARM_RULES;
export const ALARM_TIERS: readonly AlarmTier[] = ['access', 'conservation', 'device'];

export const ALARM_LIMITS = {
  /** 电量低于这个百分比 */
  lowBattery: 15,
  /** 振动传感器的加速度（m/s²）超过这个值 */
  vibration: 0.5,
};

/**
 * 一个设备在某一时刻的读数。values 的键按设备类型：
 * climate：temperature、humidity；light：illuminance、uv；co2：co2；
 * motion：motion（1 = 有人）；door：open（1 = 打开）；vibration：acceleration；proximity：near（1 = 过近）。
 */
export interface SensorReading {
  deviceId: string;
  online: boolean;
  /** 电量（%） */
  battery: number;
  values: Readonly<Record<string, number>>;
}

/** 某一时刻的馆内状态 */
export interface MuseumSnapshot {
  now: number;
  readings: readonly SensorReading[];
  /** 每个房间里的人数（来馆者） */
  occupancy: ReadonlyMap<string, number>;
  /** 带定位标签的来馆者所在的房间 */
  taggedVisitors: readonly { id: string; unitId: string }[];
  /** 每件藏品今年的累计光照量（lx·h）和公开天数 */
  objects: readonly { objectId: string; lxh: number; displayDays: number }[];
  /** 正在换展作业、允许打开的展示柜 */
  openCases: ReadonlySet<string>;
  /** 漏掉的巡逻检查点 */
  missedCheckpoints: readonly { key: string; unitId: string; time: number }[];
}

export interface MuseumAlarm {
  id: string;
  rule: AlarmRule;
  tier: AlarmTier;
  level: AlarmLevel;
  time: number;
  levelId: string;
  /** 房间或展示柜 */
  unitId: string;
  deviceId: string | null;
  objectId: string | null;
  /** 触发时的读数（温度、湿度、照度、人数、比例等） */
  value: number | null;
}

/**
 * 告警引擎：每次给一份馆内状态，返回新出现的告警。
 * 同一件事（规则 + 对象）持续期间只报一次，条件消失后重置，再出现时重新报。
 * 湿度的日波动要看 24 小时的数据，所以引擎为每个温湿度传感器保存最近 24 小时的湿度。
 */
export function createAlarmEngine(museum: Museum) {
  let active = new Set<string>();
  let seq = 0;
  const windows = new Map<string, ReadingWindow>();
  const levelOf = (unitId: string) =>
    museum.isCase(unitId) ? museum.case(unitId).levelId : museum.room(unitId).levelId;

  return {
    check(s: MuseumSnapshot): MuseumAlarm[] {
      // 已经在告警中的读数要回到范围内一段才算解除，读数在边界附近抖动时不会反复告警
      const margin = (
        rule: 'temperature' | 'humidity' | 'humidity-swing' | 'illuminance',
        deviceId: string,
      ) =>
        active.has(`${rule}:${deviceId}`) ? HYSTERESIS[rule === 'humidity-swing' ? 'humidity' : rule] : 0;
      const found: (Omit<MuseumAlarm, 'id' | 'tier' | 'level' | 'levelId'> & { key: string })[] = [];
      const add = (
        rule: AlarmRule,
        subject: string,
        at: Pick<MuseumAlarm, 'unitId'> &
          Partial<Pick<MuseumAlarm, 'deviceId' | 'objectId' | 'value' | 'time'>>,
      ) =>
        found.push({
          rule,
          key: `${rule}:${subject}`,
          time: at.time ?? s.now,
          unitId: at.unitId,
          deviceId: at.deviceId ?? null,
          objectId: at.objectId ?? null,
          value: at.value ?? null,
        });

      // ① 区域与开馆时间
      const open = isOpen(s.now);
      for (const [unitId, count] of s.occupancy) {
        const room = museum.room(unitId);
        // 超员告警要等人数降到定员的九成以下才解除
        const limit = active.has(`over-capacity:${unitId}`) ? 0.9 * (room.capacity ?? 0) : room.capacity;
        if (limit !== null && count > limit) add('over-capacity', unitId, { unitId, value: count });
      }
      for (const v of s.taggedVisitors) {
        if (museum.roomOf(v.unitId).access === 'staff') add('staff-area', v.id, { unitId: v.unitId });
      }

      for (const r of s.readings) {
        const device = museum.device(r.deviceId);
        const at = { unitId: device.unitId, deviceId: device.id };
        if (!r.online) {
          add('sensor-offline', device.id, at);
          continue;
        }
        if (r.battery < ALARM_LIMITS.lowBattery) add('low-battery', device.id, { ...at, value: r.battery });
        const v = r.values;
        switch (device.kind) {
          case 'motion':
            if (!open && v.motion === 1 && museum.roomOf(device.unitId).access === 'public')
              add('after-hours', device.unitId, at);
            break;
          case 'climate': {
            const { standard } = museum.standardOf(device.unitId);
            const t = v.temperature!;
            const h = v.humidity!;
            if (assess(standard, 'temperature', t, margin('temperature', device.id)) !== 'ok')
              add('temperature', device.id, { ...at, value: t });
            if (assess(standard, 'humidity', h, margin('humidity', device.id)) !== 'ok')
              add('humidity', device.id, { ...at, value: h });
            const w = windows.get(device.id) ?? createReadingWindow();
            windows.set(device.id, w);
            w.push(s.now, h);
            if (w.swing() > CONSERVATION_LIMITS.rhDailySwing - margin('humidity-swing', device.id))
              add('humidity-swing', device.id, { ...at, value: w.swing() });
            break;
          }
          case 'light': {
            const { standard } = museum.standardOf(device.unitId);
            if (assess(standard, 'illuminance', v.illuminance!, margin('illuminance', device.id)) !== 'ok')
              add('illuminance', device.id, { ...at, value: v.illuminance! });
            break;
          }
          case 'door':
            if (v.open === 1 && !s.openCases.has(device.unitId)) add('case-opened', device.unitId, at);
            break;
          case 'vibration':
            if (v.acceleration! > ALARM_LIMITS.vibration)
              add('case-vibration', device.unitId, { ...at, value: v.acceleration! });
            break;
          case 'proximity':
            if (v.near === 1) add('too-close', device.unitId, at);
            break;
        }
      }

      // ② 年度累计：光照预算和指定文化财的公开天数
      for (const o of s.objects) {
        const object = museum.object(o.objectId);
        if (object.status !== 'display' || !object.location) continue;
        const budget = STANDARDS[MATERIAL_SENSITIVITY[object.material]].annualLxh;
        const at = { unitId: object.location, objectId: object.id };
        if (budget !== null) {
          const share = o.lxh / budget;
          if (share >= 1) add('exposure-exceeded', object.id, { ...at, value: share });
          else if (share >= CONSERVATION_LIMITS.exposureWarn)
            add('exposure-warning', object.id, { ...at, value: share });
        }
        if (
          object.designated &&
          o.displayDays >= CONSERVATION_LIMITS.displayDays - CONSERVATION_LIMITS.displayDaysWarn
        )
          add('display-days', object.id, { ...at, value: o.displayDays });
      }

      // ③ 巡逻：漏掉的检查点是一次性的事件，键里带轮次
      for (const m of s.missedCheckpoints)
        add('missed-checkpoint', m.key, { unitId: m.unitId, time: m.time });

      const once = [...active].filter((k) => k.startsWith('missed-checkpoint:'));
      const raised: MuseumAlarm[] = [];
      const seen = new Set(active);
      for (const { key, rule, ...rest } of found) {
        if (seen.has(key)) continue;
        seen.add(key);
        raised.push({
          id: `MA-${String(++seq).padStart(5, '0')}`,
          rule,
          ...ALARM_RULES[rule],
          levelId: levelOf(rest.unitId),
          ...rest,
        });
      }
      active = new Set([...once, ...found.map((f) => f.key)]);
      return raised;
    },
  };
}
