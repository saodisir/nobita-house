import { ROOMS, type RoomId, WALLS } from '../editor/house/plan';
import { HOUSE_ORIGIN, rectToWorld } from './house-site';
import type { Rect } from './scene';

/**
 * The one way into Nobita's house on foot: the yard, the porch, the front door, the 玄関, the
 * hall, and the 居間 at the end of it.
 *
 * A path, not a graph. The house is ten rooms and nine doors, and a shortest-path search over
 * them would be a hundred lines of routing to answer a question nobody asks: a child walking in
 * goes to the living room, because that is where the house is. The walk is measured off
 * `plan.ts` and `house-site.ts` rather than authored in world metres, so a wall that moves in
 * the plan moves the walk with it.
 *
 * Only the ground storey. The flight is 0.78 m between its wall and its knee wall, twelve
 * risers of 0.225, and the `walk` clip is a flat-ground cycle: a child climbing it would slide
 * up with its feet through the treads. Upstairs waits for a stair clip.
 */

export interface HouseStep {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians, the characters' convention: 0 faces +Z. */
  heading: number;
  /** A door that has to be got through to reach this step. */
  door?: string;
  /** The last step before the turn: the child stands here a while, then comes back out. */
  turn?: true;
}

/** Centre line of a door in world metres, whichever wall it sits in. */
function doorCentre(id: string): { x: number; z: number } {
  for (const wall of WALLS) {
    for (const opening of wall.openings) {
      if (opening.kind !== 'door' || opening.id !== id) continue;
      const along = (opening.from + opening.to) / 2;
      return wall.axis === 'x'
        ? { x: along + HOUSE_ORIGIN.x, z: wall.at + HOUSE_ORIGIN.z }
        : { x: wall.at + HOUSE_ORIGIN.x, z: along + HOUSE_ORIGIN.z };
    }
  }
  throw new Error(`plan.ts has no door ${id}`);
}

function roomRect(id: RoomId): Rect {
  const room = ROOMS.find((r) => r.id === id);
  const first = room?.rects[0];
  if (!room || !first) throw new Error(`plan.ts has no room ${id}`);
  return rectToWorld(first);
}

const front = doorCentre('door-front');
const livingDoor = doorCentre('door-living');
const genkan = roomRect('genkan');

/** The 居間 and hall floor, and the 玄関's: the only two levels this walk crosses. */
const ROOM_Y = 0.4;
const GENKAN_Y = 0.12;
/** How far onto the porch the walk leaves the yard, metres off the door. */
const PORCH = 0.71;
/** How far out into the yard the walk begins, metres off the door. */
const OUTSIDE = 2.0;
/**
 * How far into the 居間 the walk ends, metres inside its door. The room is 3.6 m square and
 * carries a kotatsu, three tansu, a TV stand and a low cabinet, which leaves the floor just
 * inside the sliding door as the only patch a child can stand in without a knee through the
 * table. `house-path.test.ts` holds it off every piece of furniture in the room.
 */
const INTO_LIVING = 0.6;

type Spot = Omit<HouseStep, 'heading'>;

const SPOTS: Spot[] = [
  // Out in the yard on the gate's axis, where the yard loop crosses it.
  { x: front.x, y: 0, z: front.z + OUTSIDE },
  // Onto the porch, under the eave.
  { x: front.x, y: 0, z: front.z + PORCH },
  // Through the front door: the step sits in the middle of the opening, on the threshold
  // itself, so the door is opened before the child is in the frame of it rather than after.
  { x: front.x, y: GENKAN_Y, z: front.z, door: 'door-front' },
  // Off the 玄関's sunken floor and up onto the hall.
  { x: front.x, y: ROOM_Y, z: genkan.z0 + 0.1 },
  // Along the hall until the 居間's door is square on the left.
  { x: front.x, y: ROOM_Y, z: livingDoor.z },
  // Through it, in the middle of the opening.
  { x: livingDoor.x, y: ROOM_Y, z: livingDoor.z, door: 'door-living' },
  // A step into the room, on the door's own axis, and stop.
  { x: livingDoor.x - INTO_LIVING, y: ROOM_Y, z: livingDoor.z, turn: true },
];

/** Each spot faces the next one, so the walk turns at the corners without being told to. */
const steps: HouseStep[] = SPOTS.map((spot, i) => {
  const next = SPOTS[i + 1];
  const prev = SPOTS[i - 1];
  // The last spot has nowhere to walk to, so it keeps facing the way it came.
  const aim = next ?? (prev ? { x: spot.x * 2 - prev.x, z: spot.z * 2 - prev.z } : spot);
  return { ...spot, heading: Math.atan2(aim.x - spot.x, aim.z - spot.z) };
});

export const housePath: readonly HouseStep[] = steps;

interface Seg {
  s: number;
  length: number;
  from: HouseStep;
  to: HouseStep;
}

const segments: Seg[] = [];
let total = 0;
for (let i = 0; i < steps.length - 1; i++) {
  const from = steps[i];
  const to = steps[i + 1];
  if (!from || !to) continue;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (length < 1e-9) continue;
  segments.push({ s: total, length, from, to });
  total += length;
}

/** Length of the walk from the yard to the far side of the 居間, metres. */
export const HOUSE_PATH_LENGTH = total;

export interface HouseSample {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * Position `d` metres along the walk, into `out`. Heights ease between two steps, so the
 * 玄関's sunken floor and the hall's 0.28 m step are a slope underfoot rather than a jolt.
 * Below zero sits at the yard end; past the end, at the turn.
 */
export function sampleHousePath(d: number, out: HouseSample): HouseSample {
  const u = Math.max(0, Math.min(total, d));
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((segments[mid]?.s ?? 0) <= u) lo = mid;
    else hi = mid - 1;
  }
  const seg = segments[lo];
  if (!seg) {
    const first = steps[0];
    out.x = first?.x ?? 0;
    out.y = first?.y ?? 0;
    out.z = first?.z ?? 0;
    out.heading = first?.heading ?? 0;
    return out;
  }
  const t = Math.min(1, Math.max(0, (u - seg.s) / seg.length));
  out.x = seg.from.x + (seg.to.x - seg.from.x) * t;
  out.y = seg.from.y + (seg.to.y - seg.from.y) * t;
  out.z = seg.from.z + (seg.to.z - seg.from.z) * t;
  out.heading = seg.from.heading;
  return out;
}

/** Every door on the walk, in the order they are met going in. */
export const housePathDoors: readonly string[] = steps.flatMap((step) => (step.door ? [step.door] : []));

/** How far along the walk a door is met, so it can be opened before the child arrives. */
export function doorDistance(door: string): number {
  for (const seg of segments) if (seg.to.door === door) return seg.s + seg.length;
  return total;
}
