import { characters } from './characters';
import { crossingRects, layout, type Rect } from './scene';

/**
 * The walk-mode route: one closed loop round the crossroads that all six characters share,
 * on the sidewalks and across the four zebras only. Everyone walks it in the same direction
 * at the same speed from their own spot, so a single distance `d` places the whole group and
 * their spacing never changes. `d = 0` (and every whole lap) is today's layout exactly.
 */

/** Walking pace, metres per second: an unhurried children's stroll. */
export const WALK_SPEED = 1.0;

/** Radius every corner of the loop is rounded to, metres; shorter legs get half their length. */
const CORNER_RADIUS = 0.45;
/** Within this many metres of home a walker eases off the lane onto its spot and turns to the street. */
const HOME_BLEND = 1.5;
/** Half-width of the band round a kerb line over which a walker steps down to the road or up. */
const STEP_BAND = 0.25;

/** The kerb-side line along the near sidewalk, where the characters stand, and the wall-side return. */
const OUTER_LANE_Z = 7.4;
const INNER_LANE_Z = 6.5;

const { road, sidewalk, streets, standY } = layout;
const zebra = crossingRects();
const eastX = (zebra.east.x0 + zebra.east.x1) / 2;
const westX = (zebra.west.x0 + zebra.west.x1) / 2;
const southZ = (zebra.south.z0 + zebra.south.z1) / 2;
const northZ = (zebra.north.z0 + zebra.north.z1) / 2;
/** Middle of the far front sidewalk, and of the two side-road sidewalks. */
const farFrontZ = road.startZ + road.depth + sidewalk.depth / 2;
const farSideX = streets.side.startX - sidewalk.depth / 2;
const nearSideX = streets.side.endX + sidewalk.depth / 2;

/** Corners of the loop in walking order, [x, z]. The loop starts leaving the first one. */
const WAYPOINTS: readonly (readonly [number, number])[] = [
  // Top of the east crossing: turn east along the outer lane, past all six home spots.
  [eastX, OUTER_LANE_Z],
  // U-turn just past Dekisugi's spot, 2 m short of the pole at x 8.6.
  [6.55, OUTER_LANE_Z],
  [6.55, INNER_LANE_Z],
  // Hero-lot corner, a quarter metre in from the middle so it stays clear of the junction pole.
  [nearSideX + 0.25, INNER_LANE_Z],
  [nearSideX + 0.25, northZ],
  [farSideX, northZ],
  // West-lot corner, pulled back from the kerb to clear that side's junction pole.
  [farSideX, 6.4],
  [westX, 6.4],
  [westX, farFrontZ],
  [farSideX, farFrontZ],
  [farSideX, southZ],
  [nearSideX, southZ],
  // Parking-lot corner, then back along the far sidewalk to the east crossing.
  [nearSideX, farFrontZ],
  [eastX, farFrontZ],
];

/** A straight run or a corner arc of the loop, starting `s` metres round it. */
type Piece =
  | { kind: 'line'; s: number; length: number; x: number; z: number; dx: number; dz: number }
  | { kind: 'arc'; s: number; length: number; cx: number; cz: number; r: number; a0: number; turn: number };

export interface WalkSample {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians, the characters' convention: 0 faces +Z, π/2 faces +X. */
  heading: number;
}

/** `list[i]` with `i` wrapped round the list, so the loop can read its neighbours cyclically. */
function at<T>(list: readonly T[], i: number): T {
  const item = list[((i % list.length) + list.length) % list.length];
  if (item === undefined) throw new RangeError('empty list');
  return item;
}

/** Build the loop once: every waypoint becomes a fillet arc, joined by straight runs. */
function buildLoop(points: readonly (readonly [number, number])[]) {
  const n = points.length;
  const corners = points.map((p, k) => {
    const prev = at(points, k - 1);
    const next = at(points, k + 1);
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const ux = (p[0] - prev[0]) / inLen;
    const uz = (p[1] - prev[1]) / inLen;
    const vx = (next[0] - p[0]) / outLen;
    const vz = (next[1] - p[1]) / outLen;
    const r = Math.min(CORNER_RADIUS, inLen / 2, outLen / 2);
    const angle = Math.acos(Math.max(-1, Math.min(1, ux * vx + uz * vz)));
    const side = Math.sign(ux * vz - uz * vx);
    const t = r * Math.tan(angle / 2);
    const ax = p[0] - ux * t;
    const az = p[1] - uz * t;
    // The arc centre sits one radius from the entry tangent point, on the inside of the turn.
    const cx = ax - uz * side * r;
    const cz = az + ux * side * r;
    return {
      a: [ax, az] as const,
      b: [p[0] + vx * t, p[1] + vz * t] as const,
      arc: { cx, cz, r, a0: Math.atan2(az - cz, ax - cx), turn: side * angle },
    };
  });

  const pieces: Piece[] = [];
  let s = 0;
  for (let k = 0; k < n; k++) {
    const from = at(corners, k).b;
    const to = at(corners, k + 1);
    const length = Math.hypot(to.a[0] - from[0], to.a[1] - from[1]);
    if (length > 1e-9) {
      const dx = (to.a[0] - from[0]) / length;
      const dz = (to.a[1] - from[1]) / length;
      pieces.push({ kind: 'line', s, length, x: from[0], z: from[1], dx, dz });
      s += length;
    }
    const arcLength = to.arc.r * Math.abs(to.arc.turn);
    pieces.push({ kind: 'arc', s, length: arcLength, ...to.arc });
    s += arcLength;
  }
  return { pieces, length: s, start: at(corners, 0).b };
}

const loop = buildLoop(WAYPOINTS);

/** Length of one lap, metres. */
export const WALK_LOOP_LENGTH = loop.length;

/** Orbit-target box that covers the whole walk with 2 m to spare, for the camera clamp. */
export const walkBounds: Rect = {
  x0: Math.min(...WAYPOINTS.map((p) => p[0])) - 2,
  x1: Math.max(...WAYPOINTS.map((p) => p[0])) + 2,
  z0: Math.min(...WAYPOINTS.map((p) => p[1])) - 2,
  z1: Math.max(...WAYPOINTS.map((p) => p[1])) + 2,
};

const mod = (a: number, m: number) => ((a % m) + m) % m;
const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const smoothstep = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How far (x, z) lies inside a carriageway, metres; negative on the pavement side of the kerb. */
function carriagewayDepth(x: number, z: number) {
  const front = Math.min(z - road.startZ, road.startZ + road.depth - z);
  const side = Math.min(x - streets.side.startX, streets.side.endX - x);
  return Math.max(front, side);
}

/** Position and travel heading `u` metres round the loop (0 ≤ u < length), into `out`. */
function sampleLoop(u: number, out: WalkSample) {
  const { pieces } = loop;
  let lo = 0;
  let hi = pieces.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (at(pieces, mid).s <= u) lo = mid;
    else hi = mid - 1;
  }
  const p = at(pieces, lo);
  const t = Math.min(u - p.s, p.length);
  if (p.kind === 'line') {
    out.x = p.x + p.dx * t;
    out.z = p.z + p.dz * t;
    out.heading = Math.atan2(p.dx, p.dz);
  } else {
    const a = p.a0 + (Math.sign(p.turn) * t) / p.r;
    out.x = p.cx + p.r * Math.cos(a);
    out.z = p.cz + p.r * Math.sin(a);
    // Tangent of the circle, pointing the way the arc turns.
    out.heading = Math.atan2(-Math.sin(a) * Math.sign(p.turn), Math.cos(a) * Math.sign(p.turn));
  }
  // Pavement height, easing down onto the zebra paint over the kerb line and back up after.
  out.y =
    standY +
    (streets.crossing.top - standY) * smoothstep(-STEP_BAND, STEP_BAND, carriagewayDepth(out.x, out.z));
}

/**
 * Each character's home on the loop: its distance round the outer lane, the offset from the
 * lane point there to its exact spot, and the lane's heading there.
 */
const homes = characters.map((def) => {
  const s = def.position[0] - loop.start[0];
  const lane: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };
  sampleLoop(mod(s, loop.length), lane);
  if (Math.abs(lane.z - OUTER_LANE_Z) > 1e-9) throw new Error(`${def.id}'s spot is not on the outer lane`);
  return {
    s,
    dx: def.position[0] - lane.x,
    dy: def.position[1] - lane.y,
    dz: def.position[2] - lane.z,
    rotationY: def.rotationY,
    laneHeading: lane.heading,
  };
});

/**
 * Where character `index` stands when the group has walked `d` metres (any real; wraps per
 * lap), written into `out`. `backward` turns the heading round for the walk home the short
 * way. Near home the walker eases onto its exact spot and turns to face the street, so at
 * `d ≡ 0` this returns `position` and `rotationY` from `characters.ts`.
 */
export function sampleWalk(index: number, d: number, out: WalkSample, backward = false): WalkSample {
  const home = homes[index];
  if (!home) throw new RangeError(`no character at index ${index}`);
  sampleLoop(mod(home.s + d, loop.length), out);
  const lap = mod(d, loop.length);
  const w = 1 - smoothstep(0, HOME_BLEND, Math.min(lap, loop.length - lap));
  const flip = backward ? Math.PI : 0;
  let heading = out.heading + flip;
  if (w > 0) {
    // Blend in angles measured from the lane heading at home, so the blend never flips sides
    // as the travel heading swings through a corner inside the blend distance.
    const ref = home.laneHeading + flip;
    const travel = wrapPi(heading - ref);
    heading = ref + travel + w * (wrapPi(home.rotationY - ref) - travel);
    out.x += w * home.dx;
    out.y += w * home.dy;
    out.z += w * home.dz;
  }
  out.heading = wrapPi(heading);
  return out;
}

/**
 * Signed distance from `d` to the nearest whole lap, where everyone is home: positive means
 * walk on, negative means turn round. A tie at half a lap walks on.
 */
export function nearestHomeDelta(d: number): number {
  const lap = mod(d, loop.length);
  return loop.length - lap <= lap ? loop.length - lap : -lap;
}
