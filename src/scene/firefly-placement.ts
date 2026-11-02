import { HOUSE_SHELL, HOUSE_STEPS } from '../data/house-site';
import { heroLot, layout, type Rect } from '../data/scene';

/** One firefly: where it loiters and how it moves and flashes. Read by the firefly shader. */
export interface Firefly {
  anchor: readonly [number, number, number];
  /** Horizontal reach of its wander, metres; the path spans up to ~1.45x this. */
  radius: number;
  /** Vertical bob amplitude, metres. */
  lift: number;
  /** Radians per second along its wander path. */
  speed: number;
  phase: number;
  /** Radians per second of the flash cycle; one flash per 2-5 s. */
  blinkRate: number;
  blinkPhase: number;
}

export const FIREFLY_COUNT = 80;
/** How far one wander can stray from its anchor, as a multiple of `radius`. */
export const WANDER_REACH = 1.45;
/** Closest an anchor may sit to the house, porch or boundary wall. */
export const MIN_CLEARANCE = 0.3;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rand(seed: number) {
  const x = Math.sin(seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// The garden inside the boundary wall.
const gardenRect: Rect = {
  x0: heroLot.x0 + layout.lot.wallThickness,
  x1: heroLot.x1 - layout.lot.wallThickness,
  z0: heroLot.z0 + layout.lot.wallThickness,
  z1: heroLot.z1 - layout.lot.wallThickness,
};

/** Distance from a point outside `rect` to its nearest edge; 0 inside. */
function distanceOutside(rect: Rect, x: number, z: number) {
  const dx = Math.max(rect.x0 - x, 0, x - rect.x1);
  const dz = Math.max(rect.z0 - z, 0, z - rect.z1);
  return Math.hypot(dx, dz);
}

/**
 * Room around a point on the ground: to the boundary wall, and to each room rect and step of
 * the new house (`src/data/house-site.ts`). Per rect, not one bounding box: the kitchen block
 * hangs out the back of the L-shaped shell, and the two notches it leaves beside the main
 * block are open garden the flies and the grass belong in.
 */
export function gardenClearance(x: number, z: number) {
  const toWall = Math.min(x - gardenRect.x0, gardenRect.x1 - x, z - gardenRect.z0, gardenRect.z1 - z);
  const toHouse = Math.min(...[...HOUSE_SHELL, ...HOUSE_STEPS].map((r) => distanceOutside(r, x, z)));
  return Math.min(toWall, toHouse);
}

/**
 * Scatters the fireflies over Nobita's garden: the front strip behind the wall, both side
 * yards and the back. Each one's wander is sized to the room around its anchor, so the swarm
 * in the narrow front strip stays tight while the side yards get wide lazy loops.
 */
export function placeFireflies(count = FIREFLY_COUNT): Firefly[] {
  const flies: Firefly[] = [];
  for (let seed = 1; flies.length < count && seed < count * 50; seed++) {
    const x = gardenRect.x0 + rand(seed) * (gardenRect.x1 - gardenRect.x0);
    const z = gardenRect.z0 + rand(seed + 1000) * (gardenRect.z1 - gardenRect.z0);
    const clearance = gardenClearance(x, z);
    if (clearance < MIN_CLEARANCE) continue;
    const i = flies.length;
    flies.push({
      // Up to canopy height: from the street the 1.6 m wall hides anything lower in front.
      anchor: [x, 0.6 + rand(i + 2000) * 2.4, z],
      radius: Math.min(0.85, Math.max(0.18, clearance / WANDER_REACH)),
      lift: 0.15 + rand(i + 3000) * 0.2,
      speed: 0.3 + rand(i + 4000) * 0.35,
      phase: rand(i + 5000) * Math.PI * 2,
      blinkRate: (Math.PI * 2) / (2 + rand(i + 6000) * 3),
      blinkPhase: rand(i + 7000) * Math.PI * 2,
    });
  }
  return flies;
}
