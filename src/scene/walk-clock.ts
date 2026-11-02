import { nearestHomeDelta, WALK_LOOP_LENGTH, WALK_SPEED } from '../data/walk-routes';

/** Reaches walking pace in 0.6 s, and brakes just as quickly. */
const ACCEL = WALK_SPEED / 0.6;
/** Pause at a standstill after a direction change, while everyone turns round. */
const TURN_HOLD = 0.35;
/** A backgrounded tab resumes with one huge delta; never step further than this at once. */
const MAX_DT = 0.1;

export type WalkPhase = 'home' | 'walking' | 'returning';

/**
 * The one distance that moves all six walkers round the loop (see `walk-routes.ts`), with
 * the speed and direction it changes at. Plain mutable state, advanced once per frame.
 */
export interface WalkClock {
  /** Metres walked round the loop, kept within one lap: 0 ≤ d < WALK_LOOP_LENGTH. */
  d: number;
  /** Ground speed, m/s, never negative; `dir` carries the sign. */
  speed: number;
  dir: 1 | -1;
  phase: WalkPhase;
  /** The way home, chosen once when the return begins. */
  homeDir: 1 | -1;
  /** Seconds left standing still after turning round. */
  hold: number;
}

export function createWalkClock(): WalkClock {
  return { d: 0, speed: 0, dir: 1, phase: 'home', homeDir: 1, hold: 0 };
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/** Brake to a stop; once stopped, face `dir` and wait for everyone to finish turning. */
function brakeToward(c: WalkClock, dir: 1 | -1, dt: number) {
  c.speed = Math.max(0, c.speed - ACCEL * dt);
  if (c.speed === 0) {
    c.dir = dir;
    c.hold = TURN_HOLD;
  }
}

/**
 * Advance by `dt` seconds. With `walkMode` on, walk forward at `WALK_SPEED` (braking and
 * turning round first if heading home backwards). Off, head for the nearest whole lap and
 * brake so `d` lands exactly on it, then rest at home with `d = 0`.
 */
export function advanceWalkClock(c: WalkClock, dt: number, walkMode: boolean) {
  const step = Math.min(Math.max(dt, 0), MAX_DT);
  const lap = WALK_LOOP_LENGTH;

  if (walkMode) {
    c.phase = 'walking';
  } else if (c.phase === 'home') {
    return;
  } else if (c.phase === 'walking') {
    // Pick the way home from where braking now would come to rest, so a stop just short of
    // home never has to brake harder than `ACCEL`: past the boundary, it stops and walks back.
    c.phase = 'returning';
    const stopAt = c.d + (c.dir * c.speed * c.speed) / (2 * ACCEL);
    c.homeDir = nearestHomeDelta(stopAt) >= 0 ? 1 : -1;
  }
  const want = walkMode ? 1 : c.homeDir;

  if (c.hold > 0) {
    // Still standing: a change of mind turns straight round instead of finishing the old turn.
    if (c.dir !== want) {
      c.dir = want;
      c.hold = TURN_HOLD;
    }
    c.hold = Math.max(0, c.hold - step);
    return;
  }
  if (c.dir !== want) {
    brakeToward(c, want, step);
  } else if (walkMode) {
    c.speed = Math.min(WALK_SPEED, c.speed + ACCEL * step);
  } else {
    // Distance still to go the way we are walking; braking at `ACCEL` from `sqrt(2·a·s)`
    // stops exactly on the boundary.
    const remaining = c.dir > 0 ? (c.d === 0 ? 0 : lap - c.d) : c.d;
    c.speed = Math.min(WALK_SPEED, c.speed + ACCEL * step, Math.sqrt(2 * ACCEL * remaining));
    if (c.speed * step >= remaining - 1e-6) {
      c.d = 0;
      c.speed = 0;
      c.dir = 1;
      c.phase = 'home';
      return;
    }
  }
  c.d = mod(c.d + c.dir * c.speed * step, lap);
}

/** The clock every walker reads. */
export const walkClock = createWalkClock();

let lastTick = Number.NaN;

/**
 * Advance the shared clock to frame time `elapsed`. Every walker calls this from its own
 * `useFrame`; only the first call per frame moves the clock, so frame order does not matter.
 */
export function tickWalkClock(elapsed: number, walkMode: boolean) {
  if (elapsed === lastTick) return;
  const dt = Number.isNaN(lastTick) ? 0 : elapsed - lastTick;
  lastTick = elapsed;
  advanceWalkClock(walkClock, dt, walkMode);
}
