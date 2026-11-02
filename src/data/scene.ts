/**
 * Static scene layout in metres. Origin on the centre line of Nobita's lot, 5.8 m behind its
 * front wall, at ground level. +Y up, street at +Z. The house on the lot is `house-site.ts`.
 */
export const layout = {
  /**
   * 18 m deep for the 11.9 m house: a 2 m walk from the gate to the porch, and a 4.2 m back
   * yard behind the kitchen (`house-site.ts` places the house between them).
   */
  lot: { width: 15, depth: 18, wallHeight: 1.6, wallThickness: 0.22 },
  /** Front wall runs along this z; the gate opening is centred at x = gateX. */
  /** gateX is the hallway's axis, where the front door stands, so gate, path and door line up. */
  /**
   * `copingTop` is the top of the coping course on the front wall (`WALL_H` 1.6 + 0.07 m in
   * `scripts/blender/env_build.py`), the seat for characters sitting on the wall; `midPierX` are
   * the mid-run piers whose caps stand 9 cm proud of it.
   */
  wall: { frontZ: 5.8, gateX: 1.02, gateWidth: 1.4, copingTop: 1.67, midPierX: [-3.7, 4.5] },
  sidewalk: { depth: 1.9, height: 0.12 },
  /** Characters stand on the sidewalk slab, not the road surface. */
  standY: 0.12,
  road: { depth: 6, startZ: 7.7 },
  /**
   * Public realm around the lot: a crossroads made of the front road (along X, the `road`
   * keys above) and a side road (along Z) west of the lot. Both run ±length/2 from the
   * origin and vanish in the fog. `scripts/blender/streets_build.py` mirrors these numbers.
   */
  streets: {
    length: 84,
    /** Side road carriageway, west of the lot's left wall. */
    side: { startX: -15.4, endX: -9.4 },
    /**
     * Radius of the kerb arc at each of the four crossroads corners. Kept under the 1.9 m
     * sidewalk depth so an arc never runs off the far edge of the strip it belongs to.
     */
    kerbRadius: 1.5,
    poleHeight: 8,
    /**
     * Utility poles, [x, z]. Each stands on a sidewalk strip; the two flanking the junction
     * sit clear of the kerb arc, and the wires run pole to pole in the order listed.
     */
    poles: [
      [-16.5, 7.2],
      [-8.45, 7.2],
      [8.6, 7.2],
      [33, 7.2],
      [-8.45, -22],
    ],
    /**
     * Zebra crossings on all four legs of the junction, `inset` past the kerb arc: `bars`
     * stripes `barWidth` wide at `pitch` centres, stopping `margin` short of each kerb, their
     * top face at `top`. `streets_build.py` mirrors these; `crossingRects` turns them into areas.
     */
    crossing: { inset: 1.2, bars: 5, barWidth: 0.5, pitch: 0.8, margin: 0.15, top: 0.08 },
  },
  /**
   * Neighbour lots, clockwise from the lot east of Nobita's. Each is Nobita's size, 15 m along
   * its street by 18 m deep, so the block reads as one even grid. `facing` is the direction the
   * front door looks; the house sits `HOUSE_SETBACK` back from that edge of its lot.
   * `offset` shifts it along the street so the row does not read as stamped, and `mirror`
   * swaps its door and step to the other side for the same reason. The gate stands in line
   * with the front door and `approach` is the walk laid from it to the door step (see
   * `neighbourEntry`).
   * `scripts/blender/neighbours_build.py` copies this table.
   */
  neighbours: [
    {
      id: 'east',
      lot: { x0: 7.9, x1: 22.9, z0: -12.2, z1: 5.8 },
      facing: '+z',
      variant: 'gable2',
      offset: 0.6,
      wall: '#F2EEE6',
      roof: '#7A4A34',
      mirror: false,
      approach: 'slabs',
    },
    {
      id: 'east-back',
      lot: { x0: 7.9, x1: 22.9, z0: -30.6, z1: -12.6 },
      facing: '-z',
      variant: 'gable1',
      offset: -0.5,
      wall: '#E4E2DC',
      roof: '#4A5060',
      mirror: true,
      approach: 'stones',
    },
    {
      id: 'back',
      lot: { x0: -7.5, x1: 7.5, z0: -30.6, z1: -12.6 },
      facing: '-z',
      variant: 'hip2',
      offset: 0.4,
      wall: '#EFE3C6',
      roof: '#3E4C66',
      mirror: false,
      approach: 'wash',
    },
    {
      id: 'west-back',
      lot: { x0: -35.3, x1: -17.3, z0: -24.6, z1: -9.6 },
      facing: '+x',
      variant: 'hip2',
      offset: -0.7,
      wall: '#E6E4E0',
      roof: '#4B5058',
      mirror: true,
      approach: 'stones',
    },
    {
      id: 'west',
      lot: { x0: -35.3, x1: -17.3, z0: -9.2, z1: 5.8 },
      facing: '+x',
      variant: 'gable2',
      offset: 0.5,
      wall: '#F0DCCF',
      roof: '#3E4C66',
      mirror: false,
      approach: 'wash',
    },
    {
      id: 'south',
      lot: { x0: -32.3, x1: -17.3, z0: 15.6, z1: 33.6 },
      facing: '-z',
      variant: 'gable1',
      offset: -0.4,
      wall: '#EDE7DA',
      roof: '#7A4A34',
      mirror: false,
      approach: 'stones',
    },
    {
      id: 'south-east',
      lot: { x0: 9.4, x1: 24.4, z0: 15.6, z1: 33.6 },
      facing: '-z',
      variant: 'hip2',
      offset: -0.6,
      wall: '#F4F1EA',
      roof: '#4A5060',
      mirror: true,
      approach: 'slabs',
    },
  ],
  /**
   * The vacant lot straight across the front road from Nobita's gate — the manga's 空き地
   * where the gang plays baseball. Drawn after the reference: open to the front-road sidewalk,
   * grass worn to bare earth in the middle, the three big concrete pipes against the back
   * wall, a pyramid of small rings and a bundle of bamboo by the east wall, a board fence
   * along the side road and block walls on the other two sides. It carries no house.
   * `scripts/blender/neighbours_build.py` copies these numbers.
   */
  sandlot: {
    lot: { x0: -7.5, x1: 9, z0: 15.6, z1: 33.6 },
    /** The edge with no wall at all: the lot opens straight onto the sidewalk there. */
    open: '-z' as const,
    /** The edge closed by the board fence; the remaining two get block walls. */
    fence: '-x' as const,
    /** Bare-earth patches, ellipses whose edge `inSandlotBare` wobbles so they read worn. */
    bare: [
      { centre: [0.4, 23.6] as const, rx: 4.6, rz: 4.4 },
      { centre: [-3.85, 18.8] as const, rx: 1.5, rz: 1.0 },
    ],
    /** Two pipes on the ground and one nested on top, lying along x. */
    pipes: { centre: [-0.3, 31.6] as const, radius: 0.6, length: 3.2 },
    /** Six small rings stacked 3-2-1 with their mouths to the street. */
    rings: { centre: [7.0, 18.0] as const, radius: 0.28, length: 0.5 },
    /** Bundle of bamboo poles lying along z, tied twice. */
    poles: { centre: [8.05, 22.0] as const, radius: 0.18, length: 3.6 },
    fenceHeight: 1.45,
  },
  /**
   * Widest canopy radius each plant model reaches, as a fraction of the height it is scaled
   * to. Measured from the exported GLBs and inflated by the +8% scale jitter `Foliage`
   * applies per instance, so it is the worst case for any one tree.
   */
  canopyRatio: { tree: 0.52, sakura: 0.54 },
  /**
   * Every tree in the block. The first five are Nobita's yard; every neighbour lot carries
   * planting of its own, so no yard reads bare from any orbit. `height` drives the scale
   * applied to whichever model loads, so keep every trunk at least `canopyRatio[kind] *
   * height` clear of the house on its own lot — `scene.test.ts` enforces exactly that.
   * `radius` only sizes the proxy fallback. Trees outside the hero lot cast no shadows, so
   * this table's length is a draw-call cost only.
   */
  trees: [
    { position: [-6.7, 0, 3.0] as const, height: 3.4, radius: 1.7, kind: 'sakura' as const },
    { position: [6.8, 0, 3.5] as const, height: 2.8, radius: 1.1, kind: 'tree' as const },
    { position: [-6.8, 0, -1.0] as const, height: 3.2, radius: 1.3, kind: 'tree' as const },
    { position: [6.7, 0, -6.5] as const, height: 4.8, radius: 1.9, kind: 'tree' as const },
    { position: [-5.7, 0, -10.9] as const, height: 3.6, radius: 1.4, kind: 'tree' as const },
    { position: [9.3, 0, -5.3] as const, height: 4.6, radius: 1.8, kind: 'tree' as const },
    { position: [21.7, 0, 4.3] as const, height: 3.4, radius: 1.3, kind: 'tree' as const },
    { position: [9.5, 0, 4.3] as const, height: 4.2, radius: 1.9, kind: 'sakura' as const },
    { position: [21.4, 0, -10.6] as const, height: 3.6, radius: 1.4, kind: 'tree' as const },
    { position: [21.4, 0, -14.9] as const, height: 4.0, radius: 1.6, kind: 'tree' as const },
    { position: [21.4, 0, -29.0] as const, height: 4.0, radius: 1.6, kind: 'tree' as const },
    { position: [9.8, 0, -14.7] as const, height: 3.0, radius: 1.2, kind: 'tree' as const },
    { position: [-5.8, 0, -14.8] as const, height: 5.0, radius: 2.0, kind: 'tree' as const },
    { position: [5.9, 0, -14.6] as const, height: 4.7, radius: 2.3, kind: 'sakura' as const },
    { position: [-5.8, 0, -29.0] as const, height: 4.0, radius: 1.6, kind: 'tree' as const },
    { position: [5.9, 0, -29.0] as const, height: 3.4, radius: 1.4, kind: 'tree' as const },
    { position: [-32.0, 0, -22.4] as const, height: 4.2, radius: 1.7, kind: 'tree' as const },
    { position: [-32.0, 0, -12.2] as const, height: 3.8, radius: 1.5, kind: 'tree' as const },
    { position: [-24.5, 0, -12.2] as const, height: 3.4, radius: 1.7, kind: 'sakura' as const },
    { position: [-18.4, 0, -23.5] as const, height: 3.8, radius: 1.5, kind: 'tree' as const },
    { position: [-18.4, 0, -11.2] as const, height: 4.2, radius: 1.9, kind: 'sakura' as const },
    { position: [-32.0, 0, 4.4] as const, height: 4.8, radius: 1.9, kind: 'tree' as const },
    { position: [-32.0, 0, -6.0] as const, height: 4.4, radius: 1.8, kind: 'tree' as const },
    { position: [-18.8, 0, 4.7] as const, height: 3.2, radius: 1.3, kind: 'tree' as const },
    { position: [6.75, 0, 31.6] as const, height: 5.2, radius: 2.0, kind: 'tree' as const },
    { position: [-5.25, 0, 31.6] as const, height: 4.2, radius: 1.7, kind: 'tree' as const },
    { position: [-31.0, 0, 32.2] as const, height: 3.8, radius: 1.5, kind: 'tree' as const },
    { position: [-18.5, 0, 32.2] as const, height: 3.6, radius: 1.4, kind: 'tree' as const },
    { position: [-18.5, 0, 17.4] as const, height: 4.2, radius: 1.9, kind: 'sakura' as const },
    { position: [22.6, 0, 32.0] as const, height: 4.4, radius: 1.7, kind: 'tree' as const },
    { position: [10.7, 0, 32.0] as const, height: 3.6, radius: 1.4, kind: 'tree' as const },
    { position: [22.6, 0, 17.4] as const, height: 4.0, radius: 1.6, kind: 'tree' as const },
  ],
  /**
   * Clipped shrub rows inside a front wall, running along the wall: along X by default,
   * `axis: 'z'` for lots whose gate wall stands on an X edge. Each row stops clear of the
   * gate opening, which `scene.test.ts` keeps outside the house footprint. Nobita's third and
   * fourth rows stand in the kerbed beds against his house, under the 洋室 window and in front
   * of the toilet (`env_build.py` `facade_bed_*`). The single shrubs raised off the ground
   * after them are the foliage pads of the three bonsai on the bench, at bonsai scale on the
   * tips of the trunks `env_build.py` builds (`BONSAI`, `bonsai_pads()`).
   */
  hedges: [
    { start: [-6.4, 0, 5.05] as const, count: 7, spacing: 0.72, height: 0.78, axis: 'x' as const },
    { start: [2.55, 0, 5.05] as const, count: 5, spacing: 0.72, height: 0.72, axis: 'x' as const },
    { start: [-3.1, 0, 3.2] as const, count: 5, spacing: 0.7, height: 0.55, axis: 'x' as const },
    { start: [2.5, 0, 0.2] as const, count: 2, spacing: 0.75, height: 0.55, axis: 'x' as const },
    { start: [4.35, 0.766, 3.95] as const, count: 1, spacing: 0, height: 0.16, axis: 'x' as const },
    { start: [4.45, 0.68, 3.95] as const, count: 1, spacing: 0, height: 0.12, axis: 'x' as const },
    { start: [4.83, 0.829, 3.95] as const, count: 1, spacing: 0, height: 0.18, axis: 'x' as const },
    { start: [4.99, 0.78, 3.95] as const, count: 1, spacing: 0, height: 0.12, axis: 'x' as const },
    { start: [4.72, 0.674, 3.95] as const, count: 1, spacing: 0, height: 0.11, axis: 'x' as const },
    { start: [5.25, 0.703, 3.95] as const, count: 1, spacing: 0, height: 0.14, axis: 'x' as const },
    { start: [5.44, 0.694, 3.95] as const, count: 1, spacing: 0, height: 0.11, axis: 'x' as const },
    { start: [9.4, 0, 5.05] as const, count: 6, spacing: 0.75, height: 0.75, axis: 'x' as const },
    { start: [10.2, 0, 16.35] as const, count: 6, spacing: 0.75, height: 0.72, axis: 'x' as const },
    { start: [-18.05, 0, -8.4] as const, count: 5, spacing: 0.75, height: 0.72, axis: 'z' as const },
    { start: [-31.5, 0, 16.35] as const, count: 3, spacing: 0.75, height: 0.75, axis: 'x' as const },
    { start: [-6.6, 0, -29.85] as const, count: 4, spacing: 0.75, height: 0.75, axis: 'x' as const },
    { start: [9.9, 0, -29.85] as const, count: 5, spacing: 0.75, height: 0.72, axis: 'x' as const },
    { start: [3.05, 0, 32.7] as const, count: 2, spacing: 0.75, height: 0.7, axis: 'x' as const },
    { start: [-6.45, 0, 29.2] as const, count: 1, spacing: 0.75, height: 0.75, axis: 'z' as const },
    { start: [-6.3, 0, 17.2] as const, count: 1, spacing: 0.75, height: 0.7, axis: 'z' as const },
    { start: [8.05, 0, 16.9] as const, count: 1, spacing: 0.75, height: 0.72, axis: 'z' as const },
  ],
} as const;

export type HouseVariant = 'hip2' | 'gable2' | 'gable1';
/** Direction a house's front door looks. No lot needs `-x`: nothing faces away from the block. */
export type Facing = '+z' | '-z' | '+x';

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface NeighbourLot {
  id: string;
  lot: Rect;
  facing: Facing;
  variant: HouseVariant;
  offset: number;
  wall: string;
  roof: string;
  /** Door on the house's left rather than its right, seen from the street. */
  mirror: boolean;
  approach: ApproachStyle;
}

/**
 * The walk from a neighbour's gate to its door step, after the Nerima houses of the manga:
 * `slabs` is cut granite laid in courses on a mortar bed, `stones` stepping stones in a raked
 * gravel strip, `wash` 洗い出し — washed-aggregate concrete between dark kerbs.
 */
export type ApproachStyle = 'slabs' | 'stones' | 'wash';

/** Distance from the facing lot edge to the front wall of the house standing on it. */
export const HOUSE_SETBACK = 3.2;

/**
 * The three neighbour house shapes, shared by the R3F proxy and `neighbours_build.py`.
 * `width` runs along the street, `depth` away from it. Roof sizes already include the 0.5 m
 * eave overhang; heights are `span / 2 * tan(25°)` for the 25° pitch the whole block uses.
 * `ridge` is the length of the ridge line along `ridgeAxis`; equal to the roof size on that
 * axis it makes a gable, shorter it makes a hip.
 */
export const houseVariants = {
  hip2: {
    storeys: 2,
    width: 7.5,
    depth: 6.5,
    /** Upper storey is pulled in on all four sides by this much. */
    upperInset: 0.6,
    groundHeight: 2.75,
    eaveHeight: 5.3,
    roof: { width: 7.3, depth: 6.3, height: 1.47, ridge: 1.0, ridgeAxis: 'x' as const },
  },
  gable2: {
    storeys: 2,
    width: 8.0,
    depth: 6.0,
    upperInset: 0,
    groundHeight: 2.75,
    eaveHeight: 5.3,
    roof: { width: 9.0, depth: 7.0, height: 1.63, ridge: 9.0, ridgeAxis: 'x' as const },
  },
  gable1: {
    storeys: 1,
    width: 8.5,
    depth: 6.5,
    upperInset: 0,
    groundHeight: 2.75,
    eaveHeight: 2.75,
    /** Gable end faces the street, so the ridge runs away from it. */
    roof: { width: 9.5, depth: 7.5, height: 2.22, ridge: 7.5, ridgeAxis: 'z' as const },
  },
} satisfies Record<HouseVariant, unknown>;

export interface HousePlacement {
  centre: readonly [number, number];
  /** Radians about +Y. 0 faces +Z, the same convention as the characters. */
  yaw: number;
  /** Ridge height above ground: the fog/shadow budget uses it. */
  height: number;
  /** World-space footprint of the ground storey, after `yaw`. Roof overhang excluded. */
  bounds: Rect;
}

/**
 * Where the house on a lot stands. Proxy geometry, the layout test and `neighbours_build.py`
 * all derive from this one function so they cannot drift apart.
 */
export function houseTransform(n: NeighbourLot): HousePlacement {
  const v = houseVariants[n.variant];
  const { x0, x1, z0, z1 } = n.lot;
  let cx: number;
  let cz: number;
  let yaw: number;
  if (n.facing === '+z') {
    cx = (x0 + x1) / 2 + n.offset;
    cz = z1 - HOUSE_SETBACK - v.depth / 2;
    yaw = 0;
  } else if (n.facing === '-z') {
    cx = (x0 + x1) / 2 + n.offset;
    cz = z0 + HOUSE_SETBACK + v.depth / 2;
    yaw = Math.PI;
  } else {
    // Rotating +Z by +π/2 about Y lands on +X (three.js is right-handed).
    cz = (z0 + z1) / 2 + n.offset;
    cx = x1 - HOUSE_SETBACK - v.depth / 2;
    yaw = Math.PI / 2;
  }
  const alongX = n.facing === '+x' ? v.depth : v.width;
  const alongZ = n.facing === '+x' ? v.width : v.depth;
  return {
    centre: [cx, cz],
    yaw,
    height: v.eaveHeight + v.roof.height,
    bounds: {
      x0: cx - alongX / 2,
      x1: cx + alongX / 2,
      z0: cz - alongZ / 2,
      z1: cz + alongZ / 2,
    },
  };
}

/** Pedestrian gate in a neighbour's street wall, pier to pier: two leaves of 0.75 m. */
export const NEIGHBOUR_GATE_WIDTH = 1.5;
/** Width of the walk from a neighbour's gate to its door; the door step is 1.9 m wide. */
export const APPROACH_WIDTH = 1.1;
/** How far the door step stands out from a neighbour's front wall. */
export const DOOR_STEP_DEPTH = 0.7;

/**
 * House-local (along the street, toward it) to world x/z for a neighbour lot, the same map
 * as `place()` in `neighbours_build.py`. Yaws are quarter turns, so a local box stays
 * axis-aligned and only swaps its extents.
 */
export function houseLocalToWorld(n: NeighbourLot) {
  const { centre, yaw } = houseTransform(n);
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  return (lx: number, lz: number): readonly [number, number] => [
    centre[0] + lx * c + lz * s,
    centre[1] - lx * s + lz * c,
  ];
}

/** Along the front wall from the house centre to the middle of its front door. */
export function neighbourDoorU(n: NeighbourLot): number {
  return (n.mirror ? -1 : 1) * houseVariants[n.variant].width * 0.3;
}

/**
 * Where a neighbour is entered: the gate in the street wall, in line with the front door, and
 * the walk from it to the door step. `gate` is the gate's centre on the lot edge; `path` is
 * the walk's world footprint from the front of the step out to that edge.
 */
export function neighbourEntry(n: NeighbourLot): { gate: readonly [number, number]; path: Rect } {
  const toWorld = houseLocalToWorld(n);
  const u = neighbourDoorU(n);
  const front = houseVariants[n.variant].depth / 2;
  const a = toWorld(u - APPROACH_WIDTH / 2, front + DOOR_STEP_DEPTH);
  const b = toWorld(u + APPROACH_WIDTH / 2, front + HOUSE_SETBACK);
  return {
    gate: toWorld(u, front + HOUSE_SETBACK),
    path: {
      x0: Math.min(a[0], b[0]),
      x1: Math.max(a[0], b[0]),
      z0: Math.min(a[1], b[1]),
      z1: Math.max(a[1], b[1]),
    },
  };
}

/** Nobita's lot. The hero yard is lit and shadowed to a higher standard than the block. */
export const heroLot: Rect = {
  x0: -layout.lot.width / 2,
  x1: layout.lot.width / 2,
  z0: layout.wall.frontZ - layout.lot.depth,
  z1: layout.wall.frontZ,
};

export function inHeroLot(x: number, z: number): boolean {
  return x >= heroLot.x0 && x <= heroLot.x1 && z >= heroLot.z0 && z <= heroLot.z1;
}

/**
 * Ground footprints of what stands on the sandlot, in world x/z: the pipe stack (two pipes
 * side by side, so twice the diameter across), the ring pyramid (three rings along x) and the
 * bamboo bundle (along z). The lawn, the planting test and the layout test all read these.
 */
export function sandlotProps(): { pipes: Rect; rings: Rect; poles: Rect } {
  const { pipes, rings, poles } = layout.sandlot;
  return {
    pipes: {
      x0: pipes.centre[0] - pipes.length / 2,
      x1: pipes.centre[0] + pipes.length / 2,
      z0: pipes.centre[1] - 2 * pipes.radius,
      z1: pipes.centre[1] + 2 * pipes.radius,
    },
    rings: {
      x0: rings.centre[0] - 3 * rings.radius,
      x1: rings.centre[0] + 3 * rings.radius,
      z0: rings.centre[1] - rings.length / 2,
      z1: rings.centre[1] + rings.length / 2,
    },
    poles: {
      x0: poles.centre[0] - poles.radius,
      x1: poles.centre[0] + poles.radius,
      z0: poles.centre[1] - poles.length / 2,
      z1: poles.centre[1] + poles.length / 2,
    },
  };
}

/**
 * Edge of a bare patch as a multiple of its radius at polar angle `theta`: three low
 * harmonics so it reads as trodden ground, not a drawn ellipse. `neighbours_build.py` cuts
 * the dirt with the same function so the lawn stops exactly where the earth begins.
 */
export function bareEdge(theta: number): number {
  return (
    1 + 0.1 * Math.sin(3 * theta + 0.7) + 0.06 * Math.sin(5 * theta - 1.9) + 0.04 * Math.sin(2 * theta + 2.5)
  );
}

/** True where the sandlot's grass has worn through to earth. */
export function inSandlotBare(x: number, z: number): boolean {
  for (const { centre, rx, rz } of layout.sandlot.bare) {
    const u = (x - centre[0]) / rx;
    const v = (z - centre[1]) / rz;
    if (Math.hypot(u, v) < bareEdge(Math.atan2(v, u))) return true;
  }
  return false;
}

export type SandlotEdge = '-x' | '+x' | '-z' | '+z';
export const SANDLOT_EDGES: readonly SandlotEdge[] = ['-x', '+x', '-z', '+z'];

/** What closes an edge of the sandlot: nothing, the board fence, or a block wall. */
export function sandlotEdge(edge: SandlotEdge): 'open' | 'fence' | 'wall' {
  const { open, fence } = layout.sandlot;
  return edge === open ? 'open' : edge === fence ? 'fence' : 'wall';
}

/**
 * `onSidewalk` below has no runtime caller, and `allLots` only the camera's check that a
 * followed walker is not being watched through a lot wall: they exist so `scene.test.ts` can
 * state the layout invariants — every lot disjoint from every road, every pole on pavement —
 * against the same numbers the scene is built from, instead of against a copy.
 */

/** Every lot in the block, Nobita's included. */
export function allLots(): Rect[] {
  return [heroLot, ...layout.neighbours.map((n) => n.lot), layout.sandlot.lot];
}

/** True when (x, z) is on one of the four sidewalk strips, junction corners included. */
export function onSidewalk(x: number, z: number): boolean {
  const { sidewalk, road, streets, lot, wall } = layout;
  const half = streets.length / 2;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const nearFront = z >= wall.frontZ && z <= wall.frontZ + sidewalk.depth;
  const farFront = z >= road.startZ + road.depth && z <= road.startZ + road.depth + sidewalk.depth;
  const nearSide = x >= streets.side.endX && x <= -lot.width / 2;
  const farSide = x >= streets.side.startX - sidewalk.depth && x <= streets.side.startX;
  // A strip stops at the kerb of the road that crosses it.
  const acrossSideRoad = x > streets.side.startX && x < streets.side.endX;
  const acrossFrontRoad = z > road.startZ && z < road.startZ + road.depth;
  if ((nearFront || farFront) && !acrossSideRoad) return true;
  return (nearSide || farSide) && !acrossFrontRoad;
}

export type CrossingLeg = 'east' | 'west' | 'south' | 'north';

/**
 * The painted area of each zebra crossing, named by the junction leg it sits on: `east` and
 * `west` cross the front road, `south` and `north` the side road. The bars step away from the
 * junction, so a crossing starts `inset` past the kerb arc and runs outward.
 */
export function crossingRects(): Record<CrossingLeg, Rect> {
  const { road, streets } = layout;
  const { inset, bars, barWidth, pitch, margin } = streets.crossing;
  const span = (bars - 1) * pitch + barWidth;
  const roadEnd = road.startZ + road.depth;
  const east = streets.side.endX + streets.kerbRadius + inset;
  const west = streets.side.startX - streets.kerbRadius - inset;
  const south = roadEnd + streets.kerbRadius + inset;
  const north = road.startZ - streets.kerbRadius - inset;
  const acrossFront = { z0: road.startZ + margin, z1: roadEnd - margin };
  const acrossSide = { x0: streets.side.startX + margin, x1: streets.side.endX - margin };
  return {
    east: { x0: east, x1: east + span, ...acrossFront },
    // Stepping outward from `west` means the bars run toward -x, each one `barWidth` wide.
    west: { x0: west + barWidth - span, x1: west + barWidth, ...acrossFront },
    south: { ...acrossSide, z0: south, z1: south + span },
    north: { ...acrossSide, z0: north + barWidth - span, z1: north + barWidth },
  };
}
