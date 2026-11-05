import { HOUSE_FOOTPRINT, HOUSE_SHELL } from './house-site';
import type { Rect } from './scene';
import { SHED } from './shed';
import { YARD_Y, yardCorners } from './yard-route';

/**
 * A small walkable graph for the garden, and the one closed walk drawn from it each afternoon.
 *
 * The house almost fills its lot. There is a narrow band of ground all the way round it —
 * about a metre in front, one and a half down each side, two behind — and the shed sits against
 * the back of that band. So the children cannot strike out across the garden in a straight
 * line; any walk they plan has to stay in the band. That is what makes this a routing question
 * rather than a choice of random points.
 *
 * The graph is deliberately small and explicit. Its nodes are measured off the same data that
 * draws the house and the yard lap, and every edge is checked against the house's real walls
 * before it is admitted. What is random is the *walk*: a seeded wander through the graph picks
 * a handful of turns, then Dijkstra closes the walk back at the gate. Same seed, same walk.
 *
 * Nothing here imports a React or three.js module. The route is pure geometry, so it can be
 * tested without a renderer and sampled sixty times a second without touching the scene graph.
 */

/** A child's radius plus the widest lane the plan can give it. An edge has to clear this much. */
export const BODY_PAD = 0.74;

export interface NavNode {
  id: string;
  x: number;
  z: number;
}

export interface NavEdge {
  from: string;
  to: string;
  length: number;
}

export interface RoutePoint {
  x: number;
  z: number;
  /** Unit normal the lanes are measured along, away from the house. */
  nx: number;
  nz: number;
}

export interface NavRoute {
  /** The graph nodes the walk visits, in order, gate first and gate last. */
  ids: string[];
  /** The place this afternoon set out to reach; the first leg is planned to it. */
  goal: string;
  /** The same walk with every corner rounded into a short arc. */
  points: RoutePoint[];
  /** Cumulative distance to each point; `s[0] = 0`. */
  s: number[];
  length: number;
}

export interface NavSample {
  x: number;
  y: number;
  z: number;
  heading: number;
}

export type Rng = () => number;

const [gateCorner, seCorner, neCorner, nwCorner, swCorner] = yardCorners;
if (!gateCorner || !seCorner || !neCorner || !nwCorner || !swCorner) {
  throw new RangeError('the yard lap needs five corners');
}

const front = gateCorner[1];
const east = seCorner[0];
const west = swCorner[0];
/**
 * The lap's back line runs along the shed's front face. Pulled in far enough that a child in
 * the outermost lane clears the shed by a hand's width.
 */
const back = Math.max(neCorner[1], SHED.walls.z1 + BODY_PAD + 0.15);

const shellX0 = Math.min(...HOUSE_SHELL.map((r) => r.x0));
const shellX1 = Math.max(...HOUSE_SHELL.map((r) => r.x1));
const shellZ0 = Math.min(...HOUSE_SHELL.map((r) => r.z0));
const shellZ1 = Math.max(...HOUSE_SHELL.map((r) => r.z1));
/** The inner line stands off the walls by the lane width plus a little air. */
const INSET = BODY_PAD + 0.16;

export const NAV_NODES: readonly NavNode[] = [
  { id: 'gate', x: gateCorner[0], z: front },
  { id: 'se', x: east, z: front },
  { id: 'ne', x: east, z: back },
  { id: 'nw', x: west, z: back },
  { id: 'sw', x: west, z: front },
  { id: 'inSe', x: shellX1 + INSET, z: HOUSE_FOOTPRINT.z1 + 0.3 },
  { id: 'inNe', x: shellX1 + INSET, z: shellZ0 - INSET },
  { id: 'inNw', x: shellX0 - INSET, z: shellZ0 - INSET },
  { id: 'inSw', x: shellX0 - INSET, z: HOUSE_FOOTPRINT.z1 + 0.3 },
];

const byId = new Map(NAV_NODES.map((n) => [n.id, n]));
const node = (id: string): NavNode => {
  const found = byId.get(id);
  if (!found) throw new RangeError(`no nav node ${id}`);
  return found;
};

/** Places worth walking to. Every one of them is a node on the measured graph. */
export const NAV_GOALS: readonly string[] = NAV_NODES.filter((n) => n.id !== 'gate').map((n) => n.id);

/**
 * Liang–Barsky: does segment a→b enter the rectangle grown by `pad`?
 *
 * Rects, not meshes: the house is drawn as twelve room shells and the shed as four walls, and
 * both are already plain rectangles in world metres. Growing them by the body-and-lane width
 * is enough, because a lane is an offset perpendicular to the walk and can only be that far
 * off the centre line.
 */
function segmentHitsRect(a: NavNode, b: NavNode, r: Rect, pad: number): boolean {
  const x0 = r.x0 - pad;
  const x1 = r.x1 + pad;
  const z0 = r.z0 - pad;
  const z1 = r.z1 + pad;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  const slabs: readonly (readonly [number, number])[] = [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dz, a.z - z0],
    [dz, z1 - a.z],
  ];
  for (const [p, q] of slabs) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

/** The walls and the shed, grown by one body-and-lane width. */
export const NAV_OBSTACLES: readonly Rect[] = [
  ...HOUSE_SHELL,
  { x0: SHED.walls.x0, x1: SHED.walls.x1, z0: SHED.walls.z0, z1: SHED.walls.z1 },
];

export function segmentClear(a: NavNode, b: NavNode): boolean {
  return !NAV_OBSTACLES.some((r) => segmentHitsRect(a, b, r, BODY_PAD));
}

const PAIRS: readonly (readonly [string, string])[] = [
  // The outer lap, from the gate round the east side, the back and home up the west.
  ['gate', 'se'],
  ['se', 'ne'],
  ['ne', 'nw'],
  ['nw', 'sw'],
  ['sw', 'gate'],
  // A second line close in to the house on three sides. The front is left out: the porch
  // stands there, and a child on an inner line would be walking through the front step.
  ['inSe', 'inNe'],
  ['inNe', 'inNw'],
  ['inNw', 'inSw'],
  // Four ways to change from one line to the other, one at each corner of the house.
  ['se', 'inSe'],
  ['ne', 'inNe'],
  ['nw', 'inNw'],
  ['sw', 'inSw'],
];

function makeEdges(): NavEdge[] {
  const out: NavEdge[] = [];
  for (const [from, to] of PAIRS) {
    const a = node(from);
    const b = node(to);
    if (!segmentClear(a, b)) continue;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    out.push({ from, to, length }, { from: to, to: from, length });
  }
  return out;
}

export const NAV_EDGES: readonly NavEdge[] = makeEdges();

const OUTER_PAIRS: ReadonlySet<string> = new Set(['gate>se', 'se>ne', 'ne>nw', 'nw>sw', 'sw>gate']);

/** One measured lap of the outer band, off the same edges the children walk. */
export const OUTER_LAP_LENGTH = NAV_EDGES.filter((e) => OUTER_PAIRS.has(`${e.from}>${e.to}`)).reduce(
  (sum, e) => sum + e.length,
  0,
);

const edgeKey = (from: string, to: string): string => (from < to ? `${from}|${to}` : `${to}|${from}`);

/** Edges leaving each node, in a stable order so a seeded walk replays exactly. */
const ADJACENCY: ReadonlyMap<string, readonly NavEdge[]> = (() => {
  const map = new Map<string, NavEdge[]>();
  for (const node of NAV_NODES) map.set(node.id, []);
  for (const edge of NAV_EDGES) map.get(edge.from)?.push(edge);
  return map;
})();

const mod = (a: number, m: number) => ((a % m) + m) % m;

function weightedPick<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) {
    const fallback = items[Math.floor(rng() * items.length)];
    if (!fallback) throw new RangeError('nothing to pick');
    return fallback;
  }
  let draw = rng() * total;
  for (let i = 0; i < items.length; i++) {
    draw -= weights[i] ?? 0;
    if (draw <= 0) {
      const picked = items[i];
      if (!picked) throw new RangeError('pick index out of range');
      return picked;
    }
  }
  const last = items[items.length - 1];
  if (!last) throw new RangeError('nothing to pick');
  return last;
}

/**
 * A* from one node to a chosen goal. The heuristic is straight-line distance to that goal,
 * which never overestimates: every edge is a straight segment at least as long as the bird's
 * path between its ends. With nine nodes the open set is a plain scan rather than a heap, but
 * `f = g + h` is what makes this a search *towards somewhere* instead of a flood fill.
 *
 * A road already used, or a node already visited, carries a soft penalty. That breaks strict
 * admissibility of the combined cost, so the answer is the cheapest appealing route rather
 * than a proof of the shortest one — which is what a child's afternoon wants anyway.
 */
function aStar(from: string, goal: string, seen: ReadonlySet<string>, used: ReadonlySet<string>): string[] {
  const target = node(goal);
  const h = (id: string): number => {
    const n = node(id);
    return Math.hypot(n.x - target.x, n.z - target.z);
  };
  const distance = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set<string>([from]);
  const cost = (edge: NavEdge) =>
    edge.length + (seen.has(edge.to) ? 6 : 0) + (used.has(edgeKey(edge.from, edge.to)) ? 12 : 0);
  while (open.size > 0) {
    let at: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const id of open) {
      const score = (distance.get(id) ?? Number.POSITIVE_INFINITY) + h(id);
      if (score < best) {
        best = score;
        at = id;
      }
    }
    if (at === null) break;
    if (at === goal) break;
    open.delete(at);
    const g = distance.get(at) ?? 0;
    for (const edge of ADJACENCY.get(at) ?? []) {
      const next = g + cost(edge);
      if (next < (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        distance.set(edge.to, next);
        previous.set(edge.to, at);
        open.add(edge.to);
      }
    }
  }
  if (!distance.has(goal)) return [];
  const path = [goal];
  let at = goal;
  while (at !== from) {
    const prev = previous.get(at);
    if (!prev) return [];
    path.unshift(prev);
    at = prev;
  }
  return path;
}

/**
 * Draw this afternoon's walk.
 *
 * Unlike a wander with no aim, this one first picks somewhere to go. A* plans the way there,
 * the child then takes a few seeded turns round the garden, and a second A* plans the way
 * home. Short edges are more likely on those turns, immediately doubling back is forbidden,
 * and a node or an edge already used is discouraged, so the whole walk spreads out instead of
 * pacing one stretch back and forth. The result always begins and ends at the gate, which is
 * the one point on the garden that joins the children's spots to the ground behind the wall.
 */
export function randomLoop(rng: Rng, temperature = 7): NavRoute {
  const ids = ['gate'];
  const seen = new Set<string>(['gate']);
  const used = new Set<string>();

  const follow = (from: string, path: readonly string[]): string => {
    let at = from;
    for (const next of path.slice(1)) {
      ids.push(next);
      seen.add(next);
      used.add(edgeKey(at, next));
      at = next;
    }
    return at;
  };

  const goal = NAV_GOALS[Math.floor(rng() * NAV_GOALS.length)] ?? 'ne';
  const outbound = aStar('gate', goal, seen, used);
  let at = 'gate';
  let previous: string | null = null;
  if (outbound.length >= 2) {
    at = follow('gate', outbound);
    previous = outbound[outbound.length - 2] ?? null;
  }

  /**
   * This afternoon's own taste in roads. A fresh multiplier per edge means a long way round
   * can be the favourite one afternoon and ignored the next; without it, an exponential cost
   * always picks the short corner link and every walk settles into the same lap.
   */
  const bias = new Map<string, number>();
  for (const edge of NAV_EDGES) bias.set(`${edge.from}>${edge.to}`, 0.4 + rng() * 1.2);
  const weight = (edge: NavEdge) =>
    (bias.get(`${edge.from}>${edge.to}`) ?? 1) *
    (1 / (1 + edge.length / temperature)) *
    (seen.has(edge.to) ? 0.18 : 1) *
    (used.has(edgeKey(edge.from, edge.to)) ? 0.04 : 1);

  // A shorter wander than before: the purposeful first leg already used part of the afternoon.
  const steps = 2 + Math.floor(rng() * 5);
  for (let i = 0; i < steps; i++) {
    const choices = (ADJACENCY.get(at) ?? []).filter(
      (e) => e.to !== previous && (e.to !== 'gate' || i >= steps - 2),
    );
    if (choices.length === 0) break;
    const edge = weightedPick(rng, choices, choices.map(weight));
    ids.push(edge.to);
    seen.add(edge.to);
    used.add(edgeKey(edge.from, edge.to));
    previous = at;
    at = edge.to;
    if (at === 'gate') break;
  }
  if (at !== 'gate') {
    const home = aStar(at, 'gate', seen, used);
    ids.push(...home.slice(1));
  }
  return buildRoute(ids, goal);
}

/** Radius of the arc a corner is rounded to, metres. */
const CORNER_RADIUS = 0.45;
/** Points used to draw each rounded corner. */
const CORNER_STEPS = 4;

/**
 * Turn a list of graph nodes into a sampled walk: clip each corner and replace it with a short
 * quadratic arc, then measure cumulative distance and give every point a lane normal.
 *
 * The normal is the mean of the two adjoining segment normals, put back to unit length. That
 * is the same trick `yard-route.ts` uses at its corners, and it keeps a party in three lanes
 * from being thrown sideways when the walk turns a right angle.
 */
export function buildRoute(ids: readonly string[], goal = ''): NavRoute {
  if (ids.length < 2) throw new RangeError('a walk needs at least two nodes');
  // The walk is written with the gate at both ends. Round it as a closed loop instead, so the
  // gate is one corner and the last point simply joins the first again.
  const ring = ids[0] === ids[ids.length - 1] ? ids.slice(0, -1) : [...ids];
  const corners = ring.map(node);
  const raw: { x: number; z: number }[] = [];
  const n = corners.length;

  for (let i = 0; i < n; i++) {
    const current = corners[i];
    const before = corners[mod(i - 1, n)];
    const after = corners[mod(i + 1, n)];
    if (!current || !before || !after) throw new RangeError('missing corner');
    const inLen = Math.hypot(current.x - before.x, current.z - before.z);
    const outLen = Math.hypot(after.x - current.x, after.z - current.z);
    const t = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    if (t < 1e-6) {
      raw.push({ x: current.x, z: current.z });
      continue;
    }
    const ax = current.x + ((before.x - current.x) * t) / inLen;
    const az = current.z + ((before.z - current.z) * t) / inLen;
    const bx = current.x + ((after.x - current.x) * t) / outLen;
    const bz = current.z + ((after.z - current.z) * t) / outLen;
    raw.push({ x: ax, z: az });
    for (let k = 1; k < CORNER_STEPS; k++) {
      const f = k / CORNER_STEPS;
      const g = 1 - f;
      raw.push({
        x: g * g * ax + 2 * g * f * current.x + f * f * bx,
        z: g * g * az + 2 * g * f * current.z + f * f * bz,
      });
    }
  }

  /**
   * A lane is measured away from the house, not to the left of the walk. A walk can double
   * back, and a left-hand normal would flip across the road at the turn — a child in the outer
   * lane would jump a metre sideways in one frame. Projecting onto the house's bounding shell
   * instead gives a field that depends only on where the child is, so it stays continuous even
   * when the walk reverses, and opens out diagonally at the corners the way the yard lap does.
   */
  const outward = (x: number, z: number): readonly [number, number] => {
    const cx = Math.max(shellX0, Math.min(shellX1, x));
    const cz = Math.max(shellZ0, Math.min(shellZ1, z));
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.hypot(dx, dz);
    return len > 1e-6 ? [dx / len, dz / len] : [0, 1];
  };

  const points: RoutePoint[] = raw.map((p) => {
    const [nx, nz] = outward(p.x, p.z);
    return { x: p.x, z: p.z, nx, nz };
  });

  // Close the loop with an explicit last point, so distance is defined on the whole lap.
  const first = points[0];
  if (!first) throw new RangeError('a walk needs a first point');
  points.push({ ...first });

  const s: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) throw new RangeError('missing point');
    s.push((s[i - 1] ?? 0) + Math.hypot(b.x - a.x, b.z - a.z));
  }
  const length = s[s.length - 1] ?? 0;
  if (length <= 0) throw new RangeError('a walk cannot have zero length');
  return { ids: [...ids], goal, points, s, length };
}

/** Position `d` metres round the walk, `lateral` metres out from its line. */
export function sampleRoute(route: NavRoute, d: number, lateral: number, out: NavSample): NavSample {
  const t = mod(d, route.length);
  let lo = 0;
  let hi = route.s.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((route.s[mid] ?? 0) <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = route.points[lo];
  const b = route.points[lo + 1];
  const s0 = route.s[lo] ?? 0;
  const s1 = route.s[lo + 1] ?? route.length;
  if (!a || !b) throw new RangeError('missing route point');
  const f = Math.min(1, Math.max(0, (t - s0) / Math.max(1e-9, s1 - s0)));
  const nx = a.nx + (b.nx - a.nx) * f;
  const nz = a.nz + (b.nz - a.nz) * f;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  out.x = a.x + dx * f + nx * lateral;
  out.z = a.z + dz * f + nz * lateral;
  out.y = YARD_Y;
  out.heading = Math.atan2(dx, dz);
  return out;
}

/** Distance round the walk to the point nearest (x, z), for the door's place on the lap. */
export function nearestOnRoute(route: NavRoute, x: number, z: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.points.length - 1; i++) {
    const a = route.points[i];
    const b = route.points[i + 1];
    const s0 = route.s[i] ?? 0;
    const s1 = route.s[i + 1] ?? route.length;
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    const f = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
    const distance = (x - (a.x + dx * f)) ** 2 + (z - (a.z + dz * f)) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = s0 + (s1 - s0) * f;
    }
  }
  return best;
}
