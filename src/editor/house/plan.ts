import type { MaterialKey } from './materials';

/**
 * Nobita's house, laid out from `assets/drawings.jpg` — the house's own plan as the exhibition
 * shows it, 1階 on the right of the sheet, 2階 on the left — with the hallway and the front door
 * detailed after `assets/ground-1.jpg`, the anime's view down the hall to the entrance.
 *
 * The sheet has no scale bar, but it names three rooms by their mat count: the 洋室 is 6 jo,
 * the 居間 8 jo, Nobita's room upstairs 6 jo. Measured on wall centre lines all three give the
 * same 71 px/m, and at that scale every wall lands on the half-tatami module (0.455 m):
 *
 *   main block  7.28 × 7.28   16 × 16 modules
 *     left, 3.64 wide   洋室 (6 jo), 居間 (8 jo), then a 0.91 strip: 鏡台 nook and 押入れ
 *     middle, 1.82 wide genkan, then the hallway; the stair climbs its left half to the back
 *     right, 1.82 wide  toilet, washroom, bath, starting 2.96 m back from the street
 *   kitchen     5.46 × 3.185  behind, set in 0.91 from each side, 勝手口 in its back-right corner
 *   upper floor 4.55 × 4.55   10 × 10 modules over the 居間, its back strip and the stair
 *     Nobita's room (6 jo) over the 居間, Doraemon's 押し入れ and a storeroom on its garden
 *     side, the stairwell on its hall side, and the upstairs hall along the back
 *
 * The upper floor's walls stand on the ground floor's: its front wall on the 洋室/居間
 * partition, its back wall on the main block's back wall, its garden wall on the garden wall,
 * its hall-side wall over the stair's knee wall. That is also what fixes where the stair ends:
 * the upstairs hall crosses the top of the stair column on the sheet, so the flight has to
 * arrive at its front edge, two modules short of the back wall.
 *
 * Street at +z; x runs left to right as seen from the street, so the 洋室 is the front-left
 * corner and the wet rooms stand on the right. The origin is the front-left corner of the main
 * block on wall centre lines. Everything the editor draws — floors, walls, openings, stairs,
 * furniture, labels — is derived from this file, and `plan.test.ts` holds it to the invariants
 * a plan edit could break.
 */

/** Half a tatami width. Every wall centre line sits on a multiple of it. */
export const H = 0.455;

/** World heights, metres. */
export const LEVEL = {
  /** Top of the raised floor in every downstairs room but the two doma. */
  floor: 0.4,
  /** The genkan's and the 勝手口's floors, one step below the house floor. */
  genkan: 0.12,
  /** Top of the ground-storey walls and underside of the upper floor: 2.45 m clear. */
  top: 2.85,
  /** Door heads and window heads over the raised floor. */
  head: 2.4,
  /** The upper floor, finished: the stair's last tread. */
  upper: 3.1,
  /** Top of the upper-storey walls: 2.4 m clear over the upper floor. */
  upperTop: 5.5,
} as const;

export type StoreyId = 'ground' | 'upper';

/** Each storey's walls run from `base` to `top`; its rooms' floors are at `floor`. */
export const STOREYS: Record<StoreyId, { base: number; floor: number; top: number }> = {
  ground: { base: 0, floor: LEVEL.floor, top: LEVEL.top },
  upper: { base: LEVEL.top, floor: LEVEL.upper, top: LEVEL.upperTop },
};

export const WALL_EXTERIOR = 0.15;
export const WALL_INTERIOR = 0.12;

/** Axis-aligned rectangle on the ground plane, `x0 < x1`, `z0 < z1`. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** `void` is floorless: the stairwell, open down to the flight. */
export type FloorFinish =
  | 'tatami'
  | 'planks'
  | 'planksLight'
  | 'genkan'
  | 'doma'
  | 'kitchen'
  | 'bath'
  | 'void';

export type RoomId =
  | 'yoshitsu'
  | 'living'
  | 'nook'
  | 'oshiire'
  | 'genkan'
  | 'hallway'
  | 'toilet'
  | 'washroom'
  | 'bath'
  | 'kitchen'
  | 'doma'
  | 'nobita'
  | 'doraOshiire'
  | 'storeroom'
  | 'upperHall'
  | 'stairwell';

export interface Room {
  id: RoomId;
  name: string;
  kana: string;
  storey: StoreyId;
  /** On wall centre lines. A room may be several rectangles, like the kitchen round its doma. */
  rects: Rect[];
  floorY: number;
  floor: FloorFinish;
  /** Interior wall finish. */
  wall: MaterialKey;
  /** A closet or storeroom: filled to its doors, never stood in. */
  storage?: true;
}

export interface WindowOpening {
  kind: 'window';
  id: string;
  /** Along the wall's axis, world coordinates, `from < to`. */
  from: number;
  to: number;
  /** World heights of the sill and the head. */
  sill: number;
  head: number;
  glass: 'clear' | 'frosted';
  /** One fixed pane with glazing bars across it instead of two sliding sashes. */
  fixed?: true;
  /** A floor-level glass door (掃き出し窓): sliding sashes down to the floor, a way out. */
  walkout?: true;
  curtains?: MaterialKey;
}

interface DoorBase {
  kind: 'door';
  id: string;
  from: number;
  to: number;
  sill: number;
  head: number;
  panel: 'wood' | 'woodGlass' | 'front' | 'glass' | 'frosted' | 'fusuma';
  /** Height where the leaf stops and a glazed transom fills the opening to its head. */
  transom?: number;
}

/**
 * How a door's leaves hang and open. Every door is drawn closed in its own opening, as the
 * drawing shows them. `latch` is the leading edge — the knob or pull, the edge that meets the
 * jamb shut — and a leaf opens away from it: `hinged` swings on its other edge into the room
 * named by `swing`; `sliding` runs into the wall past its other edge; `pair` is two sliding
 * leaves on a double track, meeting in the middle, the `from` leaf sliding over the `to` one.
 */
export type DoorLeaf =
  | { leaf: 'hinged'; latch: 'from' | 'to'; swing: RoomId | 'outside' }
  | { leaf: 'sliding'; latch: 'from' | 'to' }
  | { leaf: 'pair' };

export type DoorOpening = DoorBase & DoorLeaf;

export type Opening = WindowOpening | DoorOpening;

export interface Wall {
  id: string;
  storey: StoreyId;
  /** The axis the wall runs along: an `x` wall stands at constant z = `at`. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  thickness: number;
  openings: Opening[];
}

export type Facing = 'S' | 'N' | 'E' | 'W';

export type FurnitureKind =
  | 'plant'
  | 'flowers'
  | 'sofa'
  | 'armchair'
  | 'coffeeTable'
  | 'rug'
  | 'bookcase'
  | 'lowCabinet'
  | 'tvStand'
  | 'crtTv'
  | 'kotatsu'
  | 'floorCushion'
  | 'tansu'
  | 'kyodai'
  | 'oshiireShelf'
  | 'getabako'
  | 'umbrellaStand'
  | 'mat'
  | 'phoneStand'
  | 'phone'
  | 'sideboard'
  | 'trashBin'
  | 'diningTable'
  | 'chair'
  | 'counterRun'
  | 'fridge'
  | 'dishCabinet'
  | 'riceBin'
  | 'toilet'
  | 'vanity'
  | 'washingMachine'
  | 'bathtub'
  | 'bathStool'
  | 'studyDesk'
  | 'doraBed'
  | 'storageBoxes';

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  room: RoomId;
  /** Footprint centre. */
  x: number;
  z: number;
  /** Which way the item's front faces: S toward the street (+z), E toward +x. */
  facing: Facing;
  /** Degrees turned on from `facing`, in the same S → E → N → W sense: the TV set across a corner. */
  turn?: number;
  /** Width across the front, depth front to back, height; metres. */
  w: number;
  d: number;
  h: number;
  /** Stands on top of this item instead of the floor. */
  on?: string;
  /** Lies flat on the floor (a rug): other items may stand on it. */
  floorCover?: true;
}

// --- rooms -----------------------------------------------------------------------------------

const rect = (x0: number, x1: number, z0: number, z1: number): Rect => ({
  x0: x0 * H,
  x1: x1 * H,
  z0: z0 * H,
  z1: z1 * H,
});

export const ROOMS: Room[] = [
  // --- ground floor ---
  {
    id: 'yoshitsu',
    name: 'Western room',
    kana: '洋室',
    storey: 'ground',
    rects: [rect(0, 8, -6, 0)],
    floorY: LEVEL.floor,
    floor: 'planksLight',
    wall: 'plasterWarm',
  },
  {
    id: 'living',
    name: 'Living room',
    kana: '居間兼寝室',
    storey: 'ground',
    rects: [rect(0, 8, -14, -6)],
    floorY: LEVEL.floor,
    floor: 'tatami',
    wall: 'juraku',
  },
  {
    // Open to the 居間: the mother's dresser stands in it on a strip of board floor.
    id: 'nook',
    name: 'Dresser nook',
    kana: '鏡台',
    storey: 'ground',
    rects: [rect(0, 4, -16, -14)],
    floorY: LEVEL.floor,
    floor: 'planks',
    wall: 'juraku',
  },
  {
    id: 'oshiire',
    name: 'Closet',
    kana: '押入れ',
    storey: 'ground',
    rects: [rect(4, 8, -16, -14)],
    floorY: LEVEL.floor,
    floor: 'planks',
    wall: 'plaster',
    storage: true,
  },
  {
    id: 'genkan',
    name: 'Genkan',
    kana: '玄関',
    storey: 'ground',
    rects: [rect(8, 12, -3.5, 0)],
    floorY: LEVEL.genkan,
    floor: 'genkan',
    wall: 'plasterMint',
  },
  {
    id: 'hallway',
    name: 'Hallway',
    kana: '廊下',
    storey: 'ground',
    rects: [rect(8, 12, -16, -3.5)],
    floorY: LEVEL.floor,
    floor: 'planks',
    wall: 'plasterMint',
  },
  {
    id: 'toilet',
    name: 'Toilet',
    kana: 'トイレ',
    storey: 'ground',
    rects: [rect(12, 16, -8.5, -6.5)],
    floorY: LEVEL.floor,
    floor: 'bath',
    wall: 'bathWall',
  },
  {
    id: 'washroom',
    name: 'Washroom',
    kana: '洗面所',
    storey: 'ground',
    rects: [rect(12, 16, -12, -8.5)],
    floorY: LEVEL.floor,
    floor: 'bath',
    wall: 'bathWall',
  },
  {
    id: 'bath',
    name: 'Bath',
    kana: '浴室',
    storey: 'ground',
    rects: [rect(12, 16, -16, -12)],
    floorY: LEVEL.floor,
    floor: 'bath',
    wall: 'bathWall',
  },
  {
    id: 'kitchen',
    name: 'Kitchen & dining',
    kana: '台所・食堂',
    storey: 'ground',
    rects: [rect(2, 14, -20, -16), rect(2, 11, -23, -20)],
    floorY: LEVEL.floor,
    floor: 'kitchen',
    wall: 'plaster',
  },
  {
    id: 'doma',
    name: 'Back door',
    kana: '勝手口',
    storey: 'ground',
    rects: [rect(11, 14, -23, -20)],
    floorY: LEVEL.genkan,
    floor: 'doma',
    wall: 'plaster',
  },
  // --- upper floor ---
  {
    id: 'nobita',
    name: "Nobita's room",
    kana: 'のび太の部屋',
    storey: 'upper',
    rects: [rect(2, 8, -14, -6)],
    floorY: LEVEL.upper,
    floor: 'tatami',
    wall: 'plasterWarm',
  },
  {
    id: 'doraOshiire',
    name: "Doraemon's closet",
    kana: '押し入れ',
    storey: 'upper',
    rects: [rect(0, 2, -12, -6)],
    floorY: LEVEL.upper,
    floor: 'planks',
    wall: 'plaster',
    storage: true,
  },
  {
    id: 'storeroom',
    name: 'Storeroom',
    kana: '納戸',
    storey: 'upper',
    rects: [rect(0, 2, -14, -12)],
    floorY: LEVEL.upper,
    floor: 'planks',
    wall: 'plaster',
    storage: true,
  },
  {
    id: 'upperHall',
    name: 'Upstairs hall',
    kana: '2階廊下',
    storey: 'upper',
    rects: [rect(0, 10, -16, -14)],
    floorY: LEVEL.upper,
    floor: 'planks',
    wall: 'plasterMint',
  },
  {
    id: 'stairwell',
    name: 'Stairwell',
    kana: '階段',
    storey: 'upper',
    rects: [rect(8, 10, -14, -10)],
    floorY: LEVEL.upper,
    floor: 'void',
    wall: 'plasterMint',
  },
];

/**
 * The storey a room stands in — which is also the storey of its walls, its floor and everything
 * standing on it. The diorama builds the two storeys apart so it can lift one off the other.
 */
export function storeyOfRoom(id: RoomId): StoreyId {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`no room "${id}"`);
  return room.storey;
}

// --- walls -----------------------------------------------------------------------------------

const win = (
  id: string,
  from: number,
  to: number,
  sill: number,
  head: number,
  extra?: Partial<WindowOpening>,
) => ({ kind: 'window', id, from, to, sill, head, glass: 'clear', ...extra }) satisfies WindowOpening;

/** A door over a storey's floor, 2 m tall. */
const door = (
  id: string,
  from: number,
  to: number,
  rest: DoorLeaf & Pick<DoorBase, 'panel' | 'transom'>,
  storey: StoreyId = 'ground',
): DoorOpening => {
  const floor = STOREYS[storey].floor;
  return { kind: 'door', id, from, to, sill: floor, head: floor + 2.0, ...rest };
};

/** Window sill over the raised floor. */
const SILL = LEVEL.floor + 0.85;
/** The upper floor, for the upstairs openings. */
const U = LEVEL.upper;

export const WALLS: Wall[] = [
  // --- ground floor, exterior ---
  {
    id: 'front',
    storey: 'ground',
    axis: 'x',
    at: 0,
    from: 0,
    to: 12 * H,
    thickness: WALL_EXTERIOR,
    openings: [
      // Beside its shutter box, the louvred case home.jpg draws to the left of this window.
      win('win-yoshitsu-front', 1.05, 3.25, SILL, LEVEL.head, { curtains: 'curtainTeal' }),
      // The front door of ground-1.jpg: a hinged leaf with a small window, the knob beside the
      // sidelight, a glazed transom over it; on the genkan's tile level.
      {
        kind: 'door',
        id: 'door-front',
        from: 4.2,
        to: 5.0,
        sill: LEVEL.genkan,
        head: 2.5,
        leaf: 'hinged',
        panel: 'front',
        latch: 'to',
        // Out over the porch, as a Japanese front door opens: the shoes in the genkan are never
        // in its way.
        swing: 'outside',
        transom: LEVEL.genkan + 2.0,
      },
      win('win-sidelight', 5.06, 5.33, LEVEL.genkan + 0.05, 2.5, { glass: 'frosted', fixed: true }),
    ],
  },
  {
    id: 'west',
    storey: 'ground',
    axis: 'z',
    at: 0,
    from: -16 * H,
    to: 0,
    thickness: WALL_EXTERIOR,
    openings: [
      win('win-yoshitsu-side', -2.35, -0.45, SILL, LEVEL.head),
      // The 居間's glass doors onto the garden, a wooden step outside and the shutter box beside.
      win('win-living-garden', -6.25, -4.55, LEVEL.floor, LEVEL.head, {
        walkout: true,
        curtains: 'curtainGreen',
      }),
    ],
  },
  {
    id: 'hall-east',
    storey: 'ground',
    axis: 'z',
    at: 12 * H,
    from: -16 * H,
    to: 0,
    thickness: WALL_EXTERIOR,
    openings: [
      // Into the toilet: the bowl stands at the far end, clear of the leaf.
      door('door-toilet', -3.75, -3.1, { leaf: 'hinged', panel: 'woodGlass', latch: 'to', swing: 'toilet' }),
      // Into the wall toward the bath: the other way is the toilet door.
      door('door-washroom', -5.05, -4.3, { leaf: 'sliding', panel: 'frosted', latch: 'to' }),
    ],
  },
  {
    id: 'wet-front',
    storey: 'ground',
    axis: 'x',
    at: -6.5 * H,
    from: 12 * H,
    to: 16 * H,
    thickness: WALL_EXTERIOR,
    openings: [win('win-toilet', 5.9, 6.5, 1.6, 2.2, { glass: 'frosted' })],
  },
  {
    id: 'east',
    storey: 'ground',
    axis: 'z',
    at: 16 * H,
    from: -16 * H,
    to: -6.5 * H,
    thickness: WALL_EXTERIOR,
    openings: [
      win('win-washroom', -5.3, -4.8, 1.55, 2.25, { glass: 'frosted' }),
      win('win-bath', -6.35, -5.75, 1.45, 2.2, { glass: 'frosted' }),
    ],
  },
  {
    // The main block's back face, kitchen side and garden side alike.
    id: 'back',
    storey: 'ground',
    axis: 'x',
    at: -16 * H,
    from: 0,
    to: 16 * H,
    thickness: WALL_EXTERIOR,
    // At the hall's end, on the walkway beside the stair.
    openings: [door('door-kitchen', 4.68, 5.33, { leaf: 'sliding', panel: 'glass', latch: 'from' })],
  },
  {
    id: 'kitchen-west',
    storey: 'ground',
    axis: 'z',
    at: 2 * H,
    from: -23 * H,
    to: -16 * H,
    thickness: WALL_EXTERIOR,
    // The glass door across the kitchen from the 勝手口, onto the garden.
    openings: [win('win-kitchen-garden', -9.4, -7.8, LEVEL.floor, LEVEL.head, { walkout: true })],
  },
  {
    id: 'kitchen-east',
    storey: 'ground',
    axis: 'z',
    at: 14 * H,
    from: -23 * H,
    to: -16 * H,
    thickness: WALL_EXTERIOR,
    // The 勝手口, onto the side yard behind the bath.
    openings: [
      {
        kind: 'door',
        id: 'door-back',
        from: -10.3,
        to: -9.5,
        sill: LEVEL.genkan,
        head: LEVEL.genkan + 2.0,
        leaf: 'hinged',
        panel: 'frosted',
        latch: 'to',
        swing: 'outside',
      },
    ],
  },
  {
    id: 'kitchen-back',
    storey: 'ground',
    axis: 'x',
    at: -23 * H,
    from: 2 * H,
    to: 14 * H,
    thickness: WALL_EXTERIOR,
    // Over the sink, clear of a 0.85 m worktop.
    openings: [win('win-kitchen-back', 2.2, 3.3, LEVEL.floor + 1.05, LEVEL.head)],
  },
  // --- ground floor, partitions ---
  {
    id: 'center-west',
    storey: 'ground',
    axis: 'z',
    at: 8 * H,
    from: -16 * H,
    to: 0,
    thickness: WALL_INTERIOR,
    openings: [
      door('door-yoshitsu', -2.5, -1.75, { leaf: 'hinged', panel: 'wood', latch: 'from', swing: 'yoshitsu' }),
      // Into the wall toward the back: the other way is the 洋室 door.
      door('door-living', -3.85, -3.05, { leaf: 'sliding', panel: 'glass', latch: 'to' }),
    ],
  },
  {
    id: 'yoshitsu-living',
    storey: 'ground',
    axis: 'x',
    at: -6 * H,
    from: 0,
    to: 8 * H,
    thickness: WALL_INTERIOR,
    openings: [],
  },
  {
    id: 'living-back',
    storey: 'ground',
    axis: 'x',
    at: -14 * H,
    from: 4 * H,
    to: 8 * H,
    thickness: WALL_INTERIOR,
    openings: [door('fusuma-oshiire', 1.93, 3.53, { leaf: 'pair', panel: 'fusuma' })],
  },
  {
    id: 'nook-side',
    storey: 'ground',
    axis: 'z',
    at: 4 * H,
    from: -16 * H,
    to: -14 * H,
    thickness: WALL_INTERIOR,
    openings: [],
  },
  {
    id: 'toilet-wash',
    storey: 'ground',
    axis: 'x',
    at: -8.5 * H,
    from: 12 * H,
    to: 16 * H,
    thickness: WALL_INTERIOR,
    openings: [],
  },
  {
    id: 'wash-bath',
    storey: 'ground',
    axis: 'x',
    at: -12 * H,
    from: 12 * H,
    to: 16 * H,
    thickness: WALL_INTERIOR,
    // The bath is entered from the washroom only, at the hall end of their partition.
    openings: [door('door-bath', 5.6, 6.3, { leaf: 'sliding', panel: 'frosted', latch: 'from' })],
  },
  // --- upper floor, exterior ---
  {
    // Over the 洋室/居間 partition. Nobita's desk stands under its window, which looks out over
    // the 洋室's roof to the street.
    id: 'up-front',
    storey: 'upper',
    axis: 'x',
    at: -6 * H,
    from: 0,
    to: 8 * H,
    thickness: WALL_EXTERIOR,
    // High, as home.jpg draws it: its sill clears the ridge of the 洋室's roof, which dies into
    // this wall just under it.
    openings: [win('win-nobita', 1.55, 3.05, U + 1.1, U + 2.0, { curtains: 'curtainBlue' })],
  },
  {
    id: 'up-west',
    storey: 'upper',
    axis: 'z',
    at: 0,
    from: -16 * H,
    to: -6 * H,
    thickness: WALL_EXTERIOR,
    openings: [],
  },
  {
    id: 'up-back',
    storey: 'upper',
    axis: 'x',
    at: -16 * H,
    from: 0,
    to: 10 * H,
    thickness: WALL_EXTERIOR,
    // The hall's window, the panes the sheet draws along its back wall.
    openings: [win('win-upper-hall', 1.4, 2.4, U + 0.9, U + 1.9)],
  },
  {
    // Over the stair's knee wall: the hall side of the stairwell and the upstairs hall's end.
    id: 'up-east',
    storey: 'upper',
    axis: 'z',
    at: 10 * H,
    from: -16 * H,
    to: -10 * H,
    thickness: WALL_EXTERIOR,
    // Over the east roof, which climbs to this wall's foot.
    openings: [win('win-stairwell', -5.6, -4.95, U + 1.1, U + 1.9, { glass: 'frosted' })],
  },
  {
    // The stairwell's front, over the foot of the flight.
    id: 'up-stair-front',
    storey: 'upper',
    axis: 'x',
    at: -10 * H,
    from: 8 * H,
    to: 10 * H,
    thickness: WALL_EXTERIOR,
    openings: [],
  },
  {
    // Nobita's room's hall-side wall: outside to the front of the stairwell, the stairwell
    // behind. His bookcase stands against it.
    id: 'up-room-east',
    storey: 'upper',
    axis: 'z',
    at: 8 * H,
    from: -14 * H,
    to: -6 * H,
    thickness: WALL_EXTERIOR,
    openings: [],
  },
  // --- upper floor, partitions ---
  {
    // Between the rooms and the upstairs hall: the storeroom door, then Nobita's door, the one
    // the sheet draws in the middle of his room's back wall.
    id: 'up-room-back',
    storey: 'upper',
    axis: 'x',
    at: -14 * H,
    from: 0,
    to: 8 * H,
    thickness: WALL_INTERIOR,
    openings: [
      door('door-storeroom', 0.15, 0.78, { leaf: 'sliding', panel: 'fusuma', latch: 'from' }, 'upper'),
      door('door-nobita', 1.95, 2.7, { leaf: 'sliding', panel: 'wood', latch: 'from' }, 'upper'),
    ],
  },
  {
    // Nobita's room's garden-side wall: the fusuma of Doraemon's 押し入れ, then the storeroom.
    id: 'up-oshiire',
    storey: 'upper',
    axis: 'z',
    at: 2 * H,
    from: -14 * H,
    to: -6 * H,
    thickness: WALL_INTERIOR,
    openings: [door('fusuma-dora', -5.3, -3.48, { leaf: 'pair', panel: 'fusuma' }, 'upper')],
  },
  {
    id: 'up-oshiire-back',
    storey: 'upper',
    axis: 'x',
    at: -12 * H,
    from: 0,
    to: 2 * H,
    thickness: WALL_INTERIOR,
    openings: [],
  },
];

// --- stairs ----------------------------------------------------------------------------------

/**
 * A straight flight in the hall's left half, against the 居間 wall, climbing toward the back
 * ("2階へ ↓" on the sheet) from 4.55 m in from the street face to the front edge of the
 * upstairs hall, two modules short of the back wall. Twelve risers of 0.225 over 0.152 goings:
 * the steepest a Japanese house stair is allowed to be, and Nobita's famously is. The twelfth
 * tread is the upper floor.
 */
export const STAIRS = {
  x0: 8 * H + WALL_INTERIOR / 2,
  x1: 10 * H - WALL_EXTERIOR / 2,
  foot: -10 * H,
  head: -14 * H,
  risers: 12,
  fromY: LEVEL.floor,
  toY: LEVEL.upper,
} as const;

/**
 * The knee wall on the flight's hallway side, its top on the pitch under a wooden cap, the way
 * ground-1.jpg shows it from the hall; it carries the upper floor's hall-side wall, so it is as
 * thick as that wall and stands under it. It is not a `Wall`: it has no openings and no ends to
 * join, and it rises with the stair.
 */
export const STAIR_WALL = { x0: STAIRS.x1, x1: STAIRS.x1 + WALL_EXTERIOR, rail: 0.85 } as const;

// --- outside the walls -----------------------------------------------------------------------

export const EXTERIOR = {
  /** The concrete landing outside the front door, a step below the genkan. */
  porch: { rect: { x0: 3.95, x1: 5.55, z0: WALL_EXTERIOR / 2, z1: 1.0 }, top: 0.07 },
  /** Paving from the porch toward the gate. */
  path: { rect: { x0: 4.2, x1: 5.1, z0: 1.0, z1: 3.0 }, top: 0.025 },
  /** The wooden step (縁台) under the 居間's glass doors, halfway down to the garden. */
  engawa: { rect: { x0: -0.85, x1: -0.1, z0: -6.3, z1: -4.5 }, top: 0.24 },
  /** A concrete block under the kitchen's glass door. */
  kitchenStep: {
    rect: { x0: 2 * H - WALL_EXTERIOR / 2 - 0.6, x1: 2 * H - WALL_EXTERIOR / 2, z0: -9.35, z1: -7.85 },
    top: 0.2,
  },
  /** The step outside the 勝手口. */
  backStep: {
    rect: { x0: 14 * H + WALL_EXTERIOR / 2, x1: 14 * H + WALL_EXTERIOR / 2 + 0.6, z0: -10.35, z1: -9.45 },
    top: 0.07,
  },
} as const;

// --- roofs -----------------------------------------------------------------------------------

/**
 * The roofs, after `assets/home.jpg`: the upper storey under a 5-sun gable facing the street,
 * and the single-storey parts round it under 4-sun roofs — the 洋室 and genkan under a second
 * street-facing gable whose ridge dies into the upper storey's front wall just under Nobita's
 * window, the kitchen under a matching gable at the back, and the hall's front and the wet
 * rooms under a lean-to (下屋) climbing to the upper storey's side. Red-brown tiles, cream
 * barge boards and fascias, a vent in every gable.
 *
 * A roof is a set of planes over rectangles of attic. Each plane passes through the wall plate
 * (`plate`) at the outer face of the wall under its eave — not the wall's centre line, or the
 * outer half of the wall top would stand through the tiles — and climbs `pitch` per metre
 * inward; the attic under it closes the rooms below with a flat ceiling at the plate.
 * Everything else — overhangs, barge boards, gutters, tiles, ridge — is derived.
 */
export type RoofId = 'front' | 'east' | 'kitchen' | 'upper';

export interface RoofRect extends Rect {
  /**
   * The rectangle's two ends along the roof's axis, [start, end] in increasing coordinate: the
   * overhang of an open end (a gable face or rake over an outside wall), or null where the end
   * butts a wall or another roof.
   */
  rake: [number | null, number | null];
}

export interface Roof {
  id: RoofId;
  /** The axis the ridge — or a lean-to's high side — runs along. */
  axis: 'x' | 'z';
  /** Height of the wall plate: every plane passes through it on its eave line. */
  plate: number;
  /** Rise per metre of run: 0.4 is the Japanese 4 sun (21.8°), 0.5 is 5 sun. */
  pitch: number;
  /**
   * A gable has an eave line on each side and its ridge midway; a lean-to has one eave line
   * and climbs from it toward `rises` (the sign of the across coordinate).
   */
  shape: { kind: 'gable'; eaves: [number, number] } | { kind: 'shed'; eave: number; rises: 1 | -1 };
  /** How far the eaves overhang their eave lines. */
  eave: number;
  rects: RoofRect[];
}

/** Rafters and sheathing under the tiles, and the tiles on them, measured vertically. */
export const ROOF_BUILD = { depth: 0.15, cover: 0.05 } as const;

const R4 = 0.4;

export const ROOFS: Roof[] = [
  {
    id: 'front',
    axis: 'z',
    plate: LEVEL.top,
    pitch: R4,
    shape: { kind: 'gable', eaves: [0, 12 * H] },
    eave: 0.45,
    rects: [{ x0: 0, x1: 12 * H, z0: -6 * H, z1: 0, rake: [null, 0.35] }],
  },
  {
    // Over the hall beside the upper storey and over the wet rooms, climbing west to the upper
    // storey's walls: to its hall-side wall over the notch the stair leaves in front of the
    // stairwell, then to the stairwell's own wall. Its street end stands over the front roof
    // beside the hall and, beside that, over the wet rooms' own street wall, half a module back;
    // the rakes line up.
    id: 'east',
    axis: 'z',
    plate: LEVEL.top,
    pitch: R4,
    shape: { kind: 'shed', eave: 16 * H, rises: -1 },
    eave: 0.45,
    rects: [
      { x0: 8 * H, x1: 12 * H, z0: -10 * H, z1: -6 * H, rake: [null, 0.3] },
      { x0: 12 * H, x1: 16 * H, z0: -10 * H, z1: -6.5 * H, rake: [null, 0.3 + 0.5 * H] },
      { x0: 10 * H, x1: 16 * H, z0: -16 * H, z1: -10 * H, rake: [0.1, null] },
    ],
  },
  {
    id: 'kitchen',
    axis: 'z',
    plate: LEVEL.top,
    pitch: R4,
    shape: { kind: 'gable', eaves: [2 * H, 14 * H] },
    eave: 0.45,
    rects: [{ x0: 2 * H, x1: 14 * H, z0: -23 * H, z1: -16 * H, rake: [0.35, null] }],
  },
  {
    id: 'upper',
    axis: 'z',
    plate: LEVEL.upperTop,
    pitch: 0.5,
    shape: { kind: 'gable', eaves: [0, 10 * H] },
    eave: 0.5,
    rects: [{ x0: 0, x1: 10 * H, z0: -16 * H, z1: -6 * H, rake: [0.35, 0.35] }],
  },
];

/** The coordinate across a roof's axis, which its planes climb along. */
export const acrossOf = (roof: Roof, x: number, z: number) => (roof.axis === 'z' ? x : z);
/** The coordinate along a roof's axis. */
export const alongOf = (roof: Roof, x: number, z: number) => (roof.axis === 'z' ? z : x);

/** Height of the rafter-top plane at across-coordinate `p`, carried on past the eave lines. */
export function roofPlaneAt(roof: Roof, p: number): number {
  const { shape, plate, pitch } = roof;
  const t = WALL_EXTERIOR / 2;
  if (shape.kind === 'gable')
    return plate + pitch * Math.min(p - (shape.eaves[0] - t), shape.eaves[1] + t - p);
  return plate + pitch * shape.rises * (p - (shape.eave - shape.rises * t));
}

/** Whether a rectangle's low (`lo`) or high across edge lies on one of its roof's eave lines. */
export function isEave(roof: Roof, r: RoofRect, side: 'lo' | 'hi') {
  const p = roof.axis === 'z' ? (side === 'lo' ? r.x0 : r.x1) : side === 'lo' ? r.z0 : r.z1;
  const eaves = roof.shape.kind === 'gable' ? roof.shape.eaves : [roof.shape.eave];
  return eaves.some((e) => Math.abs(e - p) < 1e-9);
}

/** A rectangle's [lo, hi] ranges across and along its roof's axis. */
export function rectRanges(roof: Roof, r: Rect) {
  const x: [number, number] = [r.x0, r.x1];
  const z: [number, number] = [r.z0, r.z1];
  return roof.axis === 'z' ? { across: x, along: z } : { across: z, along: x };
}

/** The attic block: along the axis it runs out to the outer face of the wall under an open end. */
export function massAlong(r: RoofRect, along: [number, number]): [number, number] {
  return [
    along[0] - (r.rake[0] === null ? 0 : WALL_EXTERIOR / 2),
    along[1] + (r.rake[1] === null ? 0 : WALL_EXTERIOR / 2),
  ];
}

/** Everything a rectangle's tiles cover: out over its eaves and past its open ends. */
export function coverRanges(roof: Roof, r: RoofRect) {
  const { across, along } = rectRanges(roof, r);
  const mass = massAlong(r, along);
  return {
    across: [
      across[0] - (isEave(roof, r, 'lo') ? roof.eave : 0),
      across[1] + (isEave(roof, r, 'hi') ? roof.eave : 0),
    ] as [number, number],
    along: [mass[0] - (r.rake[0] ?? 0), mass[1] + (r.rake[1] ?? 0)] as [number, number],
  };
}

/** Top of the tiles at (x, z) — of the highest roof there other than `except` — or undefined. */
export function roofTopAt(x: number, z: number, except?: RoofId): number | undefined {
  let top: number | undefined;
  for (const roof of ROOFS) {
    if (roof.id === except) continue;
    const p = acrossOf(roof, x, z);
    const a = alongOf(roof, x, z);
    for (const r of roof.rects) {
      const { across, along } = coverRanges(roof, r);
      if (p < across[0] || p > across[1] || a < along[0] || a > along[1]) continue;
      const y = roofPlaneAt(roof, p) + ROOF_BUILD.cover;
      if (top === undefined || y > top) top = y;
    }
  }
  return top;
}

// --- on the outside walls --------------------------------------------------------------------

/** A small pent roof (庇) over an opening, on a wall's outside face; `y` is its underside there. */
export interface Hood {
  id: string;
  wall: string;
  from: number;
  to: number;
  y: number;
  depth: number;
}

/** The hoods of home.jpg over the 洋室 window, the front door and Nobita's window; one over the 居間's garden doors. */
export const HOODS: Hood[] = [
  { id: 'hood-yoshitsu', wall: 'front', from: 0.05, to: 3.35, y: LEVEL.head + 0.1, depth: 0.45 },
  { id: 'canopy-front', wall: 'front', from: 3.98, to: 5.5, y: 2.56, depth: 0.9 },
  { id: 'hood-living', wall: 'west', from: -7.2, to: -4.45, y: LEVEL.head + 0.12, depth: 0.6 },
  { id: 'hood-nobita', wall: 'up-front', from: 0.6, to: 3.15, y: U + 2.04, depth: 0.45 },
];

/** A louvred box (戸袋) the storm shutters slide into, on a wall's outside face beside a window. */
export interface ShutterBox {
  id: string;
  wall: string;
  from: number;
  to: number;
  y0: number;
  y1: number;
}

export const SHUTTER_BOXES: ShutterBox[] = [
  { id: 'tobukuro-living', wall: 'west', from: -7.15, to: -6.3, y0: 0.35, y1: LEVEL.head + 0.1 },
  { id: 'tobukuro-yoshitsu', wall: 'front', from: 0.12, to: 0.98, y0: SILL - 0.05, y1: LEVEL.head + 0.05 },
  { id: 'tobukuro-nobita', wall: 'up-front', from: 0.65, to: 1.5, y0: U + 1.1, y1: U + 2.0 },
];

/**
 * Downpipes: from the gutter on a roof's `side` eave at `at` along its axis, back to the wall
 * and down it to the ground, or to the roof below where one lies under the pipe.
 */
export interface Downpipe {
  roof: RoofId;
  side: 'lo' | 'hi';
  at: number;
}

export const DOWNPIPES: Downpipe[] = [
  { roof: 'upper', side: 'lo', at: -2.95 },
  { roof: 'upper', side: 'hi', at: -7.0 },
  { roof: 'front', side: 'lo', at: -0.3 },
  { roof: 'front', side: 'hi', at: -0.3 },
  { roof: 'east', side: 'hi', at: -3.2 },
  { roof: 'kitchen', side: 'lo', at: -10.2 },
  { roof: 'kitchen', side: 'hi', at: -7.6 },
];

// --- furniture -------------------------------------------------------------------------------

const item = (
  id: string,
  kind: FurnitureKind,
  room: RoomId,
  x: number,
  z: number,
  facing: Facing,
  w: number,
  d: number,
  h: number,
  extra?: Partial<Furniture>,
): Furniture => ({ id, kind, room, x, z, facing, w, d, h, ...extra });

export const FURNITURE: Furniture[] = [
  // 洋室: two armchairs under the front window, the table, the sofa facing them. A two-seat
  // sofa and compact chairs, as a 6-mat Showa reception room holds: a knee's width (~35 cm)
  // either side of the table, and a metre of floor from the door past the sofa's end.
  item('rug-yoshitsu', 'rug', 'yoshitsu', 1.8, -1.4, 'S', 2.0, 1.6, 0.012, { floorCover: true }),
  item('armchair-1', 'armchair', 'yoshitsu', 1.44, -0.49, 'N', 0.66, 0.62, 0.74),
  item('armchair-2', 'armchair', 'yoshitsu', 2.16, -0.49, 'N', 0.66, 0.62, 0.74),
  item('coffee-table', 'coffeeTable', 'yoshitsu', 1.8, -1.39, 'S', 0.9, 0.5, 0.4),
  item('sofa', 'sofa', 'yoshitsu', 1.8, -2.3, 'S', 1.25, 0.64, 0.74),
  item('plant-yoshitsu', 'plant', 'yoshitsu', 0.45, -0.45, 'S', 0.45, 0.45, 1.1),
  item('bookcase', 'bookcase', 'yoshitsu', 3.43, -0.95, 'W', 0.9, 0.3, 1.2),

  // 居間: the kotatsu on the mats, the TV across the front-left corner, chests by the hall wall.
  item('low-cabinet', 'lowCabinet', 'living', 2.15, -2.97, 'S', 0.9, 0.35, 0.55),
  item('tv-stand', 'tvStand', 'living', 0.75, -3.3, 'E', 0.8, 0.45, 0.4, { turn: 45 }),
  item('tv', 'crtTv', 'living', 0.75, -3.3, 'E', 0.62, 0.45, 0.5, { turn: 45, on: 'tv-stand' }),
  item('kotatsu', 'kotatsu', 'living', 1.95, -4.5, 'S', 0.8, 1.2, 0.4),
  item('cushion-n', 'floorCushion', 'living', 1.95, -3.52, 'S', 0.55, 0.58, 0.12),
  item('cushion-s', 'floorCushion', 'living', 1.95, -5.48, 'N', 0.55, 0.58, 0.12),
  item('cushion-w', 'floorCushion', 'living', 1.2, -4.5, 'E', 0.55, 0.58, 0.12),
  item('cushion-e', 'floorCushion', 'living', 2.7, -4.5, 'W', 0.55, 0.58, 0.12),
  item('tansu-1', 'tansu', 'living', 3.38, -4.85, 'W', 0.65, 0.4, 0.95),
  item('tansu-2', 'tansu', 'living', 3.38, -5.5, 'W', 0.6, 0.4, 0.95),

  // 鏡台 nook: the dresser, a chest beside it, a cushion to kneel on.
  item('kyodai', 'kyodai', 'nook', 1.45, -7.0, 'S', 0.55, 0.38, 1.3),
  item('chest-nook', 'tansu', 'nook', 0.62, -6.98, 'S', 0.8, 0.42, 0.75),
  item('cushion-kyodai', 'floorCushion', 'nook', 1.45, -6.585, 'N', 0.45, 0.42, 0.1),

  // 押入れ: the middle shelf the parents' futons are folded onto.
  item('oshiire-shelf', 'oshiireShelf', 'oshiire', 2.73, -6.8175, 'S', 1.68, 0.77, 0.8),

  // Genkan, after ground-1.jpg: the shoe cabinet with its flowers, the umbrella stand by the
  // sidelight, the mat just past the step.
  item('getabako', 'getabako', 'genkan', 3.915, -1.075, 'E', 0.95, 0.43, 0.9),
  item('flowers-getabako', 'flowers', 'genkan', 3.915, -1.2, 'S', 0.3, 0.3, 0.3, { on: 'getabako' }),
  item('umbrella-stand', 'umbrellaStand', 'genkan', 5.2, -0.45, 'S', 0.24, 0.24, 0.5),
  item('doormat', 'mat', 'hallway', 4.55, -1.95, 'S', 0.95, 0.55, 0.012, { floorCover: true }),

  // Hallway: the telephone on its stand between the genkan and the toilet door.
  item('phone-stand', 'phoneStand', 'hallway', 5.215, -2.75, 'W', 0.6, 0.34, 0.72),
  item('phone', 'phone', 'hallway', 5.215, -2.75, 'W', 0.22, 0.2, 0.1, { on: 'phone-stand' }),

  // Wet rooms, each fitted against the outside wall, facing its door.
  item('toilet', 'toilet', 'toilet', 6.85, -3.42, 'W', 0.42, 0.7, 0.8),
  item('vanity', 'vanity', 'washroom', 6.955, -4.3, 'W', 0.7, 0.5, 0.85),
  item('washing-machine', 'washingMachine', 'washroom', 6.905, -5.03, 'W', 0.6, 0.6, 0.9),
  item('bathtub', 'bathtub', 'bath', 6.45, -6.82, 'S', 1.3, 0.75, 0.55),
  item('bath-stool', 'bathStool', 'bath', 6.75, -6.1, 'W', 0.3, 0.3, 0.25),

  // Kitchen & dining: the table for four in the middle, the counter along the back wall with
  // the gas table at the garden end, the fridge beside the 勝手口, dishes on the right wall.
  item('sideboard-kitchen', 'sideboard', 'kitchen', 1.66, -7.53, 'S', 1.2, 0.35, 0.85),
  item('trash-bin', 'trashBin', 'kitchen', 2.5, -7.55, 'S', 0.28, 0.28, 0.45),
  item('chair-1', 'chair', 'kitchen', 3.1, -7.655, 'N', 0.45, 0.45, 0.85),
  item('chair-2', 'chair', 'kitchen', 3.8, -7.655, 'N', 0.45, 0.45, 0.85),
  item('dining-table', 'diningTable', 'kitchen', 3.45, -8.35, 'S', 1.45, 0.8, 0.72),
  item('chair-3', 'chair', 'kitchen', 3.1, -9.045, 'S', 0.45, 0.45, 0.85),
  item('chair-4', 'chair', 'kitchen', 3.8, -9.045, 'S', 0.45, 0.45, 0.85),
  item('counter', 'counterRun', 'kitchen', 2.65, -10.065, 'S', 2.8, 0.65, 0.85),
  item('fridge', 'fridge', 'kitchen', 4.475, -10.055, 'S', 0.65, 0.67, 1.75),
  item('dish-cabinet', 'dishCabinet', 'kitchen', 6.095, -8.05, 'W', 0.9, 0.4, 1.8),
  item('rice-bin', 'riceBin', 'kitchen', 6.12, -8.72, 'W', 0.44, 0.35, 0.75),

  // Nobita's room, after the sheet: the desk (机) under the street window with the chair in
  // front of it, the bookcase (本棚) against the stairwell wall, a chest in the corner by the
  // desk, a cushion on the mats.
  item('desk', 'studyDesk', 'nobita', 2.13, -3.08, 'N', 1.0, 0.55, 0.72),
  item('desk-chair', 'chair', 'nobita', 2.13, -3.62, 'S', 0.42, 0.42, 0.85),
  item('waste-bin', 'trashBin', 'nobita', 2.85, -2.98, 'S', 0.26, 0.26, 0.32),
  item('chest-nobita', 'tansu', 'nobita', 3.39, -3.25, 'W', 0.7, 0.35, 0.85),
  item('bookcase-nobita', 'bookcase', 'nobita', 3.415, -5.35, 'W', 1.2, 0.3, 1.1),
  item('cushion-nobita', 'floorCushion', 'nobita', 1.75, -5.3, 'S', 0.55, 0.58, 0.12),

  // Doraemon's 押し入れ: he sleeps on its middle shelf.
  item('dora-bed', 'doraBed', 'doraOshiire', 0.4625, -4.1025, 'E', 2.595, 0.775, 0.78),

  // The storeroom behind it, off the upstairs hall.
  item('storeroom-boxes', 'storageBoxes', 'storeroom', 0.4625, -5.915, 'E', 0.75, 0.7, 1.1),
];

// --- derived ---------------------------------------------------------------------------------

export const roomById = (id: RoomId) => {
  const room = ROOMS.find((r) => r.id === id);
  if (!room) throw new Error(`no room "${id}"`);
  return room;
};

export function roomAt(x: number, z: number, storey: StoreyId): Room | undefined {
  return ROOMS.find(
    (room) => room.storey === storey && room.rects.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1),
  );
}

/** The wall of `storey` that covers point (x, z) on the ground plane, if any. */
export function wallAt(x: number, z: number, storey: StoreyId): Wall | undefined {
  return WALLS.find((wall) => {
    if (wall.storey !== storey) return false;
    const along = wall.axis === 'x' ? x : z;
    const across = wall.axis === 'x' ? z : x;
    return Math.abs(across - wall.at) <= wall.thickness / 2 + 1e-9 && along >= wall.from && along <= wall.to;
  });
}

/** The room a wall face looks into, found a few centimetres off the face, on the wall's storey. */
export function roomBeside(wall: Wall, along: number, side: 1 | -1): Room | undefined {
  const across = wall.at + side * (wall.thickness / 2 + 0.05);
  return wall.axis === 'x' ? roomAt(along, across, wall.storey) : roomAt(across, along, wall.storey);
}

/** The side of `wall` at `along` that looks into `room`, or that has no room for `'outside'`. */
export function sideToward(wall: Wall, along: number, room: RoomId | 'outside'): 1 | -1 | undefined {
  return ([1, -1] as const).find((side) => {
    const beside = roomBeside(wall, along, side);
    return room === 'outside' ? !beside : beside?.id === room;
  });
}

/** A rectangle shrunk to its finished faces: each edge moves in by half the wall standing on it. */
export function interiorOf(r: Rect, storey: StoreyId): Rect {
  const half = (x: number, z: number) => (wallAt(x, z, storey)?.thickness ?? 0) / 2;
  const mx = (r.x0 + r.x1) / 2;
  const mz = (r.z0 + r.z1) / 2;
  return {
    x0: r.x0 + half(r.x0, mz),
    x1: r.x1 - half(r.x1, mz),
    z0: r.z0 + half(mx, r.z0),
    z1: r.z1 - half(mx, r.z1),
  };
}

/** Quarter turns about Y that take a local front (+z) to `facing`. */
export const QUARTER_TURNS: Record<Facing, number> = { S: 0, E: 1, N: 2, W: 3 };

/** Radians about Y an item is turned by: its facing plus any extra `turn`. */
export const yawOf = (item: Furniture) =>
  ((QUARTER_TURNS[item.facing] * 90 + (item.turn ?? 0)) * Math.PI) / 180;

/** World footprint of an item, as the axis-aligned box round its turned w × d rectangle. */
export function footprintOf(item: Furniture): Rect {
  const yaw = yawOf(item);
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  const hx = (c * item.w + s * item.d) / 2;
  const hz = (s * item.w + c * item.d) / 2;
  return { x0: item.x - hx, x1: item.x + hx, z0: item.z - hz, z1: item.z + hz };
}

/** World height an item stands on: its host's top, or its room's floor. */
export function baseOf(item: Furniture): number {
  if (!item.on) return roomById(item.room).floorY;
  const host = FURNITURE.find((f) => f.id === item.on);
  if (!host) throw new Error(`${item.id} stands on missing "${item.on}"`);
  return baseOf(host) + host.h;
}

/** Everything the house covers on the ground, eaves included, for framing a camera over it. */
export const FOOTPRINT: Rect = (() => {
  const r: Rect = { x0: EXTERIOR.engawa.rect.x0, x1: 0, z0: 0, z1: EXTERIOR.porch.rect.z1 };
  for (const roof of ROOFS) {
    for (const rect of roof.rects) {
      const { across, along } = coverRanges(roof, rect);
      const [xs, zs] = roof.axis === 'z' ? [across, along] : [along, across];
      r.x0 = Math.min(r.x0, xs[0]);
      r.x1 = Math.max(r.x1, xs[1]);
      r.z0 = Math.min(r.z0, zs[0]);
      r.z1 = Math.max(r.z1, zs[1]);
    }
  }
  return r;
})();
