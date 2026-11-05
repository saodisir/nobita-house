import { GAME_CLIPS } from './walk-clips';

/**
 * One afternoon's plan for the six children, drawn once when the stroll switch goes on.
 *
 * The routes themselves are not planned here. `walk-routes.ts` and `yard-route.ts` are closed
 * curves sampled by a single distance, and they stay exactly as they are: they already know
 * where the pavement ends, where the kerb drops, and how to put a child back on its own spot
 * when the switch goes off. What changes from one afternoon to the next is the itinerary on
 * top of them — when each child sets off, how long it walks before it stops, which lane it
 * takes, who it falls in with, and which game the group plays.
 *
 * Everything is drawn from a seeded PRNG rather than `Math.random()` so a seed can be written
 * down and the whole afternoon replayed. The tests fix a seed; the diorama takes a fresh one
 * each time the switch is turned on.
 */

export type Rng = () => number;

/** mulberry32: small, fast, and good enough for choosing pauses and partners. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for the live diorama. Tests pass their own instead. */
export function freshSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) ^ Date.now()) >>> 0;
}

const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();

function pick<T>(rng: Rng, list: readonly T[]): T {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new RangeError('cannot pick from an empty list');
  return item;
}

function shuffle<T>(rng: Rng, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) throw new RangeError('shuffle index out of range');
    out[i] = b;
    out[j] = a;
  }
  return out;
}

export type PlanKind = 'street' | 'yard';

export interface PlanMember {
  /** The character's index in `characters.ts`. */
  index: number;
  kind: PlanKind;
  indoor: boolean;
}

export interface ChildPlan {
  /** Seconds walking before a rest, and seconds standing before setting off again. */
  walkFor: number;
  restFor: number;
  /** Seconds this child waits at its spot before joining in at all. */
  departure: number;
  /** Multiplier on its own walking and running pace. */
  pace: number;
  /** Metres off the yard line. Street walkers ignore it: their lane is one dimensional. */
  lateral: number;
}

export interface Party {
  id: number;
  /** Whose distance round the yard the others follow. */
  leader: number;
  /** Character indices, in lane order. */
  members: number[];
  /** Lateral offset for each member, same order. */
  lanes: number[];
}

export interface GameRound {
  clip: string;
  kind: PlanKind;
  /** How many children have to be out together before it counts as a game. */
  quorum: number;
  seconds: number;
  /** Seconds after this game ends before the next one may start. */
  gap: number;
  /** Shuffled character indices: the order outsiders are picked in to fill the quorum. */
  order: number[];
}

export interface WanderPlan {
  seed: number;
  child: Map<number, ChildPlan>;
  parties: Party[];
  games: GameRound[];
}

/** The three lanes the yard loop already measures its offsets in. */
const LANES = [-0.55, 0, 0.55] as const;
/** Enough rounds for a long afternoon; the pack cycles through them. */
const GAME_ROUNDS = 24;

export function makePlan(seed: number, members: readonly PlanMember[]): WanderPlan {
  const rng = seeded(seed);
  const child = new Map<number, ChildPlan>();
  const allIndexes = members.map((m) => m.index);

  /**
   * One lane each, drawn without replacement. The garden children share the afternoon's one
   * walk, so two of them on the same strip of ground would be two bodies in one place even
   * at different distances round it. These are the three strips the nav graph cleared.
   */
  const laneOrder = shuffle(rng, [...LANES]);
  const laneOf = new Map<number, number>();
  for (const [i, m] of members.filter((m) => m.kind === 'yard').entries()) {
    laneOf.set(m.index, laneOrder[i % laneOrder.length] ?? 0);
  }

  for (const member of members) {
    child.set(member.index, {
      // A first walk long enough that a ten-second look at the scene always shows them moving,
      // and a rest short enough that the garden never goes completely still.
      walkFor: between(rng, 7, 15),
      restFor: between(rng, 2.5, 6.5),
      departure: between(rng, 0, 2.2),
      pace: between(rng, 0.9, 1.15),
      lateral: laneOf.get(member.index) ?? 0,
    });
  }

  const parties: Party[] = [];
  const yard = shuffle(
    rng,
    members.filter((m) => m.kind === 'yard'),
  );
  if (yard.length >= 2) {
    // Two or three of the garden children fall in together. The street is a one-lane pavement
    // with a following-distance rule measured in arc length, so shoulder-to-shoulder belongs
    // here, where the loop already has three lanes to put them in.
    const size = Math.min(yard.length, rng() < 0.45 ? 3 : 2);
    const chosen = yard.slice(0, size);
    const party: Party = {
      id: 1,
      leader: chosen[0]?.index ?? -1,
      members: chosen.map((m) => m.index),
      lanes: chosen.map((m) => laneOf.get(m.index) ?? 0),
    };
    parties.push(party);
  }

  const games: GameRound[] = [];
  for (let i = 0; i < GAME_ROUNDS; i++) {
    games.push({
      clip: pick(rng, GAME_CLIPS),
      kind: rng() < 0.5 ? 'yard' : 'street',
      quorum: rng() < 0.55 ? 2 : 3,
      // Eight seconds is long enough to read as a game and short enough not to still the scene.
      seconds: 8,
      gap: between(rng, 10, 22),
      order: shuffle(rng, allIndexes),
    });
  }

  return { seed, child, parties, games };
}
