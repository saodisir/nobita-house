import type { CharacterDef } from '../data/characters';
import { sampleWalk, type WalkSample } from '../data/walk-routes';
import { nearestYardU, sampleYard, YARD_LOOP_LENGTH } from '../data/yard-route';
import { advanceWalkClock, createWalkClock, type WalkClock } from './walk-clock';

/**
 * What one child is doing, independently of the other five.
 *
 * The diorama used to drive all six from a single `walkClock`, which is exactly what made a
 * group of children read as a formation: one distance placed everybody, so nobody could be
 * early, late, or stopped. This gives each child its own lap, its own pace and its own pauses,
 * and splits them across two loops — the street, and the yard round the house.
 *
 * Two kinds, because the two loops answer different questions:
 *
 * - `street` keeps `walk-clock.ts` exactly as it was, one clock per child. That clock carries
 *   the careful braking and the turn-round hold that lands a walker on its home spot when the
 *   switch goes off, and none of that is worth rewriting.
 * - `yard` cannot reuse it: that clock brakes on `WALK_LOOP_LENGTH`, a constant of the street
 *   loop, so a yard walker would stop a lap early. It just eases toward a speed and wraps its
 *   own distance, and when the switch goes off it stands still where it is — a child told to
 *   stop in the garden stops, it does not walk back to a spot.
 */

export type WanderKind = 'street' | 'yard';

/** Yard pace, metres per second: a child drifting about its own garden, not going anywhere. */
const YARD_SPEED = 0.8;
/** Seconds for a yard walker to reach its pace, or to come to rest. */
const YARD_EASE = 0.55;

export interface WanderState {
  kind: WanderKind;
  /** The street's clock, one per child. Unused by a yard walker. */
  clock: WalkClock;
  /** Distance round the yard lap, metres. Unused by a street walker. */
  u: number;
  /** Yard ground speed, m/s. Street speed lives in `clock.speed`. */
  speed: number;
  /** Metres off the yard line, positive away from the house: keeps laps from stacking up. */
  lateral: number;
  /** Whether a yard walker has left the gate. False puts it back on its own spot. */
  away: boolean;
  /** The spot on the sidewalk from `characters.ts`, where a yard walker stands at rest. */
  home: { x: number; y: number; z: number; heading: number };
  paused: boolean;
  /** Seconds until the next change of state. */
  timer: number;
  /** Seconds spent walking before the next pause. */
  walkFor: number;
  /** Seconds spent standing before the next stretch of walking. */
  restFor: number;
}

/**
 * Each child's own wander, staggered by index. The stagger is what does the work: same route,
 * same clips, but nobody sets off, turns or stops at the same moment as anyone else.
 */
export function createWander(index: number, def: CharacterDef): WanderState {
  const yard = def.wander === 'yard';
  return {
    kind: yard ? 'yard' : 'street',
    clock: createWalkClock(),
    // The lap point nearest the child's own spot: switching the stroll on then reads as
    // stepping through the gate rather than a jump to the far side of the house.
    u: nearestYardU(def.position[0], def.position[2]),
    speed: 0,
    // Three lanes, so two children on the same stretch of yard pass instead of overlapping.
    lateral: ((index % 3) - 1) * 0.55,
    away: false,
    home: { x: def.position[0], y: def.position[1], z: def.position[2], heading: def.rotationY },
    paused: false,
    // A first pause arrives at a different moment for everyone, then the cycle settles.
    timer: 7 + index * 1.9,
    walkFor: 9 + (index % 4) * 1.7,
    restFor: 5 + (index % 3) * 2.3,
  };
}

/**
 * Advance one child. `walking` is the walk-mode switch: on, it strolls and pauses as it
 * pleases; off, it heads home (street) or comes to a stop (yard).
 */
export function advanceWander(state: WanderState, dt: number, walking: boolean) {
  // A yard walker leaves the gate when the switch goes on and is back on its spot when it goes
  // off — no braking, because there is no route home to brake along: the spot is off the lap.
  // The street walkers need no such flag; their clock walks them home on its own.
  if (state.kind === 'yard') {
    state.away = walking;
    if (!walking) {
      state.speed = 0;
      state.paused = false;
      state.timer = state.walkFor;
      return;
    }
  }

  if (walking) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.paused = !state.paused;
      state.timer = state.paused ? state.restFor : state.walkFor;
    }
  } else if (state.paused) {
    // Switching off mid-pause must not leave a child standing in the road for five seconds.
    state.paused = false;
    state.timer = state.walkFor;
  }

  if (state.kind === 'street') {
    // Freezing the clock rather than zeroing a speed keeps its braking and turn-round state
    // intact across the pause: a walker resumes mid-stride, the way a walker would.
    advanceWalkClock(state.clock, state.paused ? 0 : dt, walking);
    return;
  }

  const target = walking && !state.paused ? YARD_SPEED : 0;
  // Exponential easing: a child in a garden does not start and stop on a dime like a car.
  state.speed += (target - state.speed) * (1 - Math.exp(-dt / YARD_EASE));
  state.u = (state.u + state.speed * dt) % YARD_LOOP_LENGTH;
}

/** Ground speed of this child, m/s, for matching the walk clip's playback rate. */
export function wanderSpeed(state: WanderState): number {
  return state.kind === 'street' ? state.clock.speed : state.speed;
}

/**
 * Where this child is now, into `out`. The street's sampler also blends a walker onto its
 * exact home spot near the start of a lap, so at rest this reproduces `characters.ts`.
 */
export function sampleWander(state: WanderState, index: number, out: WalkSample): WalkSample {
  if (state.kind === 'yard') {
    if (!state.away) {
      out.x = state.home.x;
      out.y = state.home.y;
      out.z = state.home.z;
      out.heading = state.home.heading;
      return out;
    }
    return sampleYard(state.u, state.lateral, out);
  }
  return sampleWalk(index, state.clock.d, out, state.clock.dir < 0);
}
