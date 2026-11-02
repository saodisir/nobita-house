import { HOUSE_FOOTPRINT } from './house-site';
import { layout } from './scene';

/**
 * The yard loop: one lap round the house, from the gate round the east side, along the back
 * yard and home up the west side.
 *
 * The street's loop (`walk-routes.ts`) is shared on purpose — one distance places all six and
 * their spacing never changes, which is what makes them read as a group photo. This one is the
 * opposite: each child runs its own lap, at its own pace, offset from the line, so the yard
 * reads as children playing instead of a procession. Nothing here is authored: the four sides
 * are measured off `HOUSE_FOOTPRINT`, so moving the house moves the loop with it.
 */

/** What the yard stands on: one flat surface of soil and grass, the path stones included. */
export const YARD_Y = 0;

/** Metres between the loop and the house's outer walls. */
const CLEAR = 1.5;
/** Metres kept off the lot's boundary walls at the back and the sides. */
const WALL_CLEAR = 1.5;
/**
 * The front is only 2 m deep between the house and the front wall, so it takes a narrower
 * clearance than the rest: a lap out there still has to clear both the eaves and the wall.
 */
const FRONT_CLEAR = 1.05;

const LOT_HALF_W = layout.lot.width / 2;
const LOT_BACK = layout.wall.frontZ - layout.lot.depth;

const front = Math.min(HOUSE_FOOTPRINT.z1 + FRONT_CLEAR, layout.wall.frontZ - 1.1);
const back = Math.max(HOUSE_FOOTPRINT.z0 - 2, LOT_BACK + WALL_CLEAR);
const east = Math.min(HOUSE_FOOTPRINT.x1 + CLEAR, LOT_HALF_W - WALL_CLEAR);
const west = Math.max(HOUSE_FOOTPRINT.x0 - CLEAR, -LOT_HALF_W + WALL_CLEAR);
/** The gate's axis: the one point on the loop a walker can leave the lot through. */
const gate = layout.wall.gateX;

/**
 * Corners in walking order, clockwise seen from above: out east along the front, down the
 * east side, back along the back yard, up the west side, and home across the front to the gate.
 */
const CORNERS: readonly (readonly [number, number])[] = [
  [gate, front],
  [east, front],
  [east, back],
  [west, back],
  [west, front],
];

interface Seg {
  /** Distance from the start of the lap to this segment's first point, metres. */
  s: number;
  length: number;
  x: number;
  z: number;
  dx: number;
  dz: number;
}

const segments: Seg[] = [];
let total = 0;
for (let i = 0; i < CORNERS.length; i++) {
  const a = CORNERS[i];
  const b = CORNERS[(i + 1) % CORNERS.length];
  if (!a || !b) continue;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-9) continue;
  segments.push({
    s: total,
    length: len,
    x: a[0],
    z: a[1],
    dx: (b[0] - a[0]) / len,
    dz: (b[1] - a[1]) / len,
  });
  total += len;
}

/** Length of one lap round the yard, metres. */
export const YARD_LOOP_LENGTH = total;

export interface YardSample {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians, the characters' convention: 0 faces +Z. */
  heading: number;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/**
 * Position `u` metres round the lap, `lateral` metres off the line on the outboard side
 * (positive away from the house), into `out`. The lap is a closed rectangle, so `u` wraps.
 */
export function sampleYard(u: number, lateral: number, out: YardSample): YardSample {
  const t = mod(u, total);
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((segments[mid]?.s ?? 0) <= t) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo];
  if (!seg) throw new RangeError('yard loop has no segments');
  const along = Math.min(t - seg.s, seg.length);
  // The outboard normal of a clockwise lap is the direction turned a quarter the other way.
  const nx = -seg.dz;
  const nz = seg.dx;
  out.x = seg.x + seg.dx * along + nx * lateral;
  out.y = YARD_Y;
  out.z = seg.z + seg.dz * along + nz * lateral;
  out.heading = Math.atan2(seg.dx, seg.dz);
  return out;
}

/** The four sides of the lap in world metres, for tests and for drawing it. */
export const yardCorners = CORNERS;

/**
 * The point on the lap closest to (x, z), in metres round from the gate.
 *
 * A child's home is out on the sidewalk, in front of the wall, and the lap is behind that wall.
 * Starting it at the nearest point instead of at the gate means stepping through the gate and
 * on into the yard — a metre and a half of walking — rather than being flung to the far side of
 * the house the moment the switch goes on.
 */
export function nearestYardU(x: number, z: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const seg of segments) {
    // Projection of the point onto the segment, clamped to its ends.
    const along = Math.max(0, Math.min(seg.length, (x - seg.x) * seg.dx + (z - seg.z) * seg.dz));
    const px = seg.x + seg.dx * along;
    const pz = seg.z + seg.dz * along;
    const distance = (x - px) ** 2 + (z - pz) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = seg.s + along;
    }
  }
  return best;
}
