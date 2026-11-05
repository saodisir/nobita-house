import type { CharacterDef } from '../data/characters';
import { HOUSE_PATH_LENGTH, housePath, sampleHousePath } from '../data/house-path';
import { layout } from '../data/scene';
import { inPlaza, RUN_SPEED, sampleWalk, WALK_SPEED, type WalkSample } from '../data/walk-routes';
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

/**
 * Where a yard walker is: out on its lap, on its way in through the front door, standing about
 * in the 居間, or on its way back out.
 */
export type WanderLeg = 'yard' | 'in' | 'turn' | 'out';

/** Yard pace, metres per second: a child drifting about its own garden, not going anywhere. */
const YARD_SPEED = 0.8;
/** Indoors, slower: a hall is five metres long and the rooms are full of furniture. */
const INDOOR_SPEED = 0.55;
/** Seconds spent standing in the 居間 before turning round and coming back out. */
const TURN_SECONDS = 7;
/** Seconds for a yard walker to reach its pace, or to come to rest. */
const YARD_EASE = 0.55;
/**
 * The gate, as a way out. The lot is walled and the gate hangs two leaves swung inward, so a
 * child going from its spot to its point on the lap cannot walk the straight line between
 * them: that line crosses the wall beside the gate. It goes to the pavement in front of the
 * opening, straight through the middle of it, and out onto the lap — three short legs, and
 * the only ground on the lot where the two places are joined.
 */
const GATE_X = layout.wall.gateX;
const GATE_OUT = layout.wall.frontZ + 0.25;
const GATE_IN = layout.wall.frontZ - 0.8;
/**
 * How near the front door's point on the lap a child will turn in from, metres. The front is
 * only two metres deep before the wall and the lap runs across it, so six metres covers the
 * whole of it and none of the sides: a child in the back yard keeps walking.
 */
const DOOR_REACH = 6;
/**
 * How near the door's point on the lap an inbound child turns in, metres. Two metres is about
 * five seconds of walking, so passing the gate is a window you can actually catch rather than
 * a frame you could miss.
 */
const DOOR_PASS = 2;
/**
 * The first stretch of the walk into the house, metres, over which the sample is eased off the
 * point on the lap the child turned in from. The lap is a straight line across the front of the
 * house and the walk starts on the path stones, so the two do not quite meet; easing the join
 * over a couple of metres turns that step into the diagonal a child would actually walk.
 */
const ENTRY_BLEND = 2;

/** Distance between two points on a closed lap, metres: the short way round. */
function lapGap(a: number, b: number): number {
  const direct = Math.abs(a - b) % YARD_LOOP_LENGTH;
  return Math.min(direct, YARD_LOOP_LENGTH - direct);
}

export interface WanderState {
  /** This child's index in `characters.ts`: what its lap distance is measured from. */
  index: number;
  kind: WanderKind;
  /** The street's clock, one per child. Unused by a yard walker. */
  clock: WalkClock;
  /** Distance round the yard lap, metres. Unused by a street walker. */
  u: number;
  /** Yard ground speed, m/s. Street speed lives in `clock.speed`. */
  speed: number;
  /** Metres off the yard line, positive away from the house: keeps laps from stacking up. */
  lateral: number;
  /**
   * How far out through the gate this child has walked, 0 at its own spot on the sidewalk and
   * 1 on the lap. The spot sits in front of the wall and the lap behind it, so the two are not
   * the same place; walking between them rather than swapping one for the other is what makes
   * the switch go on without three children appearing inside the garden.
   */
  exit: number;
  /** Length of that walk, metres, measured when it starts: the three legs out through the gate. */
  gateLength: number;
  /** Where on the walk through the house this child is, and how far along it, metres. */
  leg: WanderLeg;
  houseD: number;
  /** Seconds left standing in the 居間 before turning back. */
  turnLeft: number;
  /**
   * What is keeping this child out of the house. `exit` until it has finished walking out of
   * the gate, `away` until it has walked clear of the door again, `null` when the door is a
   * way in. Without this the child stands at the door and goes straight back in for ever.
   */
  doorLock: 'exit' | 'away' | null;
  /** Whether this child ever goes indoors (`character.indoor`). */
  indoor: boolean;
  /**
   * The game this child is caught up in, as a clip name, or null. Set by `wander-pack.ts` when
   * enough of its group are in the same place for long enough: they all stop where they are and
   * do the same thing, which is what turns three children in one garden into a game rather than
   * three separate errands. The clip stays a bare string here — which clips a model can
   * actually play is `walk-clips.ts`'s business, not the route's.
   */
  game: string | null;
  /**
   * The party this child is walking with this afternoon, or null. A party shares one yard
   * distance and keeps a lane each, so two or three of them go side by side and stop together.
   * `wander-pack.ts` syncs the followers to the leader after every advance.
   */
  party: number | null;
  /** Whether this child is the one whose distance the rest of the party follows. */
  partyLeader: boolean;
  /** Multiplier on this child's own pace, drawn once per afternoon by `wander-plan.ts`. */
  pace: number;
  /** The point on the yard lap that lines up with the front door, metres round. */
  doorU: number;
  /** The point on the lap this child turned in from, where the walk into the house eases from. */
  entry: { x: number; z: number };
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
    index,
    kind: yard ? 'yard' : 'street',
    clock: createWalkClock(),
    // The lap point nearest the child's own spot: switching the stroll on then reads as
    // stepping through the gate rather than a jump to the far side of the house.
    u: nearestYardU(def.position[0], def.position[2]),
    speed: 0,
    // Three lanes, so two children on the same stretch of yard pass instead of overlapping.
    lateral: ((index % 3) - 1) * 0.55,
    exit: 0,
    gateLength: 0,
    leg: 'yard',
    houseD: 0,
    turnLeft: 0,
    doorLock: null,
    indoor: def.indoor === true,
    game: null,
    // The afternoon's plan overwrites these when the stroll switch goes on. The defaults are
    // the composed ones, so a child driven on its own (the studio, the unit tests) keeps the
    // pace and the solitude the scene was built with.
    party: null,
    partyLeader: false,
    pace: 1,
    // The lap point level with the front door: the only place the walk into the house starts.
    doorU: nearestYardU(housePath[0]?.x ?? 0, housePath[0]?.z ?? 0),
    entry: { x: def.position[0], z: def.position[2] },
    home: { x: def.position[0], y: def.position[1], z: def.position[2], heading: def.rotationY },
    paused: false,
    // A first pause arrives at a different moment for everyone, then the cycle settles. The lap
    // is sixty metres, so these are short: a child that walks for a third of a minute and then
    // stands for six seconds crosses its own garden twice before it thinks about stopping.
    timer: 5 + index * 1.9,
    walkFor: 8 + (index % 4) * 1.7,
    restFor: 3.5 + (index % 3) * 1.9,
  };
}

/** Reused for the one-off sample taken when a child turns in, so the frame allocates nothing. */
const scratch: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };

/**
 * The three legs out of the yard, metres: across the pavement to the mouth of the gate,
 * straight through it, and out onto the lap. Split by length rather than by time, so a child
 * whose spot is further from the gate takes longer over it instead of breaking into a run.
 */
function gateLegs(state: WanderState, lap: WalkSample) {
  const l0 = Math.hypot(GATE_X - state.home.x, GATE_OUT - state.home.z);
  const l1 = GATE_OUT - GATE_IN;
  const l2 = Math.hypot(lap.x - GATE_X, lap.z - GATE_IN);
  return { l0, l1, l2 };
}

/**
 * Advance one child. `walking` is the walk-mode switch: on, it strolls and pauses as it
 * pleases; off, it heads home (street) or comes to a stop (yard).
 *
 * `clearAhead` is the empty road in front of a street walker, metres, past the gap it keeps;
 * `wander-pack.ts` measures it against the other five. Yard walkers ignore it — their laps
 * are their own, on lanes of their own.
 */
export function advanceWander(
  state: WanderState,
  dt: number,
  walking: boolean,
  clearAhead = Number.POSITIVE_INFINITY,
) {
  /** Standing still for a game, which stops the walk the same way a pause does but sooner. */
  const playing = state.game !== null;
  // A yard walker leaves the gate when the switch goes on and is back on its spot when it goes
  // off — no braking, because there is no route home to brake along: the spot is off the lap.
  // The street walkers need no such flag; their clock walks them home on its own.
  if (state.kind === 'yard') {
    if (!walking) {
      // Calling them back is a cut, not a walk: a child halfway round the back of the house
      // would need a minute, and gliding it home through the walls would be a longer lie than
      // putting the scene back the way it was composed.
      state.exit = 0;
      state.speed = 0;
      state.paused = false;
      state.game = null;
      state.party = null;
      state.partyLeader = false;
      state.timer = state.walkFor;
      state.leg = 'yard';
      state.houseD = 0;
      state.turnLeft = 0;
      state.doorLock = null;
      return;
    }
    if (state.doorLock === null && state.leg === 'yard' && state.exit <= 0) {
      // Letting them out. The spot is in front of the wall and the front door is behind it, so
      // the door is not a way in until the child has actually walked out of the gate.
      state.doorLock = 'exit';
      const legs = gateLegs(state, sampleYard(state.u, state.lateral, scratch));
      state.gateLength = legs.l0 + legs.l1 + legs.l2;
    }
    // Walked at the child's own pace, so the two seconds it takes follow the distance.
    state.exit = Math.min(1, state.exit + (YARD_SPEED * dt) / Math.max(0.1, state.gateLength));
  }

  // Indoors is the one leg the pause timer does not touch: a child in the living room stands
  // about because it got there, not because a timer said so.
  if (state.leg === 'in') {
    state.speed = INDOOR_SPEED * state.pace;
    state.houseD += INDOOR_SPEED * state.pace * dt;
    if (state.houseD >= HOUSE_PATH_LENGTH) {
      state.houseD = HOUSE_PATH_LENGTH;
      state.leg = 'turn';
      state.turnLeft = TURN_SECONDS;
      state.speed = 0;
    }
    return;
  }
  if (state.leg === 'turn') {
    state.speed = 0;
    state.turnLeft -= dt;
    if (state.turnLeft <= 0) state.leg = 'out';
    return;
  }
  if (state.leg === 'out') {
    state.speed = INDOOR_SPEED * state.pace;
    state.houseD -= INDOOR_SPEED * state.pace * dt;
    if (state.houseD <= 0) {
      state.houseD = 0;
      state.leg = 'yard';
      state.speed = 0;
      state.doorLock = 'away';
    }
    return;
  }

  if (walking && !playing) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.paused = !state.paused;
      state.timer = state.paused ? state.restFor : state.walkFor;
    }
  } else if (!walking && state.paused) {
    // Switching off mid-pause must not leave a child standing in the road for five seconds.
    state.paused = false;
    state.timer = state.walkFor;
  }

  if (state.kind === 'street') {
    // They run in the vacant lot and walk on the pavement, and the change is the ground's, not
    // a timer's: the same child is flat out at one end of the lap and strolling at the other.
    // A pause or a game asks for nought, so the clock brakes into it at its usual `ACCEL`
    // instead of freezing on the spot: a child that stops at a run comes to rest over a metre
    // or so, in the walk clip, rather than swapping a run for a clap in a single frame.
    const groundPace = inPlaza(state.index, state.clock.d) ? RUN_SPEED : WALK_SPEED;
    state.clock.cruise = state.paused || playing ? 0 : groundPace * state.pace;
    advanceWalkClock(state.clock, dt, walking, clearAhead);
    return;
  }

  // Coming out of a pause near the front door, this child goes in. Anywhere else on the lap it
  // keeps walking: the walk into the house starts at one point, and walking twenty metres
  // across the garden to reach it is not what a child does with an afternoon.
  const target = walking && !state.paused && !playing ? YARD_SPEED * state.pace : 0;
  // Exponential easing: a child in a garden does not start and stop on a dime like a car.
  state.speed += (target - state.speed) * (1 - Math.exp(-dt / YARD_EASE));
  // Standing still on the lap while walking out of the gate: the child is crossing the
  // pavement, not the garden, and letting `u` run on would leave it a couple of metres
  // behind the point it steps onto and turn the last leg into a sprint to catch up.
  if (state.exit >= 1) state.u = (state.u + state.speed * dt) % YARD_LOOP_LENGTH;

  if (!state.indoor) return;
  const gap = lapGap(state.u, state.doorU);
  // Out of the gate a moment ago, or out of the house: walk clear of the door before it counts
  // as a way in again, or the child would step out of it and straight back into it for ever.
  if (state.doorLock === 'exit') {
    if (state.exit < 1) return;
    state.doorLock = null;
  }
  if (state.doorLock === 'away') {
    if (gap > DOOR_REACH) state.doorLock = null;
    return;
  }
  // The lap passes the gate once a lap, so waiting for it rather than for a pause that happens
  // to land there is what makes going indoors something you can actually watch happen.
  // A child walking side by side with two others is not going to peel off into the house on
  // its own; the party would have to split. It takes its turn indoors on an afternoon it is
  // on its own, which the next plan decides.
  if (!state.paused && !playing && state.party === null && gap < DOOR_PASS) {
    // Where on the lap the child was when it turned in: the walk into the house eases off this
    // point so the join is a step in the right direction rather than a jump onto the path.
    const at = sampleYard(state.u, state.lateral, scratch);
    state.entry.x = at.x;
    state.entry.z = at.z;
    state.leg = 'in';
    state.houseD = 0;
    state.speed = 0;
  }
}

/** Ground speed of this child, m/s, for matching the walk clip's playback rate. */
export function wanderSpeed(state: WanderState): number {
  return state.kind === 'street' ? state.clock.speed : state.speed;
}

/**
 * True when this child is out where children play rather than waiting at the kerb: the vacant
 * lot for a street walker, the garden for one that has already come out through the gate. This
 * is the flag that decides between a play clip and a standing one, and the one that groups
 * children into games.
 */
export function isPlaying(state: WanderState): boolean {
  if (state.kind === 'street') return inPlaza(state.index, state.clock.d);
  return state.leg === 'yard' && state.exit >= 1;
}

/**
 * Where this child is now, into `out`. The street's sampler also blends a walker onto its
 * exact home spot near the start of a lap, so at rest this reproduces `characters.ts`.
 */
export function sampleWander(state: WanderState, index: number, out: WalkSample): WalkSample {
  if (state.kind === 'yard') {
    if (state.leg !== 'yard') {
      sampleHousePath(state.houseD, out);
      // Off the point on the lap the child turned in from, easing onto the path over the first
      // couple of metres. At both ends of the walk that point is where the yard sampler left
      // the child, so the join is continuous going in and coming out.
      const join = 1 - Math.min(1, state.houseD / ENTRY_BLEND);
      if (join > 0) {
        out.x += (state.entry.x - PATH_START.x) * join;
        out.z += (state.entry.z - PATH_START.z) * join;
      }
      // The walk is stored the way in; on the way out the child faces the other way.
      if (state.leg === 'out') out.heading = wrapPi(out.heading + Math.PI);
      return out;
    }
    if (state.exit <= 0) {
      out.x = state.home.x;
      out.y = state.home.y;
      out.z = state.home.z;
      out.heading = state.home.heading;
      return out;
    }
    const walk = sampleYard(state.u, state.lateral, out);
    if (state.exit < 1) {
      // Out through the gate, by distance along the three legs, so the child covers ground at
      // one pace the whole way instead of hurrying whichever leg is longest.
      const { l0, l1, l2 } = gateLegs(state, walk);
      const s = state.exit * (l0 + l1 + l2);
      const leg = s < l0 ? 0 : s < l0 + l1 ? 1 : 2;
      const f = leg === 0 ? s / l0 : leg === 1 ? (s - l0) / l1 : (s - l0 - l1) / l2;
      const [ax, az] =
        leg === 0 ? [state.home.x, state.home.z] : leg === 1 ? [GATE_X, GATE_OUT] : [GATE_X, GATE_IN];
      const [bx, bz] = leg === 0 ? [GATE_X, GATE_OUT] : leg === 1 ? [GATE_X, GATE_IN] : [walk.x, walk.z];
      out.x = ax + (bx - ax) * f;
      out.z = az + (bz - az) * f;
      // The pavement is 12 cm above the yard; the step down happens on the way through.
      out.y = state.home.y + (walk.y - state.home.y) * state.exit;
    }
    return out;
  }
  return sampleWalk(index, state.clock.d, out, state.clock.dir < 0);
}

/** The walk into the house starts here; the join above is measured off it. */
const PATH_START = housePath[0] ?? { x: 0, z: 0 };

const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
