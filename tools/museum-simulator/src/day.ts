import {
  checkMoves,
  type Metric,
  type Museum,
  type MuseumObject,
  type MuseumSnapshot,
  type ObjectMove,
  type ObjectStatus,
  OPENING_HOURS,
  type RfidRead,
  type SensorReading,
  STANDARDS,
} from '@indoorkit/museum';
import { createEnvironment } from './environment';
import { createPeople } from './people';
import { unit, wave } from './random';

const H = 3600_000;
const M = 60_000;
const DAY = 24 * H;
const MINUTES = 24 * 60;

/** 演示里的「今天」是一年里的第几天（10 月 21 日，1 月 1 日为 0） */
export const DAY_OF_YEAR = 293;

/**
 * 每间展示室的展品从今年第几天开始展出（演示值）：
 * 浮世绘从年初一直展到现在，光照预算快用完；企划展 9 月中开幕。
 */
const ON_DISPLAY_SINCE: Record<string, number> = {
  G9: 4,
  G6: 70,
  G7: 150,
  G8: 200,
  G1: 30,
  G2: 100,
  G3: 0,
  G4: 60,
  G5: 0,
  SP1: 255,
  SP2: 255,
};
/** 指定文化财今年已经公开的天数（今天之前） */
const DISPLAYED_DAYS: Record<string, number> = { 'G6-W1': 51, 'G7-W2': 41, 'SP2-W2': 37 };

/** 安防传感器的演示事件（今天的时刻） */
const SECURITY_EVENTS: {
  kind: 'door' | 'vibration' | 'proximity' | 'motion';
  target: string;
  from: number;
  to: number;
}[] = [
  { kind: 'proximity', target: 'G1-F1', from: 10 * H + 20 * M, to: 10 * H + 22 * M },
  { kind: 'proximity', target: 'SP1-F2', from: 11 * H + 45 * M, to: 11 * H + 47 * M },
  { kind: 'proximity', target: 'G9-S1', from: 13 * H + 30 * M, to: 13 * H + 32 * M },
  { kind: 'vibration', target: 'G5-F1', from: 14 * H + 2 * M, to: 14 * H + 3 * M },
  { kind: 'proximity', target: 'SP1-F1', from: 14 * H + 5 * M, to: 14 * H + 7 * M },
  { kind: 'door', target: 'G3-S1', from: 15 * H + 10 * M, to: 15 * H + 13 * M },
  { kind: 'proximity', target: 'G6-F1', from: 15 * H + 40 * M, to: 15 * H + 42 * M },
  // 闭馆后 21:10 有人进入考古展示室
  { kind: 'motion', target: 'G3', from: 21 * H + 10 * M, to: 21 * H + 15 * M },
];

export interface MuseumDayOptions {
  seed: string;
}

export interface ObjectState {
  status: ObjectStatus;
  location: string | null;
}

/**
 * 一天的博物馆：环境读数、来馆者和警卫、藏品的光照量和公开天数、换展计划和 RFID 记录。
 * 全部由种子和时刻算出，种子固定时完全可复现；页面可以直接从 0 点「预跑」到当前时刻。
 */
export function createMuseumDay(museum: Museum, options: MuseumDayOptions) {
  const { seed } = options;
  const people = createPeople(museum, seed);
  const intrusion = (roomCode: string, t: number) =>
    SECURITY_EVENTS.some((e) => e.kind === 'motion' && e.target === roomCode && t >= e.from && t < e.to);
  const occupancy = people.occupancy;
  const env = createEnvironment(museum, seed, occupancy);
  const event = (kind: string, target: string, t: number) =>
    SECURITY_EVENTS.some((e) => e.kind === kind && e.target === target && t >= e.from && t < e.to);
  const dev = (code: string) => museum.deviceByCode(code).id;
  const unitOf = (code: string) =>
    code.includes('-') && !code.startsWith('ST-')
      ? museum.caseByCode(code).unitId
      : museum.roomByCode(code).unitId;

  // 换展计划和 RFID 读取记录
  const inCase = (code: string, k = 0) => museum.objectsAt(museum.caseByCode(code).unitId)[k]!;
  const stored = museum.objects.filter((o) => o.status === 'storage' && o.series === 'minato-100');
  const onLoan = museum.objects.filter((o) => o.status === 'loan');
  const inConservation = museum.objects.filter((o) => o.status === 'conservation');
  const moves: ObjectMove[] = [
    {
      id: 'MV-01',
      objectId: inCase('G9-W1').id,
      from: unitOf('G9-W1'),
      to: unitOf('ST-B'),
      at: 8 * H + 40 * M,
    },
    { id: 'MV-02', objectId: stored[0]!.id, from: unitOf('ST-B'), to: unitOf('G9-W1'), at: 8 * H + 50 * M },
    {
      id: 'MV-03',
      objectId: onLoan.find((o) => o.material === 'textile')!.id,
      from: unitOf('DOCK'),
      to: unitOf('ST-B'),
      at: 9 * H,
    },
    { id: 'MV-04', objectId: inConservation[0]!.id, from: unitOf('TMP'), to: unitOf('G1-W2'), at: 10 * H },
    { id: 'MV-05', objectId: inCase('SP1-F1').id, from: unitOf('SP1-F1'), to: unitOf('DOCK'), at: 11 * H },
    { id: 'MV-06', objectId: inCase('G6-W2').id, from: unitOf('G6-W2'), to: unitOf('ST-B'), at: 16 * H },
  ];
  const read = (objectId: string, reader: string, time: number): RfidRead => ({
    objectId,
    deviceId: dev(reader),
    time,
  });
  const rfidReads: RfidRead[] = [
    read(moves[0]!.objectId, 'RFID-G9', 8 * H + 41 * M),
    read(moves[0]!.objectId, 'RFID-ST-B', 8 * H + 47 * M),
    read(moves[1]!.objectId, 'RFID-ST-B', 8 * H + 51 * M),
    read(moves[1]!.objectId, 'RFID-G9', 8 * H + 57 * M),
    read(moves[2]!.objectId, 'RFID-DOCK', 9 * H + 2 * M),
    // 借出归还的染织放进了收藏库 A，不是计划的 B
    read(moves[2]!.objectId, 'RFID-ST-A', 9 * H + 9 * M),
    read(moves[3]!.objectId, 'RFID-TMP', 10 * H + M),
    read(moves[3]!.objectId, 'RFID-G1', 10 * H + 8 * M),
  ];
  /** 换展作业中的展示柜：计划时刻前 10 分钟到后 30 分钟 */
  const openCasesAt = (t: number) =>
    new Set(
      moves
        .flatMap((m) => [m.from, m.to])
        .filter((id) => museum.isCase(id))
        .filter((id) =>
          moves.some((m) => (m.from === id || m.to === id) && t >= m.at - 10 * M && t < m.at + 30 * M),
        ),
    );

  /** t 时刻藏品的状态和位置：按读写器确认完成的移动更新 */
  const objectState = (o: MuseumObject, t: number): ObjectState => {
    let state: ObjectState = { status: o.status, location: o.location };
    for (const r of checkMoves(
      museum,
      moves.filter((m) => m.objectId === o.id),
      rfidReads,
      t,
    )) {
      if (r.status !== 'done') continue;
      const to = r.move.to;
      state = { status: museum.isCase(to) ? 'display' : 'storage', location: to };
    }
    return state;
  };
  /** 今天在展示柜里的时段（移动完成前后各算一段）；计划和读取记录不变，算一次就缓存 */
  const placementCache = new Map<string, { unitId: string; from: number; to: number }[]>();
  const placements = (o: MuseumObject) => {
    const hit = placementCache.get(o.id) ?? computePlacements(o);
    placementCache.set(o.id, hit);
    return hit;
  };
  const computePlacements = (o: MuseumObject) => {
    const out: { unitId: string; from: number; to: number }[] = [];
    let current = o.status === 'display' ? o.location : null;
    let since = 0;
    for (const r of checkMoves(
      museum,
      moves.filter((m) => m.objectId === o.id),
      rfidReads,
      DAY,
    )) {
      if (r.status !== 'done' || !r.lastRead) continue;
      if (current) out.push({ unitId: current, from: since, to: r.lastRead.time });
      current = museum.isCase(r.move.to) ? r.move.to : null;
      since = r.lastRead.time;
    }
    if (current) out.push({ unitId: current, from: since, to: DAY });
    return out;
  };

  // 每个展示柜今天的累计光照量，按分钟存一张表
  const cumulative = new Map<string, Float64Array>();
  const cumOf = (unitId: string) => {
    let row = cumulative.get(unitId);
    if (row) return row;
    row = new Float64Array(MINUTES + 1);
    for (let m = 1; m <= MINUTES; m++) {
      const a = env.illuminance(unitId, (m - 1) * M);
      const b = env.illuminance(unitId, m * M);
      row[m] = row[m - 1]! + ((a + b) / 2) * (1 / 60);
    }
    cumulative.set(unitId, row);
    return row;
  };
  const exposureIn = (unitId: string, from: number, to: number) => {
    const row = cumOf(unitId);
    const idx = (t: number) => Math.max(0, Math.min(MINUTES, Math.floor(t / M)));
    return to <= from ? 0 : row[idx(to)]! - row[idx(from)]!;
  };

  // 今天之前的累计光照量：展出天数 × 每天的设定照度 × 开灯时长，加上之前展出时的一点余量
  const litHours = (OPENING_HOURS.lightsOff - OPENING_HOURS.lightsOn) / H;
  const priorLxh = new Map<string, number>();
  const priorDays = new Map<string, number>();
  for (const o of museum.objects) {
    const standard = STANDARDS[museum.sensitivityOf(o)];
    const jitter = 0.9 + 0.2 * unit(`${seed}/${o.code}/dose`);
    let lxh = standard.maxLux * 0.9 * litHours * 30 * unit(`${seed}/${o.code}/earlier`);
    let days = 0;
    if (o.status === 'display' && o.location) {
      const c = museum.isCase(o.location) ? museum.case(o.location) : null;
      const room = museum.roomOf(o.location);
      const designated = c && o.designated ? DISPLAYED_DAYS[c.code] : undefined;
      days = designated ?? DAY_OF_YEAR - (ON_DISPLAY_SINCE[room.code] ?? DAY_OF_YEAR);
      lxh += standard.maxLux * 0.9 * litHours * days * jitter;
    }
    priorLxh.set(o.id, lxh);
    priorDays.set(o.id, days);
  }

  const exposureAt = (o: MuseumObject, t: number) =>
    priorLxh.get(o.id)! +
    placements(o).reduce((sum, p) => sum + exposureIn(p.unitId, p.from, Math.min(t, p.to)), 0);
  /** 近 7 天的平均每日光照量：今天之前按设定照度，演示里取今天开灯时段的量 */
  const dailyAverage = (o: MuseumObject) => {
    const p = placements(o)[0];
    return p ? exposureIn(p.unitId, 0, DAY) : 0;
  };
  const displayDaysAt = (o: MuseumObject, t: number) =>
    priorDays.get(o.id)! + (placements(o).some((p) => p.from <= t && t >= OPENING_HOURS.open) ? 1 : 0);

  const readingAt = (deviceId: string, t: number): SensorReading => {
    const d = museum.device(deviceId);
    const { online, battery } = env.status(d, t);
    const roomId = museum.roomOf(d.unitId).unitId;
    const code = museum.isCase(d.unitId) ? museum.case(d.unitId).code : museum.room(d.unitId).code;
    let values: Record<string, number> = {};
    switch (d.kind) {
      case 'climate':
        values = env.climate(d.unitId, t);
        break;
      case 'light': {
        const lux = env.illuminance(d.unitId, t);
        values = { illuminance: lux, uv: lux > 5 ? 8 + wave(`${seed}/${code}/uv`, t, 1) : 0 };
        break;
      }
      case 'co2':
        values = { co2: env.co2(roomId, t) };
        break;
      case 'counter':
        values = { count: occupancy(roomId, t) };
        break;
      case 'motion':
        values = { motion: occupancy(roomId, t) > 0 || intrusion(code, t) ? 1 : 0 };
        break;
      case 'door':
        values = { open: event('door', code, t) || openCasesAt(t).has(d.unitId) ? 1 : 0 };
        break;
      case 'vibration':
        values = {
          acceleration: event('vibration', code, t)
            ? 0.9
            : 0.04 + Math.abs(wave(`${seed}/${code}/vib`, t, 0.03)),
        };
        break;
      case 'proximity':
        values = { near: event('proximity', code, t) ? 1 : 0 };
        break;
    }
    return { deviceId, online, battery, values };
  };

  const taggedAt = (t: number) =>
    people.visitors.flatMap((v) => {
      if (!v.tagged || t < v.enteredAt || t >= v.exitedAt) return [];
      const p = people.positionOf(v.segments, t);
      return p ? [{ id: v.id, ...p }] : [];
    });

  return {
    museum,
    visitors: people.visitors,
    guards: people.guards,
    rounds: people.rounds,
    passes: people.passes,
    moves,
    rfidReads,
    /** 全部设备在 t 时刻的读数 */
    readings: (t: number) => museum.devices.map((d) => readingAt(d.id, t)),
    reading: readingAt,
    /**
     * 房间或展示柜某项指标的曲线（一个设备的读数）；没有对应设备时为空。
     * 离线时段没有读数。
     */
    series(unitId: string, metric: Metric, from: number, to: number, step = 10 * M) {
      const kind =
        metric === 'temperature' || metric === 'humidity'
          ? 'climate'
          : metric === 'illuminance'
            ? 'light'
            : 'co2';
      const device = museum.devicesAt(unitId).find((d) => d.kind === kind);
      if (!device) return [];
      const out: { time: number; value: number }[] = [];
      for (let t = from; t <= to; t += step) {
        const r = readingAt(device.id, t);
        if (r.online) out.push({ time: t, value: r.values[metric]! });
      }
      return out;
    },
    occupancy,
    /** 截至 t 时刻今天入馆的人数（出入口计数相机） */
    entriesUntil: (t: number) => people.visitors.filter((v) => v.enteredAt <= t).length,
    /** t 时刻在馆内的人数 */
    insideAt: (t: number) => people.visitors.filter((v) => v.enteredAt <= t && t < v.exitedAt).length,
    /** 携带标签的来馆者的位置；在房间里停留时带房间和展示柜 */
    taggedAt,
    guardAt: (guardId: string, t: number) => people.guardAt(people.guards.find((g) => g.id === guardId)!, t),
    missedUntil: people.missedUntil,
    openCasesAt,
    objectState,
    exposureAt,
    dailyAverage,
    displayDaysAt,
    /** 告警引擎要的馆内状态 */
    snapshotAt(t: number): MuseumSnapshot {
      const occupancyMap = new Map<string, number>();
      for (const r of museum.rooms) {
        if (r.capacity === null) continue;
        occupancyMap.set(r.unitId, occupancy(r.unitId, t));
      }
      return {
        now: t,
        readings: museum.devices.map((d) => readingAt(d.id, t)),
        occupancy: occupancyMap,
        taggedVisitors: taggedAt(t).flatMap((p) => (p.roomId ? [{ id: p.id, unitId: p.roomId }] : [])),
        objects: museum.objects
          .filter((o) => objectState(o, t).status === 'display')
          .map((o) => ({ objectId: o.id, lxh: exposureAt(o, t), displayDays: displayDaysAt(o, t) })),
        openCases: openCasesAt(t),
        missedCheckpoints: people.missedUntil(t),
      };
    },
    /** 一位来馆者到 t 时刻为止的轨迹（每 10 秒一个点），用于回放 */
    samples(visitorId: string, t: number, stepMs = 10_000) {
      const v = people.visitors.find((x) => x.id === visitorId)!;
      const out: { time: number; levelId: string; coord: [number, number] }[] = [];
      for (let x = v.enteredAt; x < Math.min(t, v.exitedAt); x += stepMs) {
        const p = people.positionOf(v.segments, x);
        if (p) out.push({ time: x, levelId: p.levelId, coord: p.coord });
      }
      return out;
    },
    /** 到 t 时刻为止，带标签的来馆者在每个展示柜前的平均停留时间 */
    dwellByCase(t: number) {
      const sums = new Map<string, { total: number; count: number }>();
      for (const v of people.visitors) {
        if (!v.tagged) continue;
        for (const s of v.segments) {
          if (s.kind !== 'stay' || !s.caseId || s.from > t) continue;
          const e = sums.get(s.caseId) ?? { total: 0, count: 0 };
          e.total += Math.min(t, s.to) - s.from;
          e.count++;
          sums.set(s.caseId, e);
        }
      }
      return new Map([...sums].map(([id, e]) => [id, { averageMs: e.total / e.count, count: e.count }]));
    },
  };
}
export type MuseumDay = ReturnType<typeof createMuseumDay>;
