import { config } from '../config';
import type { CharacterDef } from '../data/characters';
import { onHouse } from '../data/house-site';
import { layout, type Rect } from '../data/scene';
import { groundAt, RUN_SPEED } from '../data/walk-routes';
import { poseFor } from '../state/character-poses';
import { RUN_AT } from './walk-clips';

/**
 * Taking a child off its route and driving it by hand.
 *
 * Everything else in the diorama decides where a character is: `wander.ts` walks it round a lap,
 * `yard-route.ts` round the garden, and neither asks. This is the one place the visitor answers
 * instead. The child's own `WanderState` is frozen while it is held — not advanced and thrown
 * away, so letting go puts it back on the lap it was walking rather than somewhere new.
 *
 * The integration lives here rather than in the component so it can be tested without a
 * renderer: `advanceHold` is ordinary arithmetic over `heldPose`, and the frame that renders it
 * only copies the result onto a `Group`.
 */

/** Pace under the hand, metres per second. Between the stroll and the run the routes use. */
const WALK = 1.7;
/** Shift, held: a child running flat out. */
const RUN = 3.4;
/**
 * Seconds to reach the asked-for pace, or to come to rest. Short — this is direct control, and
 * a child that takes half a second to answer a key reads as a bad connection.
 */
const EASE = 0.12;
/** How fast the yaw closes on the direction of travel, per second. A turn, not a snap. */
const TURN_RATE = 10;
/** How fast the feet take up a new ground height, per second: the 12 cm kerb is one step. */
const STEP_RATE = 16;
/** Half the width of a child's shoulders: it stops at a wall instead of standing in one. */
const RADIUS = 0.22;

/**
 * The lot's boundary wall, split around the gate. Same numbers `free-walk.tsx` collides against,
 * built from `layout` so a wall that moves moves both.
 */
const WALL_T = layout.lot.wallThickness / 2;
const HALF_W = layout.lot.width / 2;
const FRONT = layout.wall.frontZ;
const BACK = FRONT - layout.lot.depth;
const GATE_X = layout.wall.gateX;
const GATE = layout.wall.gateWidth / 2;

const WALLS: readonly Rect[] = [
  { x0: -HALF_W, x1: GATE_X - GATE, z0: FRONT - WALL_T, z1: FRONT + WALL_T },
  { x0: GATE_X + GATE, x1: HALF_W, z0: FRONT - WALL_T, z1: FRONT + WALL_T },
  { x0: -HALF_W, x1: HALF_W, z0: BACK - WALL_T, z1: BACK + WALL_T },
  { x0: -HALF_W - WALL_T, x1: -HALF_W + WALL_T, z0: BACK, z1: FRONT },
  { x0: HALF_W - WALL_T, x1: HALF_W + WALL_T, z0: BACK, z1: FRONT },
];

/** Keys held this frame. Cleared whenever the child is let go or the window loses focus. */
export const heldKeys = new Set<string>();

/** Where the held child is, what it is doing. Mutated per frame; never a re-render. */
export const heldPose = {
  x: 0,
  y: 0,
  z: 0,
  heading: 0,
  speed: 0,
  moving: false,
  running: false,
};

/** Whether the child of `RADIUS` at (x, z) is standing in something: a wall, the house, the edge. */
export function blocked(x: number, z: number): boolean {
  // The camera's target box is the block the diorama is framed on; walking out of it would
  // leave the lens clamped behind, watching its subject walk off the edge of the world.
  const { x0, x1, z0, z1 } = config.targetBounds;
  if (x < x0 + RADIUS || x > x1 - RADIUS || z < z0 + RADIUS || z > z1 - RADIUS) return true;
  for (const wall of WALLS) {
    if (x > wall.x0 - RADIUS && x < wall.x1 + RADIUS && z > wall.z0 - RADIUS && z < wall.z1 + RADIUS) {
      return true;
    }
  }
  // The house is solid. Checked at the body's four extremes rather than only its centre, so a
  // shoulder does not sink into the stucco before the middle of the child reaches it.
  return (
    onHouse(x, z) ||
    onHouse(x + RADIUS, z) ||
    onHouse(x - RADIUS, z) ||
    onHouse(x, z + RADIUS) ||
    onHouse(x, z - RADIUS)
  );
}

/** The shortest way round: a yaw difference wrapped into (−π, π]. */
const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/**
 * Take hold of `def`: start from where it is standing right now, with no speed and no keys.
 *
 * Reading the live pose rather than the definition's spot is what makes taking hold of a child
 * that is halfway round the garden a change of driver rather than a teleport to the pavement.
 */
export function beginHold(def: CharacterDef) {
  const pose = poseFor(def.id);
  heldPose.x = pose.position.x;
  heldPose.y = pose.position.y;
  heldPose.z = pose.position.z;
  heldPose.heading = pose.heading;
  heldPose.speed = 0;
  heldPose.moving = false;
  heldPose.running = false;
  heldKeys.clear();
}

/**
 * One frame of driving, metres and seconds.
 *
 * `fx, fz` is where the camera is looking, flattened: the keys are read relative to the view, so
 * W always walks away from the visitor and the controls keep their meaning however far the orbit
 * has been dragged round. Returns the same object `heldPose`, for the caller's convenience.
 */
export function advanceHold(dt: number, fx: number, fz: number) {
  const forward =
    (heldKeys.has('KeyW') || heldKeys.has('ArrowUp') ? 1 : 0) -
    (heldKeys.has('KeyS') || heldKeys.has('ArrowDown') ? 1 : 0);
  const strafe =
    (heldKeys.has('KeyD') || heldKeys.has('ArrowRight') ? 1 : 0) -
    (heldKeys.has('KeyA') || heldKeys.has('ArrowLeft') ? 1 : 0);
  const asked = forward !== 0 || strafe !== 0;

  if (asked) {
    let ax = fx;
    let az = fz;
    let length = Math.hypot(ax, az);
    if (length < 1e-3) {
      // Looking straight down: there is no "away from the camera" on the ground, so fall back to
      // whichever way the child is already facing rather than refusing to move.
      ax = Math.sin(heldPose.heading);
      az = Math.cos(heldPose.heading);
      length = 1;
    }
    ax /= length;
    az /= length;
    // Right of the camera's forward, on the ground plane.
    const dx = ax * forward - az * strafe;
    const dz = az * forward + ax * strafe;
    const want = Math.atan2(dx, dz);
    heldPose.heading = wrapPi(
      heldPose.heading + wrapPi(want - heldPose.heading) * (1 - Math.exp(-TURN_RATE * dt)),
    );
  }

  const pace = asked ? (heldKeys.has('ShiftLeft') || heldKeys.has('ShiftRight') ? RUN : WALK) : 0;
  heldPose.speed += (pace - heldPose.speed) * (1 - Math.exp(-dt / EASE));
  if (!asked && heldPose.speed < 0.02) heldPose.speed = 0;

  if (heldPose.speed > 0) {
    const step = heldPose.speed * dt;
    // Travel along the yaw rather than along the keys, so a turn while walking is a curve: the
    // child leans into it instead of sidestepping the way the stick was pushed a frame ago.
    const dx = Math.sin(heldPose.heading) * step;
    const dz = Math.cos(heldPose.heading) * step;
    // Taken hold of somewhere it could not have walked to — indoors, on the porch steps — the
    // child is inside a collider and every direction is blocked, which would pin it there for
    // good. The first thing it must be able to do is get out.
    const trapped = blocked(heldPose.x, heldPose.z);
    // Axis by axis, so a child pressed into a wall slides along it instead of sticking.
    const intoX = !trapped && blocked(heldPose.x + dx, heldPose.z);
    const intoZ = !trapped && blocked(heldPose.x, heldPose.z + dz);
    if (!intoX) heldPose.x += dx;
    if (!intoZ) heldPose.z += dz;
    if (intoX && intoZ) heldPose.speed = 0;
  }

  const ground = groundAt(heldPose.x, heldPose.z);
  heldPose.y += (ground - heldPose.y) * Math.min(1, dt * STEP_RATE);
  heldPose.moving = heldPose.speed > 0.08;
  // The same threshold the walker uses to choose between the walk and run clips, so the legs
  // and the ground under them agree without either side knowing about the other.
  heldPose.running = heldPose.speed >= RUN_AT * RUN_SPEED;
  return heldPose;
}
