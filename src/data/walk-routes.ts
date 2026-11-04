import { characters } from './characters';
import { crossingRects, layout, type Rect } from './scene';
import { YARD_Y } from './yard-route';

/**
 * The walk-mode route: one closed loop shared by all six characters, and it covers the two
 * places they actually go — the pavement in front of their own gate, and the vacant lot
 * straight across the road. Nobody walks round the block: the side street and the far
 * sidewalks have nothing on them worth the trip, and a lap out there was a lap of nothing.
 *
 * The shape is a rectangle out in the lot with a stem back to the homes:
 *
 *   homes ── east along the pavement ──▶ crossing ──▶ round the vacant lot ──▶ crossing ──▶ homes
 *
 * The pavement is walked once, eastbound, and the loop closes on the far side of the lot, so
 * no stretch of it is walked both ways — which matters, because the pavement is 1.9 m wide and
 * six children are standing in the middle of it. See `wander-pack.ts` for who gives way to whom.
 *
 * Everyone walks it in the same direction from their own spot, so a single distance `d` places
 * the whole group. `d = 0` (and every whole lap) is today's layout exactly.
 */

/** Walking pace on the pavement, metres per second: an unhurried children's stroll. */
export const WALK_SPEED = 1.15;
/**
 * Pace out in the vacant lot, metres per second. They do not stroll in a vacant lot — that is
 * what the lot is for. More than twice a walking pace is a run you can read at this scale.
 */
export const RUN_SPEED = 2.6;

/** Radius every corner of the loop is rounded to, metres; shorter legs get half their length. */
const CORNER_RADIUS = 0.45;
/** Within this many metres of home a walker eases off the lane onto its spot and turns to the street. */
const HOME_BLEND = 1.5;
/** Half-width of the band round a kerb line over which a walker steps down to the road or up. */
const STEP_BAND = 0.25;
/** The kerb-side line along the near sidewalk: the children stand on it, and the lap runs along it. */
const OUTER_LANE_Z = 7.4;

const { road, streets, standY } = layout;
const zebra = crossingRects();
/**
 * Where they cross the road, and the two edges of the play rectangle inside the vacant lot.
 *
 * The way back uses the crossing that is painted (`zebra.east`), so the walker comes home over
 * a zebra. The way out cuts across at the lot's own open edge, `EAST_X`, because the lot is
 * straight opposite the gate and a child going to the vacant lot does not walk a hundred metres
 * west to use the crossing. That is the one stretch of asphalt with no paint on it.
 */
const WEST_X = (zebra.east.x0 + zebra.east.x1) / 2;
const EAST_X = 4.6;
/** The play rectangle, clear of the pipes, the ring stack and the bamboo bundle. */
const PLAZA_NEAR = 17.4;
const PLAZA_FAR = 28.6;
/** The lot's ground: bare earth, level with the yards either side. */
const PLAZA_Y = 0;
/** How wide the step down over the lot's edge is, metres: the same band the kerbs use. */
const PLAZA_EDGE = 0.3;
/**
 * How far in front of the front wall the ground still counts as pavement, metres. The slab ends
 * at the wall's face and the yard is 12 cm below it, so the step down is a gate's width of
 * ground — wide enough that a child driven through the gate does not slam down 12 cm in a frame.
 */
const YARD_STEP_BAND = 0.6;

/** Corners of the loop in walking order, [x, z]. The loop starts leaving the first one. */
const WAYPOINTS: readonly (readonly [number, number])[] = [
  // The pavement, west of the last home: the lap starts here and runs east past every spot.
  [WEST_X, OUTER_LANE_Z],
  // East of Dekisugi's spot, so the whole row is behind the walker before it turns for the lot.
  [EAST_X, OUTER_LANE_Z],
  // Up off the kerb and into the vacant lot.
  [EAST_X, PLAZA_NEAR],
  [EAST_X, PLAZA_FAR],
  [WEST_X, PLAZA_FAR],
  // Back out to the crossing, and home along the zebra.
  [WEST_X, PLAZA_NEAR],
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
  /** Where each corner's outgoing straight starts, metres round: the lap's own landmarks. */
  const lineS: number[] = [];
  let s = 0;
  for (let k = 0; k < n; k++) {
    lineS[k] = s;
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
  return { pieces, length: s, start: at(corners, 0).b, lineS };
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
  out.y = groundAt(out.x, out.z);
}

/**
 * Height of the ground at (x, z), metres: the pavement slab, the road's zebra paint, the lot's
 * bare earth, the yard behind the wall.
 *
 * Pulled out of the lap's sampler because this is a fact about the place, not about the route.
 * A child walked off its lap by hand stands on the same ground as one following it, and has to
 * read the same kerbs underfoot — otherwise taking hold of someone drops them 12 cm through the
 * pavement, or leaves them standing on air in the vacant lot.
 */
export function groundAt(x: number, z: number): number {
  // Pavement height, easing down onto the zebra paint over the kerb line and back up after.
  const kerb =
    standY + (streets.crossing.top - standY) * smoothstep(-STEP_BAND, STEP_BAND, carriagewayDepth(x, z));
  // The vacant lot is bare earth a kerb below the pavement it opens onto, so the walk steps
  // down over its edge the way it steps down at any other kerb.
  const earth = smoothstep(-PLAZA_EDGE, PLAZA_EDGE, z - layout.sandlot.lot.z0);
  const street = kerb + (PLAZA_Y - kerb) * earth;
  // Behind the front wall the ground drops to the yard: the slab stands 12 cm proud of it, and
  // the step happens in the gate. The lap never comes this way, so this term is inert for it.
  const behind = 1 - smoothstep(-YARD_STEP_BAND, YARD_STEP_BAND / 3, z - layout.wall.frontZ);
  return street + (YARD_Y - street) * behind;
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
  const flip = backward ? Math.PI : 0;
  // Blend in angles measured from the lane heading at home, so the blend never flips sides
  // as the travel heading swings through a corner inside the blend distance.
  const ref = home.laneHeading + flip;
  const travel = wrapPi(out.heading + flip - ref);
  // How far the walker still has to turn to come to rest facing the street. Walking home is a
  // walk in reverse, so it arrives facing the other way and the last few metres are a half
  // turn, not a quarter: over a fixed `HOME_BLEND` that reads as a spin on the spot, so the
  // blend stretches to whatever the turn needs to stay at a turn's rate.
  const turn = Math.abs(wrapPi(home.rotationY - (ref + travel)));
  const blend = HOME_BLEND * Math.max(1, turn / (Math.PI / 2));
  const w = 1 - smoothstep(0, blend, Math.min(lap, loop.length - lap));
  let heading = out.heading + flip;
  if (w > 0) {
    heading = ref + travel + w * (wrapPi(home.rotationY - ref) - travel);
    out.x += w * home.dx;
    out.y += w * home.dy;
    out.z += w * home.dz;
  }
  out.heading = wrapPi(heading);
  return out;
}

/**
 * The stretch of the lap that lies in the vacant lot, metres round from the start: from where
 * the walker leaves the kerb at `PLAZA_NEAR` going in, to where it comes back to it going out.
 * Out there it runs.
 */
const PLAZA_FROM = loop.lineS[2] ?? 0;
const PLAZA_TO = loop.lineS[5] ?? loop.length;

/** True when character `index` is out in the vacant lot, `d` metres round its own lap. */
export function inPlaza(index: number, d: number): boolean {
  const home = homes[index];
  if (!home) return false;
  const p = mod(home.s + d, loop.length);
  return p >= PLAZA_FROM && p < PLAZA_TO;
}

/**
 * Where character `index` sits round the loop, metres from the lap's start, for travel `d`.
 *
 * Two children whose `d` differ still share the lane, so "who is in front of whom" is a
 * question about this number, not about `d`: the homes are spread unevenly and the loop wraps.
 */
export function loopPosition(index: number, d: number): number {
  const home = homes[index];
  if (!home) throw new RangeError(`no character at index ${index}`);
  return mod(home.s + d, loop.length);
}

/**
 * Signed distance from `d` to the nearest whole lap, where everyone is home: positive means
 * walk on, negative means turn round. A tie at half a lap walks on.
 */
export function nearestHomeDelta(d: number): number {
  const lap = mod(d, loop.length);
  return loop.length - lap <= lap ? loop.length - lap : -lap;
}
