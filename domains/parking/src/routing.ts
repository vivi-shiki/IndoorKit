import type { Parking } from './model';

/** 某一层上的一个点 */
export interface Place {
  levelId: string;
  coord: [number, number];
}

export interface Route {
  points: Place[];
  /** 平面上的行驶距离（米） */
  meters: number;
  /** 经过的楼层，按先后，不重复相邻 */
  levels: string[];
}

const M_PER_LAT = 110_540;

interface Node extends Place {
  key: string;
}
interface Edge {
  to: number;
  meters: number;
}

/**
 * 车道路径：车道中心线组成有向图（单向车道只有一个方向，坡道连接两层），
 * 起点和终点先投影到同层最近的车道上，再用 Dijkstra 找最短路线。
 */
export function createRouter(parking: Parking) {
  const [lng0, lat0] = parking.venue.center;
  const mPerLng = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const xy = ([lng, lat]: [number, number]): [number, number] => [
    (lng - lng0) * mPerLng,
    (lat - lat0) * M_PER_LAT,
  ];
  const lngLat = ([x, y]: [number, number]): [number, number] => [lng0 + x / mPerLng, lat0 + y / M_PER_LAT];
  const dist = (a: [number, number], b: [number, number]) => {
    const [ax, ay] = xy(a);
    const [bx, by] = xy(b);
    return Math.hypot(ax - bx, ay - by);
  };

  const nodes: Node[] = [];
  const index = new Map<string, number>();
  const node = (levelId: string, coord: [number, number]) => {
    const key = `${levelId}|${coord[0].toFixed(9)},${coord[1].toFixed(9)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = nodes.push({ key, levelId, coord }) - 1;
      index.set(key, i);
    }
    return i;
  };
  const edges: Edge[][] = [];
  const link = (a: number, b: number) => {
    edges[a] ??= [];
    edges[a].push({ to: b, meters: dist(nodes[a]!.coord, nodes[b]!.coord) });
  };

  /** 同层的路段，用来投影起点和终点 */
  const segments: { levelId: string; a: number; b: number; oneway: boolean }[] = [];
  for (const lane of parking.lanes) {
    const coords = lane.coordinates;
    const ids = coords.map((c, i) => node(i === coords.length - 1 ? lane.toLevel : lane.fromLevel, c));
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1]!;
      const b = ids[i]!;
      link(a, b);
      if (!lane.oneway) link(b, a);
      if (nodes[a]!.levelId === nodes[b]!.levelId)
        segments.push({ levelId: nodes[a]!.levelId, a, b, oneway: lane.oneway });
    }
  }

  /** 点在同层车道上的投影：所在路段和投影点 */
  const snap = (place: Place) => {
    let best: { seg: (typeof segments)[number]; coord: [number, number]; d: number } | null = null;
    const p = xy(place.coord);
    for (const seg of segments) {
      if (seg.levelId !== place.levelId) continue;
      const a = xy(nodes[seg.a]!.coord);
      const b = xy(nodes[seg.b]!.coord);
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const q: [number, number] = [a[0] + dx * t, a[1] + dy * t];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (!best || d < best.d - 1e-9) best = { seg, coord: lngLat(q), d };
    }
    return best;
  };

  function shortest(from: Place, to: Place): Route | null {
    const start = snap(from);
    const end = snap(to);
    if (!start || !end) return null;
    // 起点和终点作为临时节点接到所在路段上，算完即丢
    const extra: Edge[][] = [];
    const S = nodes.length;
    const T = nodes.length + 1;
    const all = [...nodes, { key: 's', ...from, coord: start.coord }, { key: 't', ...to, coord: end.coord }];
    const out = (i: number) => [...(edges[i] ?? []), ...(extra[i] ?? [])];
    const add = (a: number, b: number) => {
      extra[a] ??= [];
      extra[a].push({ to: b, meters: dist(all[a]!.coord, all[b]!.coord) });
    };
    add(S, start.seg.b);
    if (!start.seg.oneway) add(S, start.seg.a);
    add(end.seg.a, T);
    if (!end.seg.oneway) add(end.seg.b, T);
    // 起点和终点在同一路段上、顺着方向时可以直接到
    if (start.seg === end.seg) {
      const [a, s, t] = [nodes[start.seg.a]!.coord, start.coord, end.coord];
      if (!start.seg.oneway || dist(a, s) <= dist(a, t)) add(S, T);
    }

    const cost = new Map<number, number>([[S, 0]]);
    const prev = new Map<number, number>();
    const done = new Set<number>();
    for (;;) {
      let u = -1;
      for (const [i, c] of cost) if (!done.has(i) && (u < 0 || c < cost.get(u)!)) u = i;
      if (u < 0) return null;
      if (u === T) break;
      done.add(u);
      for (const e of out(u)) {
        const c = cost.get(u)! + e.meters;
        if (c < (cost.get(e.to) ?? Infinity)) {
          cost.set(e.to, c);
          prev.set(e.to, u);
        }
      }
    }
    const path: number[] = [T];
    while (path[0] !== S) path.unshift(prev.get(path[0]!)!);
    const points: Place[] = [
      from,
      ...path.map((i) => ({ levelId: all[i]!.levelId, coord: all[i]!.coord })),
      to,
    ];
    // 去掉重合的相邻点（投影点正好是路口，或起点就在车道上）
    const clean = points.filter(
      (p, i) => i === 0 || p.levelId !== points[i - 1]!.levelId || dist(p.coord, points[i - 1]!.coord) > 0.01,
    );
    const meters = clean.reduce((sum, p, i) => (i === 0 ? 0 : sum + dist(clean[i - 1]!.coord, p.coord)), 0);
    return {
      points: clean,
      meters,
      levels: clean.map((p) => p.levelId).filter((id, i, a) => id !== a[i - 1]),
    };
  }

  const best = (routes: (Route | null)[]) =>
    routes.reduce<Route | null>((b, r) => (r && (!b || r.meters < b.meters) ? r : b), null);
  const gatewaysFor = (role: 'entry' | 'exit') =>
    parking.gateways.filter((g) => g.role === role || g.role === 'both');
  const bayPlace = (bayId: string): Place => {
    const bay = parking.bay(bayId);
    return { levelId: bay.levelId, coord: bay.center };
  };
  const mustRoute = (route: Route | null, what: string) => {
    if (!route) throw new Error(`no lane leads ${what}`);
    return route;
  };

  const exits = parking.venue.features.units.features.filter((u) =>
    ['elevator', 'stairs'].includes(u.properties.category),
  );

  return {
    route: shortest,
    /** 从最近的入口开到车位 */
    toBay: (bayId: string) =>
      mustRoute(best(gatewaysFor('entry').map((g) => shortest(g, bayPlace(bayId)))), `to bay ${bayId}`),
    /** 从车位开到最近的出口 */
    fromBay: (bayId: string) =>
      mustRoute(best(gatewaysFor('exit').map((g) => shortest(bayPlace(bayId), g))), `from bay ${bayId}`),
    /** 车位到同层最近的电梯或楼梯（直线，米）；同层没有时为 Infinity */
    walkMeters(bayId: string) {
      const { levelId, coord } = bayPlace(bayId);
      let min = Infinity;
      for (const u of exits) {
        if (u.properties.level_id !== levelId) continue;
        const ring = (
          u.geometry.type === 'Polygon' ? u.geometry.coordinates : u.geometry.coordinates[0]!
        )[0]!;
        const xs = ring.map((c) => c[0]!);
        const ys = ring.map((c) => c[1]!);
        const center: [number, number] = [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        ];
        min = Math.min(min, dist(coord, center));
      }
      return min;
    },
  };
}

export type Router = ReturnType<typeof createRouter>;
