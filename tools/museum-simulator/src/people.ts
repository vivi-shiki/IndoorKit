import {
  checkPatrol,
  type Museum,
  OPENING_HOURS,
  type Route,
  type RoutePoint,
  scheduleOf,
} from '@indoorkit/museum';
import { random } from './random';

const H = 3600_000;
const M = 60_000;
const S = 1000;
/** 参观时的步行速度 0.9 m/s；警卫 1.1 m/s 由巡逻路线的时间决定 */
const WALK_MPS = 0.9;
/** 坐电梯换一层算 40 秒 */
const ELEVATOR_MS = 40 * S;

type XY = [number, number];

/** 一段时间里的动作：沿路线走，或者停在一个地方（展示柜前、房间里） */
export type Segment =
  | { kind: 'walk'; from: number; to: number; path: RoutePoint[]; cum: number[] }
  | {
      kind: 'stay';
      from: number;
      to: number;
      levelId: string;
      coord: XY;
      roomId: string;
      caseId: string | null;
    };

export interface Visitor {
  id: string;
  /** 携带 BLE 标签、会上报位置的来馆者（约 30 %） */
  tagged: boolean;
  language: 'ja' | 'en' | 'zh';
  enteredAt: number;
  exitedAt: number;
  segments: Segment[];
}

export interface Guard {
  id: string;
  /** 巡逻路线；在大厅值守的警卫为 null */
  routeCode: string | null;
}

export interface PatrolRound {
  guardId: string;
  routeCode: string;
  start: number;
  /** 每个路线点的实际时刻（含停留造成的延误） */
  times: number[];
  /** 漏掉的检查点 */
  skipped: string[];
}

/** 每半小时入馆的人数（工作日，9:30 开馆，16:30 停止入馆） */
const ARRIVALS = [60, 95, 110, 120, 115, 100, 80, 95, 110, 105, 90, 70, 45, 25];

/** 人多的展示柜：指定文化财和浮世绘、企划展的柜前停留更久 */
const POPULAR = /^(G6-W1|G7-W2|SP2-W2|G9-|SP1-F)/;

const metersPerDegree = (lat: number) => ({ x: 111_320 * Math.cos((lat * Math.PI) / 180), y: 110_540 });

export function createPeople(museum: Museum, seed: string) {
  const lat = museum.venue.center[1];
  const mpd = metersPerDegree(lat);
  const dist = (a: RoutePoint, b: RoutePoint) =>
    a.levelId !== b.levelId
      ? ELEVATOR_MS / 1000
      : Math.hypot((a.coord[0] - b.coord[0]) * mpd.x, (a.coord[1] - b.coord[1]) * mpd.y);
  const walk = (from: number, path: RoutePoint[], mps = WALK_MPS): Segment & { kind: 'walk' } => {
    const cum = [0];
    for (let i = 1; i < path.length; i++) {
      const d =
        path[i - 1]!.levelId !== path[i]!.levelId ? (ELEVATOR_MS / 1000) * mps : dist(path[i - 1]!, path[i]!);
      cum.push(cum[i - 1]! + d);
    }
    return { kind: 'walk', from, to: from + (cum.at(-1)! / mps) * 1000, path, cum };
  };
  /** 展示柜前站的位置：从柜中心往房间中心方向离开 1.6 m */
  const standPoint = (caseId: string): XY => {
    const c = museum.case(caseId);
    const room = museum.room(c.roomId);
    const dx = (room.center[0] - c.center[0]) * mpd.x;
    const dy = (room.center[1] - c.center[1]) * mpd.y;
    const len = Math.hypot(dx, dy) || 1;
    return [c.center[0] + ((dx / len) * 1.6) / mpd.x, c.center[1] + ((dy / len) * 1.6) / mpd.y];
  };

  const lobby = museum.roomByCode('LOBBY');
  const galleries = museum.rooms.filter((r) => r.kind === 'gallery' || r.kind === 'special');
  const tourRooms = (code: string) => museum.route(code).stops.map((s) => s.unitId);
  const PROGRAMS: [number, () => string[]][] = [
    [0.45, () => tourRooms('TOUR-HIGHLIGHTS')],
    [0.2, () => tourRooms('TOUR-JAPAN')],
    [0.25, () => tourRooms('TOUR-SPECIAL')],
  ];

  const visitors: Visitor[] = [];
  const rng = random(`${seed}/visitors`);
  const closeBy = OPENING_HOURS.close - 5 * M;

  /** 排一位来馆者：从大厅出发，依次参观房间，每间看一到三个展示柜，最后回大厅离馆 */
  const plan = (
    id: string,
    enteredAt: number,
    rooms: string[],
    options: { tagged: boolean; stayMs?: number; cases?: number } = { tagged: false },
  ) => {
    const segments: Segment[] = [];
    let t = enteredAt;
    let here: RoutePoint = { levelId: lobby.levelId, coord: lobby.center };
    let hereRoom = lobby.unitId;
    const go = (target: RoutePoint, targetRoom: string) => {
      const path =
        hereRoom === targetRoom
          ? [here, target]
          : [here, ...museum.walkPath(hereRoom, targetRoom).slice(1, -1), target];
      const leg = walk(t, path);
      segments.push(leg);
      t = leg.to;
      here = target;
      hereRoom = targetRoom;
    };
    const stay = (ms: number, caseId: string | null) => {
      segments.push({
        kind: 'stay',
        from: t,
        to: t + ms,
        levelId: here.levelId,
        coord: here.coord,
        roomId: hereRoom,
        caseId,
      });
      t += ms;
    };
    for (const roomId of rooms) {
      if (t > closeBy - 25 * M) break;
      const room = museum.room(roomId);
      const cases = museum.casesIn(roomId);
      const n = cases.length === 0 ? 0 : (options.cases ?? 2 + Math.floor(rng() * 3));
      if (n === 0) {
        go({ levelId: room.levelId, coord: room.center }, roomId);
        stay(options.stayMs ?? (2 + rng() * 4) * M, null);
        continue;
      }
      const chosen = [...cases].sort(() => rng() - 0.5).slice(0, n);
      for (const c of chosen) {
        go({ levelId: c.levelId, coord: standPoint(c.unitId) }, roomId);
        const popular = POPULAR.test(c.code) ? 1.8 : 1;
        stay(options.stayMs ?? (60 + rng() * 150) * S * popular, c.unitId);
      }
    }
    go({ levelId: lobby.levelId, coord: lobby.center }, lobby.unitId);
    stay(2 * M, null);
    const visitor: Visitor = {
      id,
      tagged: options.tagged,
      language: rng() < 0.7 ? 'ja' : rng() < 0.67 ? 'en' : 'zh',
      enteredAt,
      exitedAt: t,
      segments,
    };
    visitors.push(visitor);
    return visitor;
  };

  let seq = 0;
  const nextId = () => `V-${String(++seq).padStart(4, '0')}`;
  ARRIVALS.forEach((count, slot) => {
    for (let i = 0; i < count; i++) {
      const enteredAt = OPENING_HOURS.open + slot * 30 * M + rng() * 30 * M;
      const r = rng();
      let acc = 0;
      let rooms: string[] | null = null;
      for (const [share, program] of PROGRAMS) {
        acc += share;
        if (r < acc) {
          rooms = program().filter(() => rng() > 0.15);
          break;
        }
      }
      rooms ??= [...galleries]
        .sort(() => rng() - 0.5)
        .slice(0, 4)
        .map((g) => g.unitId);
      plan(nextId(), enteredAt, rooms, { tagged: rng() < 0.3 });
    }
  });
  // 13:40 一个 50 人的学校团体在企划展示室 1 听讲解 40 分钟，展示室超过定员
  for (let i = 0; i < 50; i++) {
    plan(
      `GT-${String(i + 1).padStart(2, '0')}`,
      13 * H + 35 * M + i * 6 * S,
      [museum.roomByCode('SP1').unitId],
      {
        tagged: false,
        stayMs: 40 * M,
        cases: 1,
      },
    );
  }
  // 14:15 一位带标签的来馆者走进 3F 的学芸员室（非公开）
  plan('V-LOST', 14 * H + 6 * M, [museum.roomByCode('G9').unitId, museum.roomByCode('OFFICE').unitId], {
    tagged: true,
    stayMs: 3 * M,
    cases: 1,
  });

  const positionOf = (segments: readonly Segment[], t: number) => {
    const s = segments.find((x) => t >= x.from && t < x.to) ?? null;
    if (!s) return null;
    if (s.kind === 'stay') return { levelId: s.levelId, coord: s.coord, roomId: s.roomId, caseId: s.caseId };
    const d = ((t - s.from) / (s.to - s.from)) * s.cum.at(-1)!;
    let i = 1;
    while (i < s.cum.length - 1 && s.cum[i]! < d) i++;
    const a = s.path[i - 1]!;
    const b = s.path[i]!;
    const span = s.cum[i]! - s.cum[i - 1]!;
    const k = span === 0 ? 1 : (d - s.cum[i - 1]!) / span;
    if (a.levelId !== b.levelId)
      return {
        levelId: k < 0.5 ? a.levelId : b.levelId,
        coord: k < 0.5 ? a.coord : b.coord,
        roomId: null,
        caseId: null,
      };
    return {
      levelId: a.levelId,
      coord: [a.coord[0] + (b.coord[0] - a.coord[0]) * k, a.coord[1] + (b.coord[1] - a.coord[1]) * k] as XY,
      roomId: null,
      caseId: null,
    };
  };

  // 每分钟各房间的人数（停留中的来馆者），按房间存一张表
  const MINUTES = 24 * 60;
  const table = new Map<string, Int16Array>();
  for (const v of visitors) {
    for (const s of v.segments) {
      if (s.kind !== 'stay') continue;
      const row = table.get(s.roomId) ?? new Int16Array(MINUTES + 1);
      table.set(s.roomId, row);
      for (let m = Math.ceil(s.from / M); m < s.to / M && m <= MINUTES; m++) row[m]!++;
    }
  }
  const minuteOf = (t: number) => Math.max(0, Math.min(MINUTES, Math.floor(t / M)));

  // 警卫：两人按路线 A、B 每两小时巡逻一圈，一人在大厅值守
  const guards: Guard[] = [
    { id: 'SG-01', routeCode: 'PATROL-A' },
    { id: 'SG-02', routeCode: 'PATROL-B' },
    { id: 'SG-03', routeCode: null },
  ];
  const rounds: PatrolRound[] = [];
  const roundStarts = [9, 11, 13, 15, 17.5];
  for (const g of guards) {
    if (!g.routeCode) continue;
    const route = museum.route(g.routeCode);
    const offset = g.id === 'SG-02' ? 15 * M : 0;
    for (const h of roundStarts) {
      const start = h * H + offset;
      let times = scheduleOf(route, start);
      const skipped: string[] = [];
      // 11:00 那一圈 SG-01 在 1F 商店前被来馆者问路，耽搁 8 分钟
      if (g.id === 'SG-01' && h === 11) {
        const k = route.stops.find((s) => s.code === 'CP-SHOP')!.index;
        times = times.map((x, i) => (i >= k ? x + 8 * M : x));
      }
      // 11:15 那一圈 SG-02 漏掉 3F 染织展示室的检查点
      if (g.id === 'SG-02' && h === 11) skipped.push('CP-G8');
      rounds.push({ guardId: g.id, routeCode: g.routeCode, start, times, skipped });
    }
  }
  const passes = rounds.flatMap((r) =>
    museum
      .route(r.routeCode)
      .stops.filter((s) => !r.skipped.includes(s.code))
      .map((s) => ({
        guardId: r.guardId,
        routeCode: r.routeCode,
        round: r.start,
        code: s.code,
        time: r.times[s.index]!,
      })),
  );

  const guardAt = (g: Guard, t: number) => {
    if (!g.routeCode) {
      return {
        levelId: lobby.levelId,
        coord: [lobby.center[0] + 4 / mpd.x, lobby.center[1]] as XY,
        round: null,
      };
    }
    const route = museum.route(g.routeCode);
    const round = rounds.find((r) => r.guardId === g.id && t >= r.start && t < r.times.at(-1)!);
    if (!round) return { ...route.path[0]!, round: null };
    let i = 1;
    while (i < round.times.length - 1 && round.times[i]! <= t) i++;
    const a = route.path[i - 1]!;
    const b = route.path[i]!;
    const span = round.times[i]! - round.times[i - 1]!;
    const k = span <= 0 ? 1 : Math.min(1, (t - round.times[i - 1]!) / span);
    if (a.levelId !== b.levelId) return { ...(k < 0.5 ? a : b), round };
    return {
      levelId: a.levelId,
      coord: [a.coord[0] + (b.coord[0] - a.coord[0]) * k, a.coord[1] + (b.coord[1] - a.coord[1]) * k] as XY,
      round,
    };
  };

  return {
    visitors,
    guards,
    rounds,
    passes,
    /** 某个房间在 t 时刻的人数 */
    occupancy: (roomId: string, t: number) => table.get(roomId)?.[minuteOf(t)] ?? 0,
    positionOf,
    guardAt,
    /** 截至 t 时刻漏掉的检查点 */
    missedUntil(t: number) {
      return rounds
        .filter((r) => r.start <= t)
        .flatMap((r) => {
          const route: Route = museum.route(r.routeCode);
          const mine = passes.filter((p) => p.guardId === r.guardId && p.round === r.start);
          return checkPatrol(route, r.start, mine, t)
            .filter((c) => c.status === 'missed')
            .map((c) => ({
              key: `${r.routeCode}:${r.start}:${c.code}`,
              unitId: c.unitId,
              time: c.due + 5 * M,
            }));
        });
    },
  };
}
export type People = ReturnType<typeof createPeople>;
