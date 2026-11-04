import type { Rect } from './scene';

/**
 * The back-yard shed, in world metres.
 *
 * `environment.glb` draws it as one solid box (`shed_walls`) with two door panels painted on
 * its front face, so there is no doorway to walk through and no hinge to turn. There is no
 * Blender here to re-export the GLB, so the app hides that solid box at runtime and rebuilds
 * the shell from these numbers: four walls, a lintel and two hinged leaves. The lawn's
 * keep-out, the walker's colliders, the doorway's own box and the drawn geometry all read
 * this one place, so a change to the doorway moves the hole, the leaves and the collision
 * together.
 *
 * The numbers come from `scripts/blender/env_build.py: build_shed()` — walls 2.20 × 1.60 ×
 * 1.85 centred on (5.9, -11.0), standing on a 0.10 slab; two 0.88 m door panels with a
 * 0.12 m seam between them, 1.55 m high, laid on the +z face.
 */
export const SHED_DOOR_ID = 'door-shed';

export const SHED = {
  /** Outer faces of the GLB's wall box. */
  walls: { x0: 4.8, x1: 7.0, z0: -11.8, z1: -10.2 },
  /** Top of the concrete slab the walls stand on. */
  base: 0.1,
  height: 1.85,
  /** Thickness of each rebuilt wall; thin enough to leave a room worth stepping into. */
  thickness: 0.12,
  /** The two painted door panels, from their outer edges to the seam between them. */
  door: { x0: 4.96, x1: 6.84, height: 1.55 },
} as const;

/** Where the leaves hang, a little proud of the front wall like the GLB's panels. */
export const SHED_LEAF_Z = SHED.walls.z1 + 0.03;

/** Half the opening: one leaf's width, and the radius of its swept quarter-disc. */
const HALF_LEAF = (SHED.door.x1 - SHED.door.x0) / 2;

/** Four walls, split around the doorway on the face that faces the house. */
export function shedWallRects(): Rect[] {
  const w = SHED.walls;
  const t = SHED.thickness;
  const d = SHED.door;
  return [
    { x0: w.x0, x1: d.x0, z0: w.z1 - t, z1: w.z1 },
    { x0: d.x1, x1: w.x1, z0: w.z1 - t, z1: w.z1 },
    { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z0 + t },
    { x0: w.x0, x1: w.x0 + t, z0: w.z0, z1: w.z1 },
    { x0: w.x1 - t, x1: w.x1, z0: w.z0, z1: w.z1 },
  ];
}

/** The slice of front wall a shut leaf fills, in the same frame as `doorBoxes()`. */
export function shedDoorRect(): Rect {
  const w = SHED.walls;
  return { x0: SHED.door.x0, x1: SHED.door.x1, z0: w.z1 - SHED.thickness, z1: w.z1 };
}

/**
 * The ground each leaf sweeps: hinged at the outer jambs, turning out toward the house (+z).
 * Structurally the same as `door-sweep.ts`'s `SwingSweep`, so `inSwing()` takes them as they
 * are without the data layer having to import the scene layer.
 */
export const SHED_SWINGS = [
  {
    id: SHED_DOOR_ID,
    storey: 'ground',
    hx: SHED.door.x0,
    hz: SHED_LEAF_Z,
    ux: 1,
    uz: 0,
    vx: 0,
    vz: 1,
    length: HALF_LEAF,
  },
  {
    id: SHED_DOOR_ID,
    storey: 'ground',
    hx: SHED.door.x1,
    hz: SHED_LEAF_Z,
    ux: -1,
    uz: 0,
    vx: 0,
    vz: 1,
    length: HALF_LEAF,
  },
] as const;
