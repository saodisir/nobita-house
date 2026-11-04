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
 * How far past a corner a child's lane swings back out to its own offset, metres.
 *
 * A lane is an offset from the lap, and the lap's offset direction turns by a right angle at
 * each corner: carried through unchanged, a child in the 0.55 m lane would be thrown 0.78 m
 * sideways in a single frame. Shrinking the lane to nothing through the corner was the first
 * answer, and it made every corner the one place all three children converge — two of them
 * arriving together walked through each other. So the offset keeps its distance and only its
 * *direction* turns, over this many metres, which is a child swinging wide round the corner.
 */
const CORNER_FADE = 1.2;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * The outboard unit normal at `along` metres into segment `index`.
 *
 * For the first `CORNER_FADE` metres of a segment it turns from the previous segment's normal
 * to this one's, so the lane leaves the corner in the direction it arrived in and comes round
 * to the new side over a stride and a bit. Both sides of a corner therefore agree at the
 * corner itself, which is what keeps the walk continuous.
 */
function outboardNormal(index: number, along: number): readonly [number, number] {
  const cur = segments[index];
  const prev = segments[(index - 1 + segments.length) % segments.length];
  if (!cur || !prev) throw new RangeError('yard loop has no segments');
  const bx = -cur.dz;
  const bz = cur.dx;
  const t = smooth(Math.min(1, along / CORNER_FADE));
  if (t >= 1) return [bx, bz];
  const ax = -prev.dz;
  const az = prev.dx;
  const x = ax + (bx - ax) * t;
  const z = az + (bz - az) * t;
  // Between two right-angle normals the blend is 0.78 long: length is what the lane is for,
  // so it is put back rather than left to shrink through the corner.
  const len = Math.hypot(x, z) || 1;
  return [x / len, z / len];
}

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
  const [nx, nz] = outboardNormal(lo, along);
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
