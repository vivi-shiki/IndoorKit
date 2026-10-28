import {
  type AlarmRule,
  type Bay,
  createRouter,
  type DeviceReading,
  feeFor,
  type MonthlyContract,
  type ParkedVehicle,
  type Parking,
  type ParkingSession,
  type ParkingSnapshot,
  type Place,
  type Route,
  type Vehicle,
  type VehicleClass,
} from '@indoorkit/parking';

export const DAY_MS = 24 * 3600_000;
const H = 3600_000;
const M = 60_000;
/** 场内行驶速度 2 m/s（约 7 km/h） */
const SPEED_MPS = 2;

/** 一辆车的一次停车 */
export interface Visit {
  /** 也是实时位置里的标签 id */
  id: string;
  vehicle: Vehicle;
  bayId: string;
  enteredAt: number;
  parkedAt: number;
  leftAt: number;
  exitedAt: number;
  /** cash：在精算机付；app：App 预付；contract：月租、法人手配，不收费 */
  payment: 'cash' | 'app' | 'contract';
  paid: boolean;
  /** EV 充满电的时刻（只有停在充电位的 EV 有） */
  chargedAt?: number;
  /** 演示用的异常：对应会触发的告警规则 */
  anomaly?: AlarmRule;
  /** 入场、出场的车牌识别相机 */
  entryCamera: string;
  exitCamera: string;
  /** 出场经过的闸机（平面场没有闸机，记出口相机） */
  exitGate: string;
}

export interface SimReservation {
  id: string;
  bayId: string;
  from: number;
  to: number;
  plate: string;
  /** 到场时刻；爽约为 null */
  arrivedAt: number | null;
}

export interface DeviceIncident {
  deviceId: string;
  from: number;
  to: number;
  status: 'offline' | 'fault' | 'calling' | 'online';
  /** CO 浓度等测量值 */
  value?: number;
}

export interface ParkingEvent {
  time: number;
  kind: 'entry' | 'park' | 'leave' | 'exit';
  visitId: string;
  plate: string;
  bayId: string;
  /** 识别这次事件的设备：出入口是车牌识别相机，停车和离开是车位传感器或 AI 相机 */
  deviceId: string;
  /** exit：是否已付款 */
  paid?: boolean;
}

export interface MovingVehicle {
  id: string;
  plate: string;
  levelId: string;
  coord: [number, number];
}

export interface ParkingDayOptions {
  seed: string;
  /** 模拟哪几天（0 = 今天，-1 = 昨天），默认昨天和今天 */
  days?: readonly number[];
}

/** mulberry32，种子固定时结果固定 */
function random(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ['品川', '練馬', '足立', '横浜', '川崎', '多摩', '千葉', '湘南'];
const KANA = ['あ', 'い', 'う', 'え', 'か', 'き', 'さ', 'す', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'];

/** 每小时到达的计时车辆数（工作日，商业设施附属停车场） */
const ARRIVALS_PER_HOUR = [
  1, 1, 0, 0, 0, 1, 3, 10, 28, 55, 90, 90, 68, 55, 48, 45, 42, 40, 34, 24, 14, 8, 4, 2,
];

/**
 * 一整天（默认昨天和今天）的车辆、预约和设备故障，种子固定时完全可复现。
 * 先按到达时刻排好所有车辆、分好车位，之后任何时刻的状态都由这份计划直接算出，
 * 所以页面打开时可以直接从 0 点「预跑」到当前时刻。
 */
export function createParkingDay(parking: Parking, options: ParkingDayOptions) {
  const days = options.days ?? [-1, 0];
  const router = createRouter(parking);
  const entryRoutes = new Map<string, Route>();
  const exitRoutes = new Map<string, Route>();
  const cached = (cache: Map<string, Route>, find: (bayId: string) => Route) => (bayId: string) => {
    const hit = cache.get(bayId);
    if (hit) return hit;
    const route = find(bayId);
    cache.set(bayId, route);
    return route;
  };
  const toBay = cached(entryRoutes, router.toBay);
  const fromBay = cached(exitRoutes, router.fromBay);
  const driveMs = (route: Route) => Math.round((route.meters / SPEED_MPS) * 1000);

  const code = (c: string) => parking.bayByCode(c);
  const device = (c: string) => parking.deviceByCode(c).id;
  const zoneBays = (zoneCode: string) => parking.zoneByCode(zoneCode).bayIds.map((id) => parking.bay(id));
  const surface = new Set(parking.surfaceLevels);
  const camerasFor = (bay: Bay) =>
    surface.has(bay.levelId)
      ? { entryCamera: device('LPR-P2'), exitCamera: device('LPR-P2'), exitGate: device('LPR-P2') }
      : { entryCamera: device('LPR-IN'), exitCamera: device('LPR-OUT'), exitGate: device('G-OUT') };

  // 月租：屋顶 A、B 区 36 个车位里签了 30 个（固定车位）
  const rngContracts = random(`${options.seed}/contracts`);
  const plate = (rng: () => number, cls: VehicleClass) => {
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!;
    const n = () => String(Math.floor(rng() * 100)).padStart(2, '0');
    const number = cls === 'large' ? '100' : pick(['300', '330', '500', '530']);
    return `${pick(REGIONS)} ${number} ${pick(KANA)} ${n()}-${n()}`;
  };
  const monthlyBays = parking.bays.filter((b) => b.type === 'monthly');
  const monthlyContracts: MonthlyContract[] = monthlyBays
    .filter((_, i) => i % 6 !== 5)
    .map((b, i) => ({ id: `M-${String(i + 1).padStart(3, '0')}`, bayId: b.id }));
  const monthlyVehicles = monthlyContracts.map(
    (c): Vehicle => ({
      plate: plate(rngContracts, 'standard'),
      vehicleClass: 'standard',
      permit: false,
      contract: { kind: 'monthly', id: c.id, bayId: c.bayId },
    }),
  );

  const visits: Visit[] = [];
  const reservations: SimReservation[] = [];
  const incidents: DeviceIncident[] = [];
  /** 车位 → 已排好的占用时段 */
  const busy = new Map<string, { from: number; to: number }[]>();
  const isFree = (bayId: string, from: number, to: number) =>
    !(busy.get(bayId) ?? []).some((b) => b.from < to && from < b.to);
  const hold = (bayId: string, from: number, to: number) =>
    busy.set(bayId, [...(busy.get(bayId) ?? []), { from, to }]);
  const reserved = (bayId: string, from: number, to: number) =>
    reservations.some((r) => r.bayId === bayId && r.from - 15 * M < to && from < r.to);

  let seq = 0;
  /** 排一次停车：从入场时刻和停留时长算出各时刻，占住车位 */
  const schedule = (
    vehicle: Vehicle,
    bay: Bay,
    enteredAt: number,
    stayMs: number,
    extra: Partial<Pick<Visit, 'payment' | 'paid' | 'anomaly'>> & { chargeMs?: number } = {},
  ) => {
    const parkedAt = enteredAt + driveMs(toBay(bay.id));
    const leftAt = parkedAt + stayMs;
    const exitedAt = leftAt + driveMs(fromBay(bay.id));
    hold(bay.id, parkedAt, leftAt);
    const contract = vehicle.contract.kind === 'monthly' || vehicle.contract.kind === 'fleet';
    const visit: Visit = {
      id: `V${String(++seq).padStart(5, '0')}`,
      vehicle,
      bayId: bay.id,
      enteredAt,
      parkedAt,
      leftAt,
      exitedAt,
      payment: extra.payment ?? (contract ? 'contract' : 'cash'),
      paid: extra.paid ?? true,
      ...camerasFor(bay),
    };
    if (extra.anomaly) visit.anomaly = extra.anomaly;
    if (bay.type === 'ev' && vehicle.vehicleClass === 'ev')
      visit.chargedAt = parkedAt + (extra.chargeMs ?? 90 * M);
    visits.push(visit);
    return visit;
  };

  for (const day of days) {
    const base = day * DAY_MS;
    const rng = random(`${options.seed}/day${day}`);
    const between = (a: number, b: number) => a + rng() * (b - a);
    const minute = (t: number) => Math.round(t / M) * M;
    const hourly = (cls: VehicleClass = 'standard', permit = false): Vehicle => ({
      plate: plate(rng, cls),
      vehicleClass: cls,
      permit,
      contract: { kind: 'hourly' },
    });

    // 预约：2F、3F 的普通车位，每天 8 个；第一个爽约，另有一辆计时车占了它
    const reservable = [...zoneBays('2F-C'), ...zoneBays('3F-B')];
    const todays: SimReservation[] = [];
    for (let i = 0; i < 8; i++) {
      const from = base + (9 + i) * H + (i % 2) * 30 * M;
      const r: SimReservation = {
        id: `R-${day < 0 ? 'Y' : 'T'}${String(i + 1).padStart(3, '0')}`,
        bayId: reservable[i * 3]!.id,
        from,
        to: from + 3 * H,
        plate: plate(rng, 'standard'),
        arrivedAt: null,
      };
      reservations.push(r);
      todays.push(r);
    }
    for (const r of todays.slice(1)) {
      const enteredAt = minute(r.from - between(0, 10) * M);
      r.arrivedAt = enteredAt;
      const vehicle: Vehicle = {
        plate: r.plate,
        vehicleClass: 'standard',
        permit: false,
        contract: { kind: 'reservation', id: r.id },
      };
      schedule(vehicle, parking.bay(r.bayId), enteredAt, r.to - r.from - between(20, 40) * M, {
        payment: 'app',
      });
    }
    const noShow = todays[0]!;
    schedule(hourly(), parking.bay(noShow.bayId), noShow.from - 20 * M, 2 * H, { anomaly: 'reserved-bay' });

    // 月租：七成左右的契约车早上来、傍晚走；一辆停错到别人的固定车位
    monthlyVehicles.forEach((vehicle, i) => {
      if (rng() < 0.25) return;
      const contract = vehicle.contract as { bayId: string };
      const wrong =
        i === 3 ? monthlyBays.find((b) => !monthlyContracts.some((c) => c.bayId === b.id)) : undefined;
      const bay = wrong ?? parking.bay(contract.bayId);
      const enteredAt = minute(base + between(7, 9.5) * H);
      const stay = between(8, 10.5) * H;
      if (!isFree(bay.id, enteredAt, enteredAt + stay + 10 * M)) return;
      schedule(vehicle, bay, enteredAt, stay, wrong ? { anomaly: 'monthly-bay' } : {});
    });

    // 法人手配：建设公司的 4 台工程车每天 8～17 时用大型车区
    for (let i = 0; i < 4; i++) {
      const vehicle: Vehicle = {
        plate: plate(rng, 'large'),
        vehicleClass: 'large',
        permit: false,
        contract: { kind: 'fleet', id: 'F-0001', company: 'Minato Kensetsu' },
      };
      schedule(vehicle, zoneBays('P2-L')[i]!, minute(base + 8 * H - between(5, 15) * M), 9 * H);
    }

    // EV：傍晚来的 6 辆 EV 停满充电位，充满后不挪车
    zoneBays('1F-A')
      .filter((b) => b.type === 'ev')
      .forEach((bay, i) => {
        const vehicle = hourly('ev');
        schedule(vehicle, bay, minute(base + (17.4 + i * 0.2) * H), between(5, 6) * H, {
          chargeMs: between(60, 100) * M,
        });
      });

    // 长时间停车：昨天上午来、今天下午才走的两辆
    if (days.includes(day + 1)) {
      for (const [k, c] of ['3F-D10', '2F-D15'].entries()) {
        const bay = code(c);
        const enteredAt = minute(base + (9 + k) * H);
        if (isFree(bay.id, enteredAt, enteredAt + 31 * H))
          schedule(hourly(), bay, enteredAt, (29 + k) * H, { anomaly: 'long-stay' });
      }
    }

    // 计时车辆：按小时的到达量，偏好 1F → 2F → 3F → 平面场 → 屋顶
    const garagePreference = parking.garageLevels;
    const order = [
      ...garagePreference.slice(0, -1).flatMap((l) => parking.zones.filter((z) => z.levelId === l)),
      ...parking.zones.filter((z) => z.site === 'surface'),
      ...parking.zones.filter((z) => z.levelId === garagePreference.at(-1)),
    ];
    const arrivals: number[] = [];
    ARRIVALS_PER_HOUR.forEach((n, h) => {
      for (let i = 0; i < n; i++) arrivals.push(minute(base + (h + rng()) * H));
    });
    arrivals.sort((a, b) => a - b);
    const anomalyAt = new Map<number, AlarmRule>([
      [40, 'ev-bay'],
      [90, 'unpaid-exit'],
      [120, 'accessible-bay'],
      [200, 'large-bay'],
      [260, 'monthly-bay'],
      [380, 'ev-bay'],
      [420, 'unpaid-exit'],
    ]);
    arrivals.forEach((enteredAt, i) => {
      const hour = (enteredAt - base) / H;
      const r = rng();
      const cls: VehicleClass = r < 0.03 ? 'large' : r < 0.06 ? 'ev' : 'standard';
      const permit = rng() < 0.02;
      const vehicle = hourly(cls, permit);
      // 停留：多数 1～3 小时，上午来的约一成停半天，晚上来的少数过夜
      const p = rng();
      let stay =
        p < 0.6 ? between(50, 200) * M : p < 0.9 || hour >= 14 ? between(3, 5) * H : between(6, 10) * H;
      if (hour >= 19 && rng() < 0.08) stay = between(9, 13) * H;
      const anomaly = anomalyAt.get(i);
      const fits = (bay: Bay) => {
        if (anomaly === 'ev-bay') return bay.type === 'ev';
        if (anomaly === 'accessible-bay') return bay.type === 'accessible';
        if (anomaly === 'large-bay') return bay.type === 'large';
        if (anomaly === 'monthly-bay') return bay.type === 'monthly';
        if (cls === 'large') return bay.type === 'large' || bay.zoneId === parking.zoneByCode('P2-A').id;
        if (permit && bay.type === 'accessible') return true;
        return bay.type === 'standard';
      };
      const window = (bay: Bay) => {
        const parkedAt = enteredAt + driveMs(toBay(bay.id));
        return [parkedAt - M, parkedAt + stay + M] as const;
      };
      const candidates = (zones: typeof order) =>
        zones
          .flatMap((z) => z.bayIds.map((id) => parking.bay(id)))
          .filter((b) => {
            const [from, to] = window(b);
            return fits(b) && isFree(b.id, from, to) && !reserved(b.id, from, to);
          });
      // 每层随机挑一个空位；这一层满了才去下一层
      let bay: Bay | undefined;
      for (const level of [...new Set(order.map((z) => z.levelId))]) {
        const free = candidates(order.filter((z) => z.levelId === level));
        if (free.length > 0) {
          bay = free[Math.floor(rng() * free.length)];
          break;
        }
      }
      if (!bay) return;
      schedule(vehicle, bay, enteredAt, stay, {
        payment: anomaly === 'unpaid-exit' ? 'cash' : rng() < 0.35 ? 'app' : 'cash',
        paid: anomaly !== 'unpaid-exit',
        ...(anomaly ? { anomaly } : {}),
      });
    });

    // 设备故障：时刻固定，今天 14 时过后不久有一次求助呼叫，便于现场演示
    const incident = (
      c: string,
      from: number,
      to: number,
      status: DeviceIncident['status'],
      value?: number,
    ) =>
      incidents.push({
        deviceId: device(c),
        from: base + from,
        to: base + to,
        status,
        ...(value === undefined ? {} : { value }),
      });
    incident('G-OUT', 9 * H + 5 * M, 9 * H + 20 * M, 'fault');
    incident('S-3F-C07', 10 * H + 20 * M, 11 * H + 40 * M, 'offline');
    incident('FLAP-P2-A05', 11 * H, 12 * H + 30 * M, 'fault');
    incident('EV-04', 11 * H + 30 * M, 13 * H, 'fault');
    incident('TEL-OUT', 12 * H + 15 * M, 12 * H + 18 * M, 'calling');
    incident('CAM-P2-B', 13 * H + 10 * M, 13 * H + 40 * M, 'offline');
    incident('TEL-IN', 14 * H + 3 * M, 14 * H + 6 * M, 'calling');
    incident('CO-1F-1', 14 * H + 10 * M, 14 * H + 25 * M, 'online', 65);
    incident('S-2F-B04', 14 * H + 40 * M, 15 * H + 30 * M, 'offline');
    incident('CO-2F-2', 17 * H + 40 * M, 17 * H + 55 * M, 'online', 58);
  }

  visits.sort((a, b) => a.enteredAt - b.enteredAt || a.id.localeCompare(b.id));
  const sensorOf = (bayId: string) => {
    const d = parking.devicesOfBay(bayId).find((x) => x.kind === 'bay-sensor' || x.kind === 'ai-camera');
    if (!d) throw new Error(`bay ${parking.bay(bayId).code} has no detector`);
    return d.id;
  };
  const events: ParkingEvent[] = visits
    .flatMap((v): ParkingEvent[] => {
      const common = { visitId: v.id, plate: v.vehicle.plate, bayId: v.bayId };
      return [
        { ...common, time: v.enteredAt, kind: 'entry', deviceId: v.entryCamera },
        { ...common, time: v.parkedAt, kind: 'park', deviceId: sensorOf(v.bayId) },
        { ...common, time: v.leftAt, kind: 'leave', deviceId: sensorOf(v.bayId) },
        { ...common, time: v.exitedAt, kind: 'exit', deviceId: v.exitCamera, paid: v.paid },
      ];
    })
    .sort((a, b) => a.time - b.time);
  const firstAfter = (t: number) => {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid]!.time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const coSensors = parking.devicesOf('co-sensor');

  const parkedAt = (t: number): ParkedVehicle[] =>
    visits
      .filter((v) => v.parkedAt <= t && t < v.leftAt)
      .map((v) => ({
        bayId: v.bayId,
        vehicle: v.vehicle,
        enteredAt: v.enteredAt,
        parkedAt: v.parkedAt,
        ...(v.chargedAt === undefined ? {} : { chargedAt: v.chargedAt }),
      }));

  /** 路线上走了 elapsed 毫秒时的位置 */
  const along = (route: Route, elapsed: number): Place => {
    let left = (elapsed / 1000) * SPEED_MPS;
    const pts = route.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const seg = a.levelId === b.levelId ? distance(a.coord, b.coord) : 0;
      if (left <= seg && seg > 0) {
        const f = left / seg;
        return {
          levelId: b.levelId,
          coord: [a.coord[0] + (b.coord[0] - a.coord[0]) * f, a.coord[1] + (b.coord[1] - a.coord[1]) * f],
        };
      }
      left -= seg;
    }
    return pts.at(-1)!;
  };

  /** t 时刻的设备读数：故障中的设备和全部 CO 传感器 */
  const deviceReadings = (t: number): DeviceReading[] => {
    const active = incidents.filter((i) => i.from <= t && t < i.to);
    const readings: DeviceReading[] = active
      .filter((i) => parking.device(i.deviceId).kind !== 'co-sensor')
      .map((i) => ({ deviceId: i.deviceId, status: i.status }));
    for (const d of coSensors) {
      const spike = active.find((i) => i.deviceId === d.id);
      // 平时 5～15 ppm，随时间缓慢变化
      const normal = 10 + 5 * Math.sin((t / H + d.code.length) * 0.7);
      readings.push({ deviceId: d.id, status: 'online', value: Math.round(spike?.value ?? normal) });
    }
    return readings;
  };

  return {
    visits: visits as readonly Visit[],
    reservations: reservations as readonly SimReservation[],
    incidents: incidents as readonly DeviceIncident[],
    monthlyContracts: monthlyContracts as readonly MonthlyContract[],
    /** t 时刻停在车位上的车 */
    parkedAt,
    /** t 时刻正在行驶（入场后找车位、离开车位去出口）的车 */
    movingAt(t: number): MovingVehicle[] {
      const out: MovingVehicle[] = [];
      for (const v of visits) {
        if (v.enteredAt > t) break;
        let place: Place | null = null;
        if (t < v.parkedAt) place = along(toBay(v.bayId), t - v.enteredAt);
        else if (v.leftAt <= t && t < v.exitedAt) place = along(fromBay(v.bayId), t - v.leftAt);
        if (place) out.push({ id: v.id, plate: v.vehicle.plate, levelId: place.levelId, coord: place.coord });
      }
      return out;
    },
    /** [from, to) 之间的入场、停车、离开、出场事件，按时刻 */
    events: (from: number, to: number) => events.slice(firstAfter(from), firstAfter(to)),
    deviceReadings,
    /** t 时刻的场内状态；exits 是 (since, t] 之间的出场 */
    snapshotAt(t: number, since: number): ParkingSnapshot {
      return {
        now: t,
        parked: parkedAt(t),
        reservations: reservations
          .filter((r) => r.from - H <= t && t < r.to)
          .map((r) => ({ ...r, arrivedAt: r.arrivedAt !== null && r.arrivedAt <= t ? r.arrivedAt : null })),
        devices: deviceReadings(t),
        exits: visits
          .filter((v) => v.exitedAt > since && v.exitedAt <= t)
          .map((v) => ({ vehicle: v.vehicle, time: v.exitedAt, paid: v.paid, gateId: v.exitGate })),
      };
    },
    /** t 时刻以前入场的车辆的停车记录，给运营统计用 */
    sessions(t: number): ParkingSession[] {
      return visits
        .filter((v) => v.enteredAt <= t)
        .map((v) => {
          const exited = v.exitedAt <= t;
          return {
            plate: v.vehicle.plate,
            bayId: v.bayId,
            contract: v.vehicle.contract.kind,
            enteredAt: v.enteredAt,
            parkedAt: Math.min(v.parkedAt, t),
            leftAt: v.leftAt <= t ? v.leftAt : null,
            exitedAt: exited ? v.exitedAt : null,
            fee: v.payment === 'contract' ? 0 : feeFor(v.enteredAt, exited ? v.exitedAt : t).total,
            paid: v.paid,
          };
        });
    },
    visit: (id: string) => {
      const v = visits.find((x) => x.id === id);
      if (!v) throw new Error(`unknown visit "${id}"`);
      return v;
    },
  };
}

function distance(a: [number, number], b: [number, number]) {
  const mPerLng = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * mPerLng, (b[1] - a[1]) * 110_540);
}

export type ParkingDay = ReturnType<typeof createParkingDay>;
