import { loopPosition, WALK_LOOP_LENGTH } from '../data/walk-routes';
import { GAME_CLIPS } from './walk-clips';
import { advanceWander, isPlaying, type WanderKind, type WanderState } from './wander';

/**
 * The six children, advanced together.
 *
 * Each child owns its `WanderState` and used to advance it from its own `useFrame`, which was
 * fine while nothing depended on a neighbour. The street is different: it is *one* lane, and
 * every street walker is a point on that same line, so a child that pauses is a wall across it.
 * Following distance is a question about all six at once, so the advance moved here — one pass
 * per frame over the whole pack, in index order, with the gaps measured before anyone moves.
 *
 * The yard walkers ride along on the same pass and ignore the gaps: their laps are their own,
 * with three lanes between them, so nothing here applies.
 */

/**
 * Centre-to-centre distance two children keep walking the same way round the street, metres.
 *
 * A child is 0.36 m across, so this leaves a clear 0.26 m between bodies — close enough to read
 * as children walking together, far enough that they never look like one model.
 */
export const FOLLOW_GAP = 0.62;

interface Member {
  id: string;
  index: number;
  state: WanderState;
}

const pack = new Map<string, Member>();

/**
 * Register a child. Returns the cleanup that takes it out again — React may mount, unmount and
 * remount in StrictMode, so the removal has to check it is still the same state.
 */
export function joinPack(id: string, index: number, state: WanderState): () => void {
  pack.set(id, { id, index, state });
  return () => {
    if (pack.get(id)?.state === state) pack.delete(id);
  };
}

/** Removed on unmount and re-added by the next mount: only the tests call this. */
export function clearPack() {
  pack.clear();
  clearGames();
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

/**
 * How a game runs: two children in the same place for a moment is a game, eight seconds of it,
 * and then a good while before the next one. The gap is jittered by a counter rather than a
 * random number so the same scene plays out the same way on every load, and so the test can
 * assert on it.
 */
const GAME_SECONDS = 8;
const GAME_EVERY = 19;
/** How many children have to be out playing together before it counts as a game. */
const GAME_QUORUM = 2;

interface Game {
  kind: WanderKind;
  clip: string;
  until: number;
}

let game: Game | null = null;
let nextGameAt = GAME_EVERY;
/** Which group's turn it is when both have a quorum: they take it in turns. */
let nextKind: WanderKind = 'yard';
let rounds = 0;

/** Forget the running game and everything scheduled: only the tests and unmount read this. */
export function clearGames() {
  game = null;
  nextGameAt = GAME_EVERY;
  nextKind = 'yard';
  rounds = 0;
}

/**
 * Empty road in front of `me`, metres, past the gap it means to keep.
 *
 * The loop wraps and the homes are unevenly spaced, so "ahead" is measured round the lap from
 * this child's own place on it, in the direction it is walking. The nearest one ahead is the
 * only one that constrains: everyone else is either far enough away to be irrelevant or
 * behind, and the wrap makes them read as a lap away.
 */
function clearAhead(me: Member, walkers: readonly Member[]): number {
  const { clock } = me.state;
  const mine = loopPosition(me.index, clock.d);
  let clear = Number.POSITIVE_INFINITY;
  for (const other of walkers) {
    if (other === me) continue;
    const theirs = loopPosition(other.index, other.state.clock.d);
    const ahead = clock.dir > 0 ? mod(theirs - mine, WALK_LOOP_LENGTH) : mod(mine - theirs, WALK_LOOP_LENGTH);
    clear = Math.min(clear, ahead - FOLLOW_GAP);
  }
  return clear;
}

let lastElapsed = Number.NaN;

/**
 * Advance the whole pack by this frame. Every mounted child calls it from its own `useFrame`;
 * only the first call of a frame does the work, the same trick `tickWalkClock` used, so the
 * order the renderer happens to visit them in does not matter.
 *
 * `held` is the child the visitor has taken hold of, if any. It is dropped from the pass
 * entirely rather than skipped in the loop: its lap has to freeze where it stood, and a frozen
 * child left in the street's follow-distance measurement would be a parked body the others
 * queue behind for as long as the visitor keeps driving it.
 */
export function advancePack(elapsed: number, walking: boolean, held: string | null = null) {
  if (elapsed === lastElapsed) return;
  // A backgrounded tab resumes with one huge delta; never step further than this at once.
  const dt = Number.isNaN(lastElapsed) ? 0 : Math.min(Math.max(elapsed - lastElapsed, 0), 0.1);
  lastElapsed = elapsed;

  const all = [...pack.values()].filter((member) => member.id !== held);
  if (all.length === 0) return;

  const street = all.filter((m) => m.state.kind === 'street');
  // Measured before anyone moves: a gap read after the first child has stepped is a gap to
  // where it used to be, which is the one thing a following walker must not aim at.
  const clear = new Map<Member, number>();
  for (const mine of street) clear.set(mine, clearAhead(mine, street));

  for (const member of all) {
    const clearOf = clear.get(member) ?? Number.POSITIVE_INFINITY;
    advanceWander(member.state, dt, walking, clearOf);
  }

  // Games run on the switch too: nobody plays on once the diorama is put away.
  if (!walking) {
    if (game) {
      game = null;
      for (const member of all) member.state.game = null;
    }
    nextGameAt = elapsed + GAME_EVERY;
    return;
  }
  tickGame(elapsed, all);
}

/**
 * Start, hold and end the group's game.
 *
 * The pause each child keeps for itself is a private thing — a child stopping to look at
 * something. What this adds is the other kind: two or three of them in the same place at the
 * same time, all stopping to do the same thing. Without it, three children in one garden are
 * three children walking round a house, which is what the old single clock already looked like.
 */
function tickGame(elapsed: number, all: readonly Member[]) {
  if (game) {
    if (elapsed < game.until) return;
    // The clock runs out at the same moment for everyone: they pick their errands back up.
    for (const member of all) member.state.game = null;
    game = null;
    nextGameAt = elapsed + GAME_EVERY + ((rounds * 7) % 11);
    return;
  }
  if (elapsed < nextGameAt) return;

  const quorum = (kind: WanderKind) =>
    all.filter((m) => m.state.kind === kind && isPlaying(m.state)).length >= GAME_QUORUM;
  const kinds: WanderKind[] = [nextKind, nextKind === 'yard' ? 'street' : 'yard'];
  const kind = kinds.find(quorum);
  // Nobody out playing: wait a little rather than starting a game at the first chance after a
  // walker happens to reach the lot.
  if (!kind) {
    nextGameAt = elapsed + 3;
    return;
  }
  const clip = GAME_CLIPS[rounds % GAME_CLIPS.length] ?? GAME_CLIPS[0] ?? 'clap';
  for (const member of all) {
    if (member.state.kind === kind && isPlaying(member.state)) member.state.game = clip;
  }
  game = { kind, clip, until: elapsed + GAME_SECONDS };
  rounds++;
  nextKind = kind === 'yard' ? 'street' : 'yard';
}
