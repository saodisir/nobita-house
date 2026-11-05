import { housePath } from '../data/house-path';
import { nearestOnRoute, randomLoop } from '../data/nav-graph';
import { loopPosition, WALK_LOOP_LENGTH, type WalkSample } from '../data/walk-routes';
import { advanceWander, isPlaying, sampleWander, type WanderState } from './wander';
import { freshSeed, makePlan, type PlanKind, seeded, type WanderPlan } from './wander-plan';

/**
 * The six children, advanced together.
 *
 * Each child owns its `WanderState` and used to advance it from its own `useFrame`, which was
 * fine while nothing depended on a neighbour. The street is different: it is *one* lane, and
 * every street walker is a point on that same line, so a child that pauses is a wall across it.
 * Following distance is a question about all six at once, so the advance moved here — one pass
 * per frame over the whole pack, in index order, with the gaps measured before anyone moves.
 *
 * The same pass owns the afternoon's plan. Turning the stroll switch on draws a fresh one from
 * a seeded PRNG: each child's departures, pauses, pace and lane, which two or three of them
 * fall in together, and which game the group plays. The routes underneath are untouched, so a
 * replan cannot put a foot through a wall or move a child off the spot it will return to.
 */

/**
 * Centre-to-centre distance two children keep walking the same way round the street, metres.
 *
 * A child is 0.36 m across, so this leaves a clear 0.26 m between bodies — close enough to read
 * as children walking together, far enough that they never look like one model.
 */
export const FOLLOW_GAP = 0.62;

/**
 * How close two garden children may come before one gives way, measured in the world because
 * their walks are different loops and a distance round one lap no longer describes them both.
 * A body is 0.36 m across; 1.6 m looks generous, but a child eases to a stop rather than
 * braking on a dime, and the sweep across five afternoons found this the point where contact
 * stops happening without the garden standing still.
 */
export const YIELD_GAP = 1.6;
/** Share of its pace a child keeps while giving way: zero, so it waits until the coast is clear. */
export const YIELD_PACE = 0;

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

/** The plan currently in play, or null before the switch has ever been turned on. */
let plan: WanderPlan | null = null;
/** A seed a test asks the next replan to use. Production leaves this null. */
let nextSeed: number | null = null;
/** The switch's state on the previous pass, so a replan happens exactly on the off-to-on edge. */
let lastWalking = false;
/** Frame time of the last whole-pack pass; one pass per frame, whatever the render order. */
let lastElapsed = Number.NaN;

interface Game {
  clip: string;
  until: number;
}

let game: Game | null = null;
let nextGameAt = 0;
let round = 0;

/** Fix the seed for the next replan, or pass null to go back to a fresh one. Tests only. */
export function setNextPlanSeed(seed: number | null): void {
  nextSeed = seed;
}

/** The seed behind the current afternoon, for a dev probe or a bug report. */
export function planSeed(): number | null {
  return plan?.seed ?? null;
}

/**
 * Forget the running game and the round counter. `clearGames` is kept as a name because the
 * pack's own unmount path and the tests use it to put the scene back at the beginning.
 */
export function clearGames(): void {
  game = null;
  nextGameAt = 0;
  round = 0;
}

/** Removed on unmount and re-added by the next mount: only the tests call this. */
export function clearPack(): void {
  for (const member of pack.values()) {
    member.state.party = null;
    member.state.partyLeader = false;
    member.state.route = null;
  }
  pack.clear();
  plan = null;
  nextSeed = null;
  lastWalking = false;
  lastElapsed = Number.NaN;
  clearGames();
}

/**
 * Draw a whole new afternoon and write it onto the states the children already own.
 *
 * Rebuilding `WanderState` is deliberately avoided: `useWalker` keeps one in a ref for the life
 * of the component, and swapping it would re-seed the group's position and drop the door and
 * game state mid-frame. Mutating the itinerary fields instead leaves every child standing
 * exactly where it was when the switch went on.
 */
export function replan(seed: number, elapsed = 0): WanderPlan {
  const members = [...pack.values()];
  plan = makePlan(
    seed,
    members.map((m) => ({ index: m.index, kind: m.state.kind, indoor: m.state.indoor })),
  );
  for (const member of members) {
    const child = plan.child.get(member.index);
    const state = member.state;
    state.party = null;
    state.partyLeader = false;
    state.game = null;
    state.route = null;
    if (child) {
      state.walkFor = child.walkFor;
      state.restFor = child.restFor;
      state.pace = child.pace;
      state.lateral = child.lateral;
      // Stagger departures rather than starting places. At the moment the switch goes on
      // everyone is on the spot `characters.ts` composed, and shifting a starting distance
      // would be a visible jump; waiting a moment before setting off is not.
      state.paused = child.departure > 0;
      state.timer = child.departure > 0 ? child.departure : child.walkFor;
    }
    for (const party of plan.parties) {
      const at = party.members.indexOf(member.index);
      if (at < 0) continue;
      state.party = party.id;
      state.partyLeader = member.index === party.leader;
      const lane = party.lanes[at];
      if (lane !== undefined) state.lateral = lane;
    }
  }
  clearGames();

  // A walk of its own for each garden child, drawn from the same seed as the itinerary. A
  // party shares one route object: three lanes off one distance only reads as shoulder to
  // shoulder when that distance means the same place for all of them. Street walkers keep
  // their measured lap and its exact home landing, which a new route would put at risk.
  const routeRng = seeded((seed ^ 0x9e3779b9) >>> 0);
  const door = housePath[0] ?? { x: 0, z: 0 };
  for (const party of plan.parties) {
    const route = randomLoop(routeRng);
    for (const index of party.members) {
      const member = members.find((m) => m.index === index);
      if (!member) continue;
      member.state.route = route;
      member.state.u = 0;
      member.state.doorU = nearestOnRoute(route, door.x, door.z);
    }
  }
  for (const member of members) {
    if (member.state.kind !== 'yard' || member.state.route) continue;
    const route = randomLoop(routeRng);
    member.state.route = route;
    // A party starts together at the gate on purpose. A child on its own is given a little
    // head start down its own walk instead, so the moment they all step out of the gate does
    // not put two of them on the same spot with different routes to blame.
    member.state.u = route.length * (0.08 + routeRng() * 0.1);
    member.state.doorU = nearestOnRoute(route, door.x, door.z);
  }

  // A short lead-in: the garden children have to walk out through the gate before they can
  // be out playing, and a game started on the first frame would have nobody in it.
  nextGameAt = elapsed + 4;
  return plan;
}

const mod = (a: number, m: number) => ((a % m) + m) % m;

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

/** One sample reused by the pairwise check, so a frame allocates nothing. */
const yieldSample: WalkSample = { x: 0, y: 0, z: 0, heading: 0 };

/**
 * Who gives way this frame, measured before anybody moves — the same reason the street's gaps
 * are read first. Two children on different walks can meet anywhere in the garden, so the
 * only distance that matters is the one between the places they are standing right now.
 *
 * The later child in the roster yields, which is a stable rule and never leaves both of them
 * waiting for the other. A party is one body for this purpose: its leader carries the decision
 * and `syncParties` copies the resulting speed to everyone in it. Two children in the same
 * party are already shoulder to shoulder on purpose, so they are left alone.
 */
function yardYield(all: readonly Member[]): Map<Member, number> {
  const factors = new Map<Member, number>();
  const spots = all
    .filter((m) => m.state.kind === 'yard' && isPlaying(m.state))
    .map((m) => {
      sampleWander(m.state, m.index, yieldSample);
      return { member: m, x: yieldSample.x, z: yieldSample.z };
    });
  const leaders = new Map<number, Member>();
  for (const member of all) {
    const party = member.state.party;
    if (party !== null && member.state.partyLeader && !leaders.has(party)) {
      leaders.set(party, member);
    }
  }
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i];
      const b = spots[j];
      if (!a || !b) continue;
      const party = a.member.state.party;
      if (party !== null && party === b.member.state.party) continue;
      if (Math.hypot(a.x - b.x, a.z - b.z) >= YIELD_GAP) continue;
      const later = a.member.index > b.member.index ? a.member : b.member;
      const yielder = later.state.party === null ? later : (leaders.get(later.state.party) ?? later);
      factors.set(yielder, YIELD_PACE);
    }
  }
  return factors;
}

/**
 * Put each party back in formation after everybody has taken their own step.
 *
 * The leader is the only one whose yard distance really advances; the followers copy it and
 * keep the lane the plan gave them. Because `sampleYard(u, lateral)` offsets perpendicular to
 * the lap, the same `u` and different lanes is two or three children side by side. The gate
 * walk, the pauses and the game are copied too, so the group leaves, stops and plays as one.
 */
function syncParties(all: readonly Member[]): void {
  if (!plan || plan.parties.length === 0) return;
  const leaders = new Map<number, Member>();
  for (const member of all) {
    if (member.state.party !== null && member.state.partyLeader && !leaders.has(member.state.party)) {
      leaders.set(member.state.party, member);
    }
  }
  for (const member of all) {
    const id = member.state.party;
    if (id === null || member.state.partyLeader) continue;
    const leader = leaders.get(id)?.state;
    const state = member.state;
    if (!leader || state.kind !== 'yard' || leader.kind !== 'yard') continue;
    state.u = leader.u;
    state.exit = leader.exit;
    state.speed = leader.speed;
    state.paused = leader.paused;
    state.timer = leader.timer;
    state.game = leader.game;
  }
}

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

  if (walking && !lastWalking) {
    const seed = nextSeed ?? freshSeed();
    nextSeed = null;
    replan(seed, elapsed);
  } else if (!walking && lastWalking) {
    // Called in: the party breaks up, this afternoon's walks are put away, and everyone goes
    // back to being on their own on the measured laps.
    for (const member of pack.values()) {
      member.state.party = null;
      member.state.partyLeader = false;
      member.state.route = null;
    }
    plan = null;
  }
  lastWalking = walking;

  const all = [...pack.values()].filter((member) => member.id !== held);
  if (all.length === 0) return;

  const street = all.filter((m) => m.state.kind === 'street');
  // Measured before anyone moves: a gap read after the first child has stepped is a gap to
  // where it used to be, which is the one thing a following walker must not aim at.
  const clear = new Map<Member, number>();
  for (const mine of street) clear.set(mine, clearAhead(mine, street));
  const yielding = yardYield(all);

  for (const member of all) {
    const clearOf = clear.get(member) ?? Number.POSITIVE_INFINITY;
    advanceWander(member.state, dt, walking, clearOf, yielding.get(member) ?? 1);
  }
  syncParties(all);

  // Games run on the switch too: nobody plays on once the diorama is put away.
  if (!walking) {
    for (const member of all) member.state.game = null;
    game = null;
    nextGameAt = elapsed + 4;
    return;
  }
  tickGame(elapsed, all);
}

/** The other loop, tried when the round's own kind has nobody out playing together. */
const other = (kind: PlanKind): PlanKind => (kind === 'yard' ? 'street' : 'yard');

/**
 * Start, hold and end the group's game.
 *
 * A pause each child keeps for itself is a private thing — a child stopping to look at
 * something. What this adds is the other kind: two or three of them in the same place at the
 * same time, all stopping to do the same thing. A party is taken whole or left out whole, so
 * children walking side by side are never split by a game; outsiders then fill the round's
 * quorum in the shuffled order the plan drew.
 */
function tickGame(elapsed: number, all: readonly Member[]) {
  const current = plan;
  if (!current || current.games.length === 0) return;
  const spec = current.games[round % current.games.length];
  if (!spec) return;

  if (game) {
    if (elapsed < game.until) return;
    for (const member of all) member.state.game = null;
    game = null;
    nextGameAt = elapsed + spec.gap;
    round++;
    return;
  }
  if (elapsed < nextGameAt) return;

  for (const kind of [spec.kind, other(spec.kind)]) {
    const eligible = all.filter((m) => m.state.kind === kind && isPlaying(m.state));
    if (eligible.length < 2) continue;

    const chosen: Member[] = [];
    const seen = new Set<string>();
    const parties = new Map<number, Member[]>();
    for (const member of eligible) {
      const id = member.state.party;
      if (id === null) continue;
      const group = parties.get(id) ?? [];
      group.push(member);
      parties.set(id, group);
    }
    const groups = [...parties.values()].filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);
    for (const group of groups) {
      for (const member of group) {
        if (seen.has(member.id)) continue;
        chosen.push(member);
        seen.add(member.id);
      }
    }
    const want = Math.max(spec.quorum, groups[0]?.length ?? 0);
    for (const index of spec.order) {
      if (chosen.length >= want) break;
      const member = eligible.find((m) => m.index === index);
      if (member && !seen.has(member.id)) {
        chosen.push(member);
        seen.add(member.id);
      }
    }
    if (chosen.length < 2) continue;

    for (const member of chosen) member.state.game = spec.clip;
    game = { clip: spec.clip, until: elapsed + spec.seconds };
    return;
  }
  // Nobody out playing: wait a little rather than starting a game at the first chance after a
  // walker happens to reach the lot.
  nextGameAt = elapsed + 2;
}
