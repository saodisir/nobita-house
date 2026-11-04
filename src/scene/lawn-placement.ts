import {
  bareEdge,
  DOOR_STEP_DEPTH,
  houseLocalToWorld,
  houseTransform,
  houseVariants,
  inSandlotBare,
  layout,
  type NeighbourLot,
  neighbourDoorU,
  neighbourEntry,
  type Rect,
  type SandlotEdge,
  sandlotEdge,
  sandlotProps,
} from '../data/scene';
import { gardenClearance } from './firefly-placement';

/**
 * Where every grass blade in the block grows, and its shape. Read by `LawnGrass`, which
 * draws each lot's lawn as one instanced mesh.
 */

/** Grid pitch of the jittered placement on Nobita's lot, metres: ~400 blades per m². */
export const BLADE_SPACING = 0.05;
/**
 * Pitch on the neighbour lots: ~156 blades per m², each widened to keep the same cover. They
 * are seen from further off, there are seven of them, and each is as big as Nobita's.
 */
export const NEIGHBOUR_SPACING = 0.08;
/** Blades keep this far off anything they would otherwise poke through. */
export const KEEP_OUT_MARGIN = 0.04;
export const MIN_HEIGHT = 0.06;
export const MAX_HEIGHT = 0.14;

/** A box around a point, half-extents in metres. */
function around(x: number, z: number, halfX: number, halfZ = halfX): Rect {
  return { x0: x - halfX, x1: x + halfX, z0: z - halfZ, z1: z + halfZ };
}

/** `STEPPING_STONES` in env_build.py: world x, z and radius of each stone, path to engawa. */
const STEPPING_STONES = [
  [-0.05, 4.16, 0.24],
  [-0.72, 4.06, 0.22],
  [-1.4, 4.12, 0.25],
  [-2.08, 4.02, 0.22],
  [-2.76, 4.08, 0.24],
  [-3.44, 3.98, 0.22],
  [-4.1, 3.82, 0.25],
  [-4.66, 3.42, 0.22],
  [-5.02, 2.84, 0.24],
  [-5.2, 2.18, 0.22],
  [-5.18, 1.5, 0.25],
  [-5.1, 0.82, 0.22],
  [-5.02, 0.14, 0.24],
  [-4.96, -0.54, 0.22],
  [-4.92, -1.22, 0.24],
  [-4.92, -1.86, 0.2],
] as const;

/**
 * Everything standing on the lawn, in world x/z. Mirrors the props in
 * `scripts/blender/env_build.py`, whose Blender Y is world z here (it flips Y on export).
 * The house, porch and boundary wall come from `gardenClearance` instead.
 */
export const LAWN_KEEP_OUTS: readonly Rect[] = [
  // Gravel drainage bands hugging the house base (env_build.py gravel_*). Full runs: the gaps
  // where the engawa and kitchen step cross them are house ground already, so grass is out of
  // them via `gardenClearance`.
  { x0: -4.005, x1: -3.655, z0: -4.665, z1: 2.765 },
  { x0: 3.775, x1: 4.125, z0: -4.665, z1: -0.193 },
  { x0: -3.095, x1: -2.745, z0: -7.85, z1: -4.665 },
  { x0: 2.865, x1: 3.215, z0: -7.85, z1: -4.665 },
  { x0: -3.095, x1: 3.215, z0: -8.2, z1: -7.85 },
  // The entrance path from the gate to the porch, and the two kerbed shrub beds.
  { x0: 0.42, x1: 1.62, z0: 3.69, z1: 5.785 },
  { x0: -3.55, x1: 0.3, z0: 2.765, z1: 3.6 },
  { x0: 2.0, x1: 3.75, z0: -0.193, z1: 0.6 },
  { ...layout.shed }, // shed slab
  // Machinery on the outer walls (env_build.py ac_unit/ac_grille, heater/heater_flue).
  around(-3.855, -1.01, 0.2, 0.425),
  around(3.975, -1.31, 0.22, 0.29),
  { x0: -6.3, x1: -3.75, z0: 4.24, z1: 4.64 }, // flower bed
  around(-6.95, 1.3, 0.06), // garden tap post
  around(-6.95, 1.65, 0.275, 0.225), // tap basin
  around(-6.4, 1.55, 0.14), // bucket
  around(-6.7, -3.3, 0.24), // stone lantern
  // Stepping stones from the path to the engawa (env_build.py STEPPING_STONES), and the shoe
  // stone before the engawa.
  ...STEPPING_STONES.map(([x, z, r]) => around(x, z, r)),
  around(-4.78, -2.71, 0.25, 0.4),
  // Washing-line posts and the bonsai bench legs.
  around(-5.8, -4.9, 0.05),
  around(-5.8, -8.5, 0.05),
  around(4.3, 3.95, 0.04, 0.21),
  around(4.85, 3.95, 0.04, 0.21),
  around(5.4, 3.95, 0.04, 0.21),
];

function inRect(r: Rect, x: number, z: number, margin: number) {
  return x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin;
}

/**
 * Bare earth worn through Nobita's lawn, drawn as ground people actually wear: a trodden path
 * from the kitchen's back door (勝手口) to the shed, another from the kitchen's garden door
 * out to the washing line and along it, a scuffed patch round the tap and a ring under the
 * east tree where nothing grows in its shade. The walk from the gate to the garden is stepping stones, so it wears nothing.
 * Everything is a soft signed distance, so the same field thins the blades here and paints
 * the dirt in `YardEarth`; there is no second copy of these shapes to drift out of step.
 */
export const YARD_EARTH = {
  paths: [
    {
      points: [
        [3.7, -7.2],
        [4.35, -8.0],
        [5.0, -9.0],
        [5.75, -9.85],
      ] as const,
      width: 0.72,
    },
    {
      points: [
        [-3.55, -5.9],
        [-4.35, -6.25],
        [-5.15, -6.55],
        [-5.35, -7.6],
        [-5.35, -8.3],
      ] as const,
      width: 0.6,
    },
  ],
  blobs: [
    { centre: [-6.75, 1.7] as const, rx: 0.78, rz: 0.66, angle: 0.3 }, // round the tap
    { centre: [6.45, -6.1] as const, rx: 0.85, rz: 0.7, angle: -0.4 }, // under the east tree
  ],
} as const;

/** Signed depth into the worn ground, metres: > 0 inside, < 0 outside, 0 on the soft edge. */
export function earthDepth(x: number, z: number) {
  let d = -Infinity;
  for (const { points, width } of YARD_EARTH.paths) {
    let arc = 0;
    for (let k = 0; k + 1 < points.length; k++) {
      const [ax, az] = points[k] as readonly [number, number];
      const [bx, bz] = points[k + 1] as readonly [number, number];
      const sx = bx - ax;
      const sz = bz - az;
      const len = Math.hypot(sx, sz);
      const t = Math.min(Math.max(((x - ax) * sx + (z - az) * sz) / (len * len), 0), 1);
      const s = arc + t * len;
      // A walked path swells where people stop and pinches where they step round something.
      const half = (width / 2) * (1 + 0.22 * Math.sin(s * 2.3 + 1.0) + 0.12 * Math.sin(s * 5.1 - 0.4));
      d = Math.max(d, half - Math.hypot(x - ax - sx * t, z - az - sz * t));
      arc += len;
    }
  }
  for (const { centre, rx, rz, angle } of YARD_EARTH.blobs) {
    const dx = x - centre[0];
    const dz = z - centre[1];
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const u = (dx * c + dz * s) / rx;
    const v = (-dx * s + dz * c) / rz;
    d = Math.max(d, (bareEdge(Math.atan2(v, u)) - Math.hypot(u, v)) * Math.min(rx, rz));
  }
  // A low ripple so no edge runs as a clean curve for more than half a metre.
  return d + 0.05 * Math.sin(x * 3.1 + z * 1.7) + 0.04 * Math.sin(-x * 2.3 + z * 4.1 + 1.2);
}

/** How worn the ground is, 0 (lawn) to 1 (bare earth), across a band about 30 cm wide. */
export function earthCover(x: number, z: number) {
  const t = Math.min(Math.max((earthDepth(x, z) + 0.1) / 0.3, 0), 1);
  return t * t * (3 - 2 * t);
}

/** A stray tuft survives this often in the middle of the dirt. */
const EARTH_TUFTS = 0.012;

/** False where the worn earth has thinned the grass out: a dithered fade, not a hard line. */
function earthClear(x: number, z: number) {
  const cover = earthCover(x, z);
  if (cover <= 0) return true;
  const r = rand(Math.round(x * 140), Math.round(z * 150), 8);
  return r >= cover || r < EARTH_TUFTS;
}

/** Height multiplier so blades shorten into the dirt, from a hand's width out. */
export function earthEdgeScale(x: number, z: number) {
  const t = Math.min(Math.max((earthDepth(x, z) + 0.35) / 0.45, 0), 1);
  return 1 - 0.6 * t;
}

/** True where a blade may grow on Nobita's lot: in the garden, clear of house and props. */
export function isHeroLawn(x: number, z: number) {
  if (gardenClearance(x, z) < KEEP_OUT_MARGIN) return false;
  if (LAWN_KEEP_OUTS.some((r) => inRect(r, x, z, KEEP_OUT_MARGIN))) return false;
  return earthClear(x, z);
}

/** Neighbour lot walls stand on the lot edge; this is the half of them inside the lot. */
const NEIGHBOUR_WALL_HALF = 0.1;
/** Around each neighbour house: the plinth (7 cm proud) and the downpipes (11 cm). */
const NEIGHBOUR_HOUSE_APRON = 0.12;

/**
 * Where a blade may grow on a neighbour lot: inside its wall, clear of the house, the walk
 * from the gate, the step at its door, the AC unit and the gas cylinders. All follow
 * `neighbours_build.py`: the step sits at the door, 1.9 m wide and 0.7 m out, the walk runs
 * from it to the gate (`neighbourEntry`), the AC unit stands 0.9 m in from the other end
 * of the back wall, 0.85 m by 0.36 m, and the propane pad against that side wall.
 */
export function neighbourLawn(n: NeighbourLot) {
  const { bounds, yaw } = houseTransform(n);
  const v = houseVariants[n.variant];
  const inside: Rect = {
    x0: n.lot.x0 + NEIGHBOUR_WALL_HALF,
    x1: n.lot.x1 - NEIGHBOUR_WALL_HALF,
    z0: n.lot.z0 + NEIGHBOUR_WALL_HALF,
    z1: n.lot.z1 - NEIGHBOUR_WALL_HALF,
  };
  const house = around(
    (bounds.x0 + bounds.x1) / 2,
    (bounds.z0 + bounds.z1) / 2,
    (bounds.x1 - bounds.x0) / 2 + NEIGHBOUR_HOUSE_APRON,
    (bounds.z1 - bounds.z0) / 2 + NEIGHBOUR_HOUSE_APRON,
  );
  const toWorld = houseLocalToWorld(n);
  const quarterTurn = Math.abs(Math.sin(yaw)) > 0.5;
  const local = (lx: number, lz: number, halfAlong: number, halfOut: number) => {
    const [x, z] = toWorld(lx, lz);
    return around(x, z, quarterTurn ? halfOut : halfAlong, quarterTurn ? halfAlong : halfOut);
  };
  const door = neighbourDoorU(n);
  const step = local(door, v.depth / 2 + DOOR_STEP_DEPTH / 2, 0.95, DOOR_STEP_DEPTH / 2);
  const { path } = neighbourEntry(n);
  const back = -Math.sign(door);
  const ac = local(back * (v.width / 2 - 0.9), -v.depth / 2 - 0.22, 0.425, 0.18);
  // The propane pad against the side wall away from the door, 0.5 m by 0.94 m.
  const gas = local(back * (v.width / 2 + 0.25), -v.depth / 2 + 0.81, 0.25, 0.47);
  return (x: number, z: number) =>
    inRect(inside, x, z, -KEEP_OUT_MARGIN) &&
    !inRect(house, x, z, KEEP_OUT_MARGIN) &&
    !inRect(step, x, z, KEEP_OUT_MARGIN) &&
    !inRect(path, x, z, KEEP_OUT_MARGIN) &&
    !inRect(ac, x, z, KEEP_OUT_MARGIN) &&
    !inRect(gas, x, z, KEEP_OUT_MARGIN);
}

/**
 * Where a blade may grow on the sandlot: inside its walls and fence (the open edge runs to
 * the sidewalk), off the worn patches and out from under the pipes, rings and bamboo. Grass
 * runs right under the two trees and the bushes, as it does on every lot.
 */
export function sandlotLawn() {
  const { lot } = layout.sandlot;
  const inset = (edge: SandlotEdge) => {
    const kind = sandlotEdge(edge);
    return kind === 'wall' ? NEIGHBOUR_WALL_HALF : kind === 'fence' ? 0.03 : 0;
  };
  const inside: Rect = {
    x0: lot.x0 + inset('-x'),
    x1: lot.x1 - inset('+x'),
    z0: lot.z0 + inset('-z'),
    z1: lot.z1 - inset('+z'),
  };
  const props = Object.values(sandlotProps());
  return (x: number, z: number) =>
    inRect(inside, x, z, -KEEP_OUT_MARGIN) &&
    !inSandlotBare(x, z) &&
    !props.some((p) => inRect(p, x, z, KEEP_OUT_MARGIN));
}

/** Deterministic pseudo-random in [0,1) from two integers and a channel. */
function rand(i: number, j: number, channel: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + channel * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Smooth field in [0,1] over the lawn, a few metres per swell. Drives height and tint
 * together, so the lawn rolls in soft drifts instead of flickering blade to blade.
 */
export function lawnSwell(x: number, z: number) {
  const s =
    0.5 * Math.sin(x * 0.9 + z * 0.4) +
    0.3 * Math.sin(x * 0.37 - z * 1.1 + 1.3) +
    0.2 * Math.sin(-x * 1.7 + z * 0.8 + 4.1);
  return 0.5 + 0.5 * s;
}

export interface LawnBlades {
  count: number;
  /** Per blade: x, z, yaw, wind phase. */
  base: Float32Array;
  /** Per blade: height, width, lean (tip offset as a fraction of height), tint. */
  shape: Float32Array;
}

/**
 * Jittered grid over `area`, keeping the cells where `grows` allows a blade: even coverage
 * with no clumps or bald spots, and the same lawn on every load. The grid is indexed from the
 * world origin, so two lots never repeat each other's pattern.
 */
export function placeLawnBlades(
  area: Rect,
  grows: (x: number, z: number) => boolean,
  spacing = BLADE_SPACING,
  heightScale?: (x: number, z: number) => number,
): LawnBlades {
  const i0 = Math.floor(area.x0 / spacing);
  const j0 = Math.floor(area.z0 / spacing);
  const cols = Math.ceil(area.x1 / spacing) - i0;
  const rows = Math.ceil(area.z1 / spacing) - j0;
  const base = new Float32Array(cols * rows * 4);
  const shape = new Float32Array(cols * rows * 4);
  // Fewer blades, each wider, so a sparser lot still reads as full cover.
  const widen = spacing / BLADE_SPACING;
  let count = 0;
  for (let i = i0; i < i0 + cols; i++) {
    for (let j = j0; j < j0 + rows; j++) {
      const x = (i + rand(i, j, 0)) * spacing;
      const z = (j + rand(i, j, 1)) * spacing;
      if (!inRect(area, x, z, 0) || !grows(x, z)) continue;
      const swell = lawnSwell(x, z);
      const k = count * 4;
      base[k] = x;
      base[k + 1] = z;
      base[k + 2] = rand(i, j, 2) * Math.PI * 2;
      base[k + 3] = rand(i, j, 3) * Math.PI * 2;
      const height = MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * (0.65 * swell + 0.35 * rand(i, j, 4));
      shape[k] = heightScale ? Math.max(MIN_HEIGHT, height * heightScale(x, z)) : height;
      shape[k + 1] = (0.028 + 0.018 * rand(i, j, 5)) * widen;
      shape[k + 2] = 0.1 + 0.2 * rand(i, j, 6);
      // Tint moves only a few percent: blade-to-blade contrast reads as dark speckle, not grass.
      shape[k + 3] = 0.93 + 0.07 * swell + 0.04 * (rand(i, j, 7) - 0.5);
      count++;
    }
  }
  return { count, base: base.subarray(0, count * 4), shape: shape.subarray(0, count * 4) };
}
