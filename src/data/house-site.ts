import {
  EXTERIOR,
  FOOTPRINT,
  type Rect as PlanRect,
  ROOMS,
  WALL_EXTERIOR,
  WALLS,
} from '../editor/house/plan';
import { layout, type Rect } from './scene';

/**
 * Where Nobita's house stands on his lot.
 *
 * The house is `src/editor/house/plan.ts`, the same data `/editor` builds, drawn in its own
 * frame: origin at the front-left corner of the main block on wall centre lines, street at +z,
 * x left to right as seen from the street — the lot's own axes, so placing it is a shift and
 * no turn. Everything on the lot that has to meet the house reads it from here.
 */

const frontDoor = WALLS.flatMap((wall) => wall.openings).find((o) => o.id === 'door-front');
if (!frontDoor) throw new Error('plan.ts has no door-front');

/** The ground storey's rooms out to their walls' outer faces, in the plan's frame. */
const shell: PlanRect[] = ROOMS.filter((room) => room.storey === 'ground').flatMap((room) =>
  room.rects.map((r) => ({
    x0: r.x0 - WALL_EXTERIOR / 2,
    x1: r.x1 + WALL_EXTERIOR / 2,
    z0: r.z0 - WALL_EXTERIOR / 2,
    z1: r.z1 + WALL_EXTERIOR / 2,
  })),
);

/** The inner face of the front boundary wall, which stands centred on `frontZ`. */
const GARDEN_FRONT = layout.wall.frontZ - layout.lot.wallThickness / 2;

/**
 * The world position of the plan's origin. Across the lot, the front door sits on the gate's
 * axis, so gate, path and door line up. Back to front, the front wall stands where the plan's
 * own path from the porch ends (`EXTERIOR.path`, 2 m): a short walk from the gate to the door,
 * with a shrub bed beside it, as in `assets/nobita_house_ground_floor.png` and
 * `assets/home.jpg`. The rest of the 18 m lot, 4.2 m behind the kitchen, is the back yard.
 */
export const HOUSE_ORIGIN = {
  x: layout.wall.gateX - (frontDoor.from + frontDoor.to) / 2,
  z: GARDEN_FRONT - EXTERIOR.path.rect.z1,
} as const;

/** A point of the plan in world metres; heights are the same in both. */
export const toWorld = (x: number, y: number, z: number): [number, number, number] => [
  x + HOUSE_ORIGIN.x,
  y,
  z + HOUSE_ORIGIN.z,
];

/** A rectangle of the plan in world metres. */
export const rectToWorld = (r: PlanRect): Rect => ({
  x0: r.x0 + HOUSE_ORIGIN.x,
  x1: r.x1 + HOUSE_ORIGIN.x,
  z0: r.z0 + HOUSE_ORIGIN.z,
  z1: r.z1 + HOUSE_ORIGIN.z,
});

/** The ground storey, room by room out to the outer wall faces: where the house meets the ground. */
export const HOUSE_SHELL: readonly Rect[] = shell.map(rectToWorld);

/**
 * What the house stands on the garden outside its walls: the porch, the wooden step under the
 * 居間's glass doors, the kitchen's and the 勝手口's steps. The editor's paving from the porch
 * is not here: the lot has its own path from the gate (`env_build.py` `build_path`).
 */
export const HOUSE_STEPS: readonly Rect[] = [
  EXTERIOR.porch.rect,
  EXTERIOR.engawa.rect,
  EXTERIOR.kitchenStep.rect,
  EXTERIOR.backStep.rect,
].map(rectToWorld);

/** Everything the house covers, eaves, porch and steps included: the planting keep-out. */
export const HOUSE_FOOTPRINT: Rect = rectToWorld(FOOTPRINT);

/** Whether (x, z) is under the house's walls or on one of its steps. */
export const onHouse = (x: number, z: number) =>
  [...HOUSE_SHELL, ...HOUSE_STEPS].some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
