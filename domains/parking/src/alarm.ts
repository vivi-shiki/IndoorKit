import type { Bay, Parking, Vehicle } from './model';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type AlarmTier = 'contract' | 'time' | 'device';
export type AlarmLevel = 'high' | 'medium' | 'low';

/**
 * 三层告警规则：① 契约与车位类型，② 时间，③ 设备与环境。
 * 键的顺序就是列表和筛选里的顺序。
 */
export const ALARM_RULES = {
  'monthly-bay': { tier: 'contract', level: 'medium' },
  'reserved-bay': { tier: 'contract', level: 'medium' },
  'ev-bay': { tier: 'contract', level: 'medium' },
  'accessible-bay': { tier: 'contract', level: 'medium' },
  'large-bay': { tier: 'contract', level: 'medium' },
  'unpaid-exit': { tier: 'time', level: 'high' },
  'long-stay': { tier: 'time', level: 'medium' },
  'ev-idle': { tier: 'time', level: 'medium' },
  'no-show': { tier: 'time', level: 'low' },
  'night-stay': { tier: 'time', level: 'low' },
  'sensor-offline': { tier: 'device', level: 'medium' },
  'camera-offline': { tier: 'device', level: 'medium' },
  'gate-fault': { tier: 'device', level: 'medium' },
  'charger-fault': { tier: 'device', level: 'medium' },
  'co-high': { tier: 'device', level: 'high' },
  'help-call': { tier: 'device', level: 'high' },
} as const satisfies Record<string, { tier: AlarmTier; level: AlarmLevel }>;

export type AlarmRule = keyof typeof ALARM_RULES;
export const ALARM_TIERS: readonly AlarmTier[] = ['contract', 'time', 'device'];

/** 规则的阈值 */
export const ALARM_LIMITS = {
  longStayMs: DAY,
  /** EV 充满后允许继续占用的时间 */
  evGraceMs: 15 * MINUTE,
  /** 预约开始后多久没到场算爽约 */
  noShowMs: 30 * MINUTE,
  /** 夜间在场：0～5 时 */
  nightFromHour: 0,
  nightToHour: 5,
  coPpm: 50,
};

export interface ParkedVehicle {
  bayId: string;
  vehicle: Vehicle;
  enteredAt: number;
  parkedAt: number;
  /** EV 充满电的时刻 */
  chargedAt?: number;
}

export interface ReservationState {
  id: string;
  bayId: string;
  from: number;
  to: number;
  /** 预约车辆到场的时刻；没到为 null */
  arrivedAt: number | null;
}

export interface DeviceReading {
  deviceId: string;
  /** calling：对讲机正在呼叫 */
  status: 'online' | 'offline' | 'fault' | 'calling';
  /** 测量值，如 CO 浓度（ppm） */
  value?: number;
}

export interface ExitRecord {
  vehicle: Vehicle;
  time: number;
  paid: boolean;
  /** 出场的闸机 */
  gateId: string;
}

/** 某一时刻的场内状态；exits 是上次检查之后的出场 */
export interface ParkingSnapshot {
  now: number;
  parked: readonly ParkedVehicle[];
  reservations: readonly ReservationState[];
  devices: readonly DeviceReading[];
  exits: readonly ExitRecord[];
}

export interface ParkingAlarm {
  id: string;
  rule: AlarmRule;
  tier: AlarmTier;
  level: AlarmLevel;
  time: number;
  levelId: string;
  bayId: string | null;
  deviceId: string | null;
  plate: string | null;
}

const timeOfDay = (t: number) => ((t % DAY) + DAY) % DAY;

/**
 * 告警引擎：每次给一份场内状态，返回新出现的告警。
 * 同一件事（规则 + 对象）持续期间只报一次，条件消失后重置，再出现时重新报。
 */
export function createAlarmEngine(parking: Parking) {
  let active = new Set<string>();
  let seq = 0;

  const bayRule = (bay: Bay, p: ParkedVehicle, reservations: readonly ReservationState[], now: number) => {
    const { vehicle } = p;
    const c = vehicle.contract;
    const out: AlarmRule[] = [];
    if (bay.type === 'monthly' && (c.kind !== 'monthly' || (c.bayId !== undefined && c.bayId !== bay.id)))
      out.push('monthly-bay');
    const reservation = reservations.find((r) => r.bayId === bay.id && r.from <= now && now < r.to);
    if (reservation && !(c.kind === 'reservation' && c.id === reservation.id)) out.push('reserved-bay');
    if (bay.type === 'ev' && vehicle.vehicleClass !== 'ev') out.push('ev-bay');
    if (bay.type === 'accessible' && !vehicle.permit) out.push('accessible-bay');
    if (bay.type === 'large' && vehicle.vehicleClass !== 'large') out.push('large-bay');
    return out;
  };

  const deviceRule = (kind: string, reading: { status: string; value?: number }): AlarmRule | null => {
    if (kind === 'co-sensor') return (reading.value ?? 0) > ALARM_LIMITS.coPpm ? 'co-high' : null;
    if (kind === 'intercom') return reading.status === 'calling' ? 'help-call' : null;
    if (reading.status === 'offline') {
      if (kind === 'bay-sensor') return 'sensor-offline';
      if (kind === 'ai-camera' || kind === 'lpr-camera') return 'camera-offline';
    }
    if (reading.status === 'fault') {
      if (kind === 'gate' || kind === 'flap') return 'gate-fault';
      if (kind === 'charger') return 'charger-fault';
    }
    return null;
  };

  return {
    check(s: ParkingSnapshot): ParkingAlarm[] {
      const found: (Omit<ParkingAlarm, 'id' | 'tier' | 'level'> & { key: string })[] = [];
      const add = (
        rule: AlarmRule,
        subject: string,
        at: Pick<ParkingAlarm, 'levelId' | 'bayId' | 'deviceId' | 'plate'> & { time?: number },
      ) => found.push({ rule, key: `${rule}:${subject}`, time: at.time ?? s.now, ...at });

      const hour = timeOfDay(s.now) / HOUR;
      const night = hour >= ALARM_LIMITS.nightFromHour && hour < ALARM_LIMITS.nightToHour;
      for (const p of s.parked) {
        const bay = parking.bay(p.bayId);
        const at = { levelId: bay.levelId, bayId: bay.id, deviceId: null, plate: p.vehicle.plate };
        const subject = `${bay.id}:${p.vehicle.plate}`;
        for (const rule of bayRule(bay, p, s.reservations, s.now)) add(rule, subject, at);
        if (s.now - p.enteredAt > ALARM_LIMITS.longStayMs) add('long-stay', subject, at);
        if (p.chargedAt !== undefined && s.now - p.chargedAt > ALARM_LIMITS.evGraceMs)
          add('ev-idle', subject, at);
        if (night) add('night-stay', `${subject}:${Math.floor(s.now / DAY)}`, at);
      }
      for (const exit of s.exits) {
        if (exit.paid) continue;
        const gate = parking.device(exit.gateId);
        add('unpaid-exit', `${exit.vehicle.plate}:${exit.time}`, {
          levelId: gate.levelId,
          bayId: null,
          deviceId: gate.id,
          plate: exit.vehicle.plate,
          time: exit.time,
        });
      }
      for (const r of s.reservations) {
        if (r.arrivedAt === null && s.now >= r.from + ALARM_LIMITS.noShowMs && s.now < r.to) {
          const bay = parking.bay(r.bayId);
          add('no-show', r.id, { levelId: bay.levelId, bayId: bay.id, deviceId: null, plate: null });
        }
      }
      for (const reading of s.devices) {
        const device = parking.device(reading.deviceId);
        const rule = deviceRule(device.kind, reading);
        if (!rule) continue;
        add(rule, device.id, {
          levelId: device.levelId,
          bayId: device.kind === 'bay-sensor' ? (device.unitIds[0] ?? null) : null,
          deviceId: device.id,
          plate: null,
        });
      }

      // 出场是一次性的事件，键里带出场时刻，不会因为下一次检查没有它而重置
      const unpaid = [...active].filter((k) => k.startsWith('unpaid-exit:'));
      const raised: ParkingAlarm[] = [];
      for (const { key, rule, ...rest } of found) {
        if (active.has(key)) continue;
        raised.push({ id: `PA-${String(++seq).padStart(5, '0')}`, rule, ...ALARM_RULES[rule], ...rest });
      }
      active = new Set([...unpaid, ...found.map((f) => f.key)]);
      return raised;
    },
  };
}
