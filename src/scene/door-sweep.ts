import { HOUSE_ORIGIN } from '../data/house-site';
import { STOREYS, type StoreyId, sideToward, WALLS } from '../editor/house/plan';

/**
 * The ground a hinged leaf sweeps between shut and open.
 *
 * `blocked()` treats a doorway as a thin rectangle in the wall. That is where a shut leaf
 * stands, but not where it travels: a hinged leaf turns a full quarter turn about its hinge,
 * so a body standing in the room (or on the porch) that the leaf swings into is in its way too.
 * Sliding leaves, pairs and walkout sashes never leave the wall's thickness — the doorway
 * rectangle already covers their whole travel — so only hinged leaves need a sweep.
 *
 * The numbers come from the same `plan.ts` that `build-shell.ts` uses to place the pivot and
 * choose the swing direction, so a door that moves in the plan moves its swept ground here.
 * `buildDoors()` turns the leaf about Y by ±90° toward `sideToward(wall, …, swing)`, which is
 * exactly the wall normal `v` below; the sign of that turn never has to be reproduced.
 */
export interface SwingSweep {
  id: string;
  storey: StoreyId;
  /** The hinge line, in world metres. */
  hx: number;
  hz: number;
  /** Unit vector along the shut leaf, from the hinge toward the latch. */
  ux: number;
  uz: number;
  /** Unit vector the leaf reaches when fully open: the wall normal on its swing side. */
  vx: number;
  vz: number;
  /** Leaf width in metres, and the radius of the swept quarter-disc. */
  length: number;
}

export const SWING_SWEEPS: readonly SwingSweep[] = WALLS.flatMap((wall) =>
  wall.openings.flatMap((o) => {
    if (o.kind !== 'door' || o.leaf !== 'hinged') return [];
    // Only a floor-level leaf is a door the walker can pass; an upper-storey one gets its own.
    if (o.sill > STOREYS[wall.storey].floor + 0.4) return [];
    const side = sideToward(wall, (o.from + o.to) / 2, o.swing);
    if (side === undefined) return [];
    const hingeAlong = o.latch === 'to' ? o.from : o.to;
    const toLatch = o.latch === 'to' ? 1 : -1;
    const world = (along: number, across: number) =>
      wall.axis === 'x'
        ? { x: along + HOUSE_ORIGIN.x, z: wall.at + across + HOUSE_ORIGIN.z }
        : { x: wall.at + across + HOUSE_ORIGIN.x, z: along + HOUSE_ORIGIN.z };
    // `buildDoors()` puts the pivot a hair onto the swing side so the leaf turns out of its
    // frame rather than through it.
    const hinge = world(hingeAlong, side * 0.02);
    const [ux, uz] = wall.axis === 'x' ? [toLatch, 0] : [0, toLatch];
    const [vx, vz] = wall.axis === 'x' ? [0, side] : [side, 0];
    return [
      {
        id: o.id,
        storey: wall.storey,
        hx: hinge.x,
        hz: hinge.z,
        ux,
        uz,
        vx,
        vz,
        length: o.to - o.from,
      },
    ];
  }),
);

/**
 * Whether a body of `radius` centred at (x, z) stands anywhere on the leaf's path.
 *
 * `u` and `v` are orthogonal, so projecting the offset from the hinge onto them gives the
 * coordinates of a quarter-disc of radius `length`: shut at `b = 0`, open at `a = 0`. Both
 * edges are padded by the body's radius, and the arc by the same, which is a slightly
 * generous answer — a body brushing the very corner of the swing counts as being in the way.
 */
export function inSwing(s: SwingSweep, x: number, z: number, radius: number): boolean {
  const dx = x - s.hx;
  const dz = z - s.hz;
  const a = dx * s.ux + dz * s.uz;
  const b = dx * s.vx + dz * s.vz;
  const reach = s.length + radius;
  return a >= -radius && b >= -radius && a * a + b * b <= reach * reach;
}
