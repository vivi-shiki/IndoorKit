import {
  type Asset,
  dayTime,
  departmentsOf,
  MOBILE_ASSET_TYPES,
  type Person,
  type Role,
  sosActive,
  statusAt,
} from '@indoorkit/hospital';
import type { VenueModel } from '@indoorkit/imdf';
import type { TagPosition } from '@indoorkit/rtls';
import { createRoster, seededRandom } from './roster';

export interface SimulationOptions {
  seed: string;
  /** 人员数 */
  tags: number;
  /** 设备数，默认 0 */
  assets?: number;
  /** 定位误差的标准差（米），默认 0.8；误差不超过两倍标准差，0 表示不加误差 */
  noiseMeters?: number;
}

export interface Simulation {
  /** 模拟时间（毫秒），从 0 开始 */
  readonly time: number;
  positions(): TagPosition[];
  /** 推进 dtMs 毫秒并返回所有标签的新位置 */
  step(dtMs: number): TagPosition[];
}

type Vec = [number, number];
type Box = [number, number, number, number];

interface Unit {
  id: string;
  levelId: string;
  category: string;
  box: Box;
  center: Vec;
  /** 房间的门：门中点、走廊一侧的落脚点、所连走廊 */
  door?: { mid: Vec; entry: Vec; walkway: Unit };
}

interface Tag {
  id: string;
  person?: Person;
  asset?: Asset;
  /** 所属科室的房间 */
  home: Unit[];
  /** 下一个目的地留在本科室的概率 */
  stay: number;
  /** 固定设备不移动 */
  fixed: boolean;
  /** 跨楼层时最终要去的房间 */
  goal: Unit | null;
  levelId: string;
  pos: Vec;
  /** 上报的位置：真实位置加上定位误差 */
  reported: Vec;
  speed: number;
  unit: Unit;
  path: Vec[];
  target: Unit | null;
  dwell: number;
  /** 到达电梯或楼梯后要去的楼层 */
  nextLevel: string | null;
}

const EPS = 1e-6;
const VERTICAL = new Set(['elevator', 'stairs']);

/** 各角色下一个目的地留在本科室的概率 */
const STAY: Record<Role, number> = {
  doctor: 0.7,
  nurse: 0.8,
  patient: 0.85,
  visitor: 0.85,
  caregiver: 0.6,
  security: 0.1,
};
const MOBILE_STAY = 0.5;
const DEFAULT_NOISE = 0.8;
/** 加误差后离单元边缘至少这么远，墙厚 0.2 m，所以不会落进墙里 */
const NOISE_MARGIN = 0.3;

function boxOf(geometry: GeoJSON.Geometry): Box {
  const ring = (geometry as GeoJSON.Polygon).coordinates[0]!;
  const xs = ring.map((p) => p[0]!);
  const ys = ring.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const onBoxEdge = ([x0, y0, x1, y1]: Box, [x, y]: Vec) =>
  x >= x0 - EPS &&
  x <= x1 + EPS &&
  y >= y0 - EPS &&
  y <= y1 + EPS &&
  (Math.abs(x - x0) < EPS || Math.abs(x - x1) < EPS || Math.abs(y - y0) < EPS || Math.abs(y - y1) < EPS);
const inBox = ([x0, y0, x1, y1]: Box, [x, y]: Vec) => x > x0 && x < x1 && y > y0 && y < y1;

/**
 * 在场馆的走廊和房间里移动的定位标签。
 * 标签只沿「房间中心 → 门 → 走廊 → 连廊 → 走廊 → 门 → 房间中心」直线行走，
 * 只在电梯或楼梯里换层，所以不会穿墙。坐标内部用米，输出经纬度。
 */
export function createSimulation(venue: VenueModel, options: SimulationOptions): Simulation {
  const noise = options.noiseMeters ?? DEFAULT_NOISE;
  if (!(noise >= 0)) throw new Error(`noiseMeters must be 0 or more, got ${options.noiseMeters}`);
  const rand = seededRandom(options.seed);
  // 误差用单独的随机数，路线和不加误差时完全一样
  const noiseRand = seededRandom(`${options.seed}/noise`);
  const roster = createRoster(venue, { people: options.tags, assets: options.assets ?? 0 });
  const [lng0, lat0] = venue.center;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const mPerLat = 110_540;
  const toM = ([lng, lat]: Vec): Vec => [(lng - lng0) * mPerLng, (lat - lat0) * mPerLat];
  const toLngLat = ([x, y]: Vec): [number, number] => [lng0 + x / mPerLng, lat0 + y / mPerLat];

  const units: Unit[] = venue.features.units.features.map((f) => {
    const [a, b, c, d] = boxOf(f.geometry);
    const [x0, y0] = toM([a, b]);
    const [x1, y1] = toM([c, d]);
    return {
      id: f.properties.id,
      levelId: f.properties.level_id,
      category: f.properties.category,
      box: [x0, y0, x1, y1],
      center: [(x0 + x1) / 2, (y0 + y1) / 2],
    };
  });
  const walkways = units.filter((u) => u.category === 'walkway');
  const rooms = units.filter((u) => u.category !== 'walkway');

  for (const o of venue.features.openings.features) {
    const [a, b] = o.geometry.coordinates.map((p) => toM(p as Vec)) as [Vec, Vec];
    const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const levelId = o.properties.level_id;
    const room = rooms.find((u) => u.levelId === levelId && onBoxEdge(u.box, mid));
    const walkway = walkways.find((u) => u.levelId === levelId && onBoxEdge(u.box, mid));
    if (!room || !walkway) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const normal: Vec = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const candidates: Vec[] = [
      [mid[0] + normal[0] * 0.5, mid[1] + normal[1] * 0.5],
      [mid[0] - normal[0] * 0.5, mid[1] - normal[1] * 0.5],
    ];
    const entry = candidates.find((p) => inBox(walkway.box, p));
    if (entry) room.door = { mid, entry, walkway };
  }
  const reachable = rooms.filter((r) => r.door);
  const unitsByLevel = new Map<string, Unit[]>();
  for (const u of units) unitsByLevel.set(u.levelId, [...(unitsByLevel.get(u.levelId) ?? []), u]);

  /**
   * 模拟 RTLS 的定位误差：真实位置加上截断在两倍标准差内的高斯误差，
   * 再收回到真实位置所在单元的内侧，不会穿墙，也不会换房间。
   */
  const observe = (tag: Tag): Vec => {
    if (noise === 0) return tag.pos;
    const [x, y] = tag.pos;
    const unit = unitsByLevel
      .get(tag.levelId)!
      .find((u) => onBoxEdge(u.box, tag.pos) || inBox(u.box, tag.pos));
    if (!unit) throw new Error(`tag ${tag.id} at ${tag.pos} is outside every unit of ${tag.levelId}`);
    const r = Math.min(noise * Math.sqrt(-2 * Math.log(1 - noiseRand())), 2 * noise);
    const angle = noiseRand() * 2 * Math.PI;
    const [x0, y0, x1, y1] = unit.box;
    const clamp = (v: number, lo: number, hi: number) => {
      if (hi - lo < 2 * NOISE_MARGIN) return (lo + hi) / 2;
      return Math.min(Math.max(v, lo + NOISE_MARGIN), hi - NOISE_MARGIN);
    };
    return [clamp(x + r * Math.cos(angle), x0, x1), clamp(y + r * Math.sin(angle), y0, y1)];
  };

  // 走廊之间共用一条边即相连，经过共用边的中点
  const portals = new Map<Unit, { to: Unit; at: Vec }[]>();
  for (const a of walkways) {
    const links: { to: Unit; at: Vec }[] = [];
    for (const b of walkways) {
      if (a === b || a.levelId !== b.levelId) continue;
      const [ax0, ay0, ax1, ay1] = a.box;
      const [bx0, by0, bx1, by1] = b.box;
      const ylo = Math.max(ay0, by0);
      const yhi = Math.min(ay1, by1);
      const xlo = Math.max(ax0, bx0);
      const xhi = Math.min(ax1, bx1);
      if ((Math.abs(ax1 - bx0) < EPS || Math.abs(bx1 - ax0) < EPS) && yhi - ylo > EPS) {
        links.push({ to: b, at: [Math.abs(ax1 - bx0) < EPS ? ax1 : ax0, (ylo + yhi) / 2] });
      } else if ((Math.abs(ay1 - by0) < EPS || Math.abs(by1 - ay0) < EPS) && xhi - xlo > EPS) {
        links.push({ to: b, at: [(xlo + xhi) / 2, Math.abs(ay1 - by0) < EPS ? ay1 : ay0] });
      }
    }
    portals.set(a, links);
  }

  /** 走廊图上的最少换段路径（BFS），返回途经的共用边中点 */
  const walkwayRoute = (from: Unit, to: Unit): Vec[] => {
    const prev = new Map<Unit, { from: Unit; at: Vec }>();
    const queue = [from];
    const seen = new Set([from]);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (cur === to) break;
      for (const link of portals.get(cur) ?? []) {
        if (seen.has(link.to)) continue;
        seen.add(link.to);
        prev.set(link.to, { from: cur, at: link.at });
        queue.push(link.to);
      }
    }
    const points: Vec[] = [];
    for (let u = to; u !== from; ) {
      const p = prev.get(u);
      if (!p) throw new Error(`walkway ${to.id} is not reachable from ${from.id}`);
      points.unshift(p.at);
      u = p.from;
    }
    return points;
  };

  const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;

  const plan = (tag: Tag) => {
    const here = tag.unit;
    if (!tag.goal) {
      // 本科室里优先去同一层的房间，少走楼梯
      const others = tag.home.filter((r) => r !== here);
      const sameLevel = others.filter((r) => r.levelId === tag.levelId);
      const home = sameLevel.length > 0 && rand() < 0.7 ? sameLevel : others;
      const anywhere = reachable.filter((r) => r !== here && !VERTICAL.has(r.category));
      tag.goal = home.length > 0 && rand() < tag.stay ? pick(home) : pick(anywhere);
    }
    const goal = tag.goal;
    // 目的地在别的楼层时先去本层的电梯或楼梯
    const vertical = reachable.filter((r) => r.levelId === tag.levelId && VERTICAL.has(r.category));
    const target = goal.levelId === tag.levelId ? goal : pick(vertical);
    const path: Vec[] = [];
    let walkway: Unit;
    if (here.door) {
      path.push(here.door.mid, here.door.entry);
      walkway = here.door.walkway;
    } else {
      walkway = here;
    }
    path.push(...walkwayRoute(walkway, target.door!.walkway));
    path.push(target.door!.entry, target.door!.mid, target.center);
    tag.path = path;
    tag.target = target;
    tag.nextLevel = target === goal ? null : goal.levelId;
    if (target === goal) tag.goal = null;
  };

  const arrive = (tag: Tag) => {
    tag.unit = tag.target!;
    tag.target = null;
    // 进了电梯或楼梯先等一会儿，再换层；被推走的设备到了之后会放一段时间
    if (tag.nextLevel) tag.dwell = 2000 + rand() * 3000;
    else if (tag.asset) tag.dwell = 120_000 + rand() * 240_000;
    else if (tag.home.includes(tag.unit)) tag.dwell = 60_000 + rand() * 180_000;
    else tag.dwell = 5000 + rand() * 25_000;
  };

  /** 在电梯或楼梯里换到目标楼层的同一位置，换层前后都在竖向交通间里 */
  const changeLevel = (tag: Tag) => {
    const from = tag.unit;
    const same = reachable.filter((r) => r.levelId === tag.nextLevel && r.category === from.category);
    const distance = (r: Unit) => Math.hypot(r.center[0] - from.center[0], r.center[1] - from.center[1]);
    const there = same.reduce((best, r) => (distance(r) < distance(best) ? r : best));
    tag.levelId = there.levelId;
    tag.unit = there;
    tag.pos = [...there.center];
    tag.nextLevel = null;
    tag.dwell = 1000 + rand() * 2000;
  };

  const destinations = reachable.filter((r) => !VERTICAL.has(r.category));
  const owner = new Map<string, string>();
  for (const d of departmentsOf(venue)) for (const id of d.unitIds) owner.set(id, d.id);
  const homeOf = (departmentId: string) => destinations.filter((r) => owner.get(r.id) === departmentId);
  /** 房间内离墙至少 0.8 m 的随机点，同一房间里的设备不会叠在一起 */
  const spot = (u: Unit): Vec => {
    const [x0, y0, x1, y1] = u.box;
    return [x0 + 0.8 + rand() * (x1 - x0 - 1.6), y0 + 0.8 + rand() * (y1 - y0 - 1.6)];
  };
  const base = (id: string, home: Unit[], stay: number, start: Unit, pos: Vec): Tag => ({
    id,
    home,
    stay,
    fixed: false,
    goal: null,
    levelId: start.levelId,
    pos,
    reported: pos,
    speed: 0.8 + rand() * 0.8,
    unit: start,
    path: [],
    target: null,
    dwell: start.category === 'walkway' ? 0 : rand() * 10_000,
    nextLevel: null,
  });

  const tags: Tag[] = [];
  for (const person of roster.people) {
    const home = homeOf(person.departmentId);
    const stay = STAY[person.role];
    // 一部分人一开始就不在本科室，演示一开始就能看到科室层的报警
    const start = home.length > 0 && rand() < stay ? pick(home) : pick(rand() < 0.3 ? walkways : reachable);
    const [x0, y0, x1, y1] = start.box;
    const pos: Vec =
      start.category === 'walkway'
        ? [x0 + 0.3 + rand() * (x1 - x0 - 0.6), y0 + 0.3 + rand() * (y1 - y0 - 0.6)]
        : [...start.center];
    const tag: Tag = { ...base(person.id, home, stay, start, pos), person };
    if (home.includes(start)) tag.dwell = rand() * 180_000;
    tags.push(tag);
  }
  const mobile = new Set(MOBILE_ASSET_TYPES);
  for (const asset of roster.assets) {
    const home = homeOf(asset.departmentId);
    const movable = mobile.has(asset.type);
    const start = home.length > 0 && (!movable || rand() < 0.7) ? pick(home) : pick(destinations);
    const tag = { ...base(asset.id, home, MOBILE_STAY, start, spot(start)), asset, fixed: !movable };
    tag.dwell = movable ? rand() * 240_000 : Infinity;
    tags.push(tag);
  }

  for (const tag of tags) if (!tag.fixed) tag.reported = observe(tag);

  const advance = (tag: Tag, dtMs: number) => {
    let budget = dtMs;
    while (budget > 0) {
      if (tag.dwell > 0) {
        const used = Math.min(tag.dwell, budget);
        tag.dwell -= used;
        budget -= used;
        continue;
      }
      if (tag.path.length === 0) {
        if (tag.target) arrive(tag);
        else if (tag.nextLevel) changeLevel(tag);
        else plan(tag);
        continue;
      }
      const next = tag.path[0]!;
      const dist = Math.hypot(next[0] - tag.pos[0], next[1] - tag.pos[1]);
      const reach = (tag.speed * budget) / 1000;
      if (reach >= dist) {
        tag.pos = [...next];
        tag.path.shift();
        budget -= (dist / tag.speed) * 1000;
        // 走廊里没有可走的路段时避免死循环
        if (dist === 0 && tag.path.length === 0 && !tag.target) break;
      } else {
        tag.pos = [
          tag.pos[0] + ((next[0] - tag.pos[0]) * reach) / dist,
          tag.pos[1] + ((next[1] - tag.pos[1]) * reach) / dist,
        ];
        budget = 0;
      }
    }
  };

  let time = 0;
  const positions = () =>
    tags.map((t): TagPosition => {
      const p: TagPosition = { id: t.id, levelId: t.levelId, coord: toLngLat(t.reported) };
      if (t.asset) p.status = statusAt(t.asset, dayTime(time));
      else if (t.person && sosActive(t.person, dayTime(time))) p.status = 'sos';
      return p;
    });
  return {
    get time() {
      return time;
    },
    positions,
    step(dtMs) {
      time += dtMs;
      for (const tag of tags) {
        if (tag.fixed) continue;
        advance(tag, dtMs);
        tag.reported = observe(tag);
      }
      return positions();
    },
  };
}
