import {
  baseOf,
  FURNITURE,
  footprintOf,
  interiorOf,
  type Rect,
  ROOMS,
  type Room,
  type RoomId,
  roomAt,
  roomBeside,
  roomById,
  STAIR_WALL,
  STAIRS,
  type StoreyId,
  WALLS,
  wallAt,
} from './house/plan';

/** Eye height over the floor: a person standing, a little low, so table tops and beds read. */
export const EYE_HEIGHT = 1.4;
/** How far in from each wall of its corner the eye stands: clear of the skirting and the jamb. */
const INSET = 0.3;
/** The eye looks this far down per metre ahead, about 11°, as a room is photographed. */
const TILT = 0.2;
/** How far along an edge from the corner a wall is looked for: past any post, short of a doorway. */
const PROBE = 0.2;
/** An item whose top comes within this of the eye, or rises past it, stands in the way. */
const HEAD_ROOM = 0.25;
/** Clearance kept between the eye and the side of anything it stands beside. */
const ELBOW = 0.15;
/** Two corners nearer than this show the same room the same way. */
const APART = 0.6;
/** How far ahead the view must be clear: a cupboard or the stair's back filling the frame is no view. */
export const SIGHT = 1;
/** How far out of a furnished corner the eye may step, along either wall or across, to find clear floor. */
const STEP_OUT = 1;
/**
 * How far, on average across the middle of its frame, a corner view must see: this share of
 * the room's diagonal, but no more than 2 m. A view that sees less shows a wall, not a room.
 */
const DEEP_SHARE = 0.6;
const DEEP_MAX = 2;
/**
 * What the eye stands over must stay this far below it. Looking 11° down through a 62° lens,
 * the frame's lower edge meets a point 0.6 m under the eye 0.65 m ahead: a chest or the tub
 * rim under the eye is out of shot, a pot plant's leaves fill it.
 */
const UNDERFOOT = 0.6;
/** How far a sight line is followed: past the longest run of floor in the house. */
const FAR = 7;
/**
 * Half the wedge a view direction is judged over, in degrees. A frame is 90° across, so the
 * aim goes where the most floor lies either side of it, not down the one slit that runs
 * furthest.
 */
const SPREAD = 15;
/**
 * How far behind the wall face on its own side the eye stands to look through a doorway: the
 * jambs fall just outside a 90° frame, so the frame is all room.
 */
const DOORWAY_BACK = 0.15;

export interface RoomView {
  room: RoomId;
  /** "Doorway", or which corner as seen from the street: "Back left", "Front right". */
  label: string;
  eye: [number, number, number];
  /** A point a metre ahead of the eye, along the view. */
  aim: [number, number, number];
  /** The door the view looks in through, opened when the view is chosen. */
  door?: string;
}

const inside = (r: Rect, x: number, z: number, margin: number) =>
  x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin;

/** Everything that stands on a floor, with its footprint and top worked out once. Rugs lie flat. */
const STANDING = FURNITURE.filter((item) => !item.floorCover).map((item) => ({
  storey: roomById(item.room).storey,
  rect: footprintOf(item),
  top: baseOf(item) + item.h,
}));
const FLIGHT: Rect = { x0: STAIRS.x0, x1: STAIR_WALL.x1, z0: STAIRS.head, z1: STAIRS.foot };

/**
 * Top of the tallest thing standing at (x, z) on a storey, within `margin` — furniture, the
 * stair and its knee wall — or −∞.
 */
function obstacleAt(storey: StoreyId, x: number, z: number, margin: number): number {
  let top = Number.NEGATIVE_INFINITY;
  if (storey === 'ground' && inside(FLIGHT, x, z, margin)) {
    const up = Math.min(1, Math.max(0, (STAIRS.foot - z) / (STAIRS.foot - STAIRS.head)));
    top = STAIRS.fromY + up * (STAIRS.toY - STAIRS.fromY) + STAIR_WALL.rail;
  }
  for (const item of STANDING) {
    if (item.storey === storey && inside(item.rect, x, z, margin)) top = Math.max(top, item.top);
  }
  return top;
}

/** Whether an eye at height `y` can stand at (x, z): what it stands over stays out of shot below it. */
const footing = (storey: StoreyId, x: number, y: number, z: number) =>
  obstacleAt(storey, x, z, ELBOW) <= y - UNDERFOOT + 1e-9;

/**
 * How far the eye sees along (dx, dz) before a wall, anything rising near eye height, or the
 * edge of the house stops it. Rooms open into each other — the genkan into the hall, the
 * living room into the dresser nook — so a sight line runs on through them.
 */
function sightAlong(storey: StoreyId, x: number, y: number, z: number, dx: number, dz: number): number {
  for (let d = 0.05; d < FAR; d += 0.05) {
    const px = x + dx * d;
    const pz = z + dz * d;
    if (wallAt(px, pz, storey) || !roomAt(px, pz, storey) || obstacleAt(storey, px, pz, 0) > y - HEAD_ROOM)
      return d;
  }
  return FAR;
}

/**
 * The direction to look from (x, z), among those away from the walls behind the eye — `sx`
 * and `sz` are +1 or −1 for a wall on the low or high side, 0 for none — that sees the most
 * floor across a frame's middle; how far it sees straight ahead, and on average across that
 * middle.
 */
function bestAim(storey: StoreyId, x: number, y: number, z: number, sx: number, sz: number) {
  const step = 5;
  const reach = new Map<number, number>();
  for (let a = 0; a < 360; a += step) {
    const dx = Math.cos((a * Math.PI) / 180);
    const dz = Math.sin((a * Math.PI) / 180);
    if (sx * dx < -1e-9 || sz * dz < -1e-9) continue;
    reach.set(a, sightAlong(storey, x, y, z, dx, dz));
  }
  // The middle of the allowed fan: ties go to it rather than to either wall.
  const mid = (Math.atan2(sz, sx) * 180) / Math.PI;
  let best: { a: number; score: number; sum: number } | undefined;
  for (const a of reach.keys()) {
    let sum = 0;
    let whole = true;
    for (let w = -SPREAD; w <= SPREAD; w += step) {
      const d = reach.get((a + w + 360) % 360);
      if (d === undefined) whole = false;
      else sum += d;
    }
    if (!whole) continue;
    const off = Math.abs(((a - mid + 540) % 360) - 180);
    const score = sum - off * 1e-3;
    if (!best || score > best.score) best = { a, score, sum };
  }
  if (!best) return undefined;
  const dx = Math.cos((best.a * Math.PI) / 180);
  const dz = Math.sin((best.a * Math.PI) / 180);
  const across = (2 * SPREAD) / step + 1;
  return { dx, dz, ahead: reach.get(best.a) ?? 0, deep: best.sum / across };
}

/**
 * A view from each corner of a room that has a wall on both sides, aimed across the wedge of
 * room that runs furthest from it: the corners of an L-shaped room where it opens into its
 * other half, and those that open into the next room, have no corner to stand in. Where a
 * cupboard or the stair stands in the corner, the eye steps out — along either wall or
 * across the room, whichever finds clear floor with a clear metre ahead soonest — as a
 * photographer backs out of the way. A spot that sees too little of the room — the back of
 * the stair, a glass door at arm's length — is no view, and a corner with no other spot is
 * skipped. In a room too narrow for two corners to differ, like the toilet, the pair at each
 * end is one view.
 */
function cornerViews(room: Room): RoomView[] {
  const y = room.floorY + EYE_HEIGHT;
  const { x0, x1, z0, z1 } = room.rects
    .map((r) => interiorOf(r, room.storey))
    .reduce((a, b) => ({
      x0: Math.min(a.x0, b.x0),
      x1: Math.max(a.x1, b.x1),
      z0: Math.min(a.z0, b.z0),
      z1: Math.max(a.z1, b.z1),
    }));
  const deepEnough = Math.min(DEEP_MAX, DEEP_SHARE * Math.hypot(x1 - x0, z1 - z0));
  /** The first spot on a path out of a corner the eye can stand at and see from. */
  const standAt = (x: number, z: number, sx: 1 | -1, sz: 1 | -1): [number, number] | undefined => {
    const paths = [
      [sx, 0],
      [0, sz],
      [sx * Math.SQRT1_2, sz * Math.SQRT1_2],
    ] as const;
    for (let t = 0; t <= STEP_OUT + 1e-9; t += 0.1) {
      for (const [px, pz] of paths) {
        const cx = x + px * t;
        const cz = z + pz * t;
        if (roomAt(cx, cz, room.storey)?.id !== room.id || !footing(room.storey, cx, y, cz)) continue;
        const aim = bestAim(room.storey, cx, y, cz, sx, sz);
        if (aim && aim.ahead >= SIGHT && aim.deep >= deepEnough) return [cx, cz];
        if (t === 0) break;
      }
    }
    return undefined;
  };

  /** Where the eye stands and which walls it has behind it: −x/+x as 1/−1, −z/+z likewise. */
  const spots: { x: number; z: number; sx: 1 | -1 | 0; sz: 1 | -1 | 0 }[] = [];
  for (const r of room.rects) {
    const i = interiorOf(r, room.storey);
    for (const [ex, sx] of [
      [r.x0, 1],
      [r.x1, -1],
    ] as const) {
      for (const [ez, sz] of [
        [r.z0, 1],
        [r.z1, -1],
      ] as const) {
        const walled = wallAt(ex, ez + sz * PROBE, room.storey) && wallAt(ex + sx * PROBE, ez, room.storey);
        if (!walled) continue;
        const spot = standAt(
          (sx === 1 ? i.x0 : i.x1) + sx * INSET,
          (sz === 1 ? i.z0 : i.z1) + sz * INSET,
          sx,
          sz,
        );
        if (!spot) continue;
        const [x, z] = spot;
        // Only a corner pairs up, never a pair: four corners of a closet-sized room make two
        // views across it, not one in the middle of it with nowhere to look.
        const twin = spots.find((s) => s.sx !== 0 && s.sz !== 0 && Math.hypot(s.x - x, s.z - z) < APART);
        if (!twin) {
          spots.push({ x, z, sx, sz });
          continue;
        }
        // Stand between the two, against the wall they share.
        twin.x = (twin.x + x) / 2;
        twin.z = (twin.z + z) / 2;
        if (twin.sx !== sx) twin.sx = 0;
        if (twin.sz !== sz) twin.sz = 0;
      }
    }
  }

  const views = spots.flatMap(({ x, z, sx, sz }): RoomView[] => {
    const aim = bestAim(room.storey, x, y, z, sx, sz);
    if (!aim) return [];
    // The street is at +z and left is −x, as the house is seen from it.
    const words = [
      sz === 1 ? 'back' : sz === -1 ? 'front' : '',
      sx === 1 ? 'left' : sx === -1 ? 'right' : '',
    ];
    const label = words.filter(Boolean).join(' ');
    return [
      {
        room: room.id,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        eye: [x, y, z],
        aim: [x + aim.dx, y - TILT, z + aim.dz],
      },
    ];
  });
  // An L-shaped room can have two corners on the same side; number them in plan order.
  const counts = new Map<string, number>();
  for (const view of views) counts.set(view.label, (counts.get(view.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  for (const view of views) {
    if ((counts.get(view.label) ?? 0) < 2) continue;
    const n = (seen.get(view.label) ?? 0) + 1;
    seen.set(view.label, n);
    view.label = `${view.label} ${n}`;
  }
  return views;
}

/**
 * The toilet, washroom and bath are too small to show from inside — from a corner the far
 * wall is a metre off — and a closet or the storeroom is never stood in: each is shown as it
 * is seen from the way in, through its opened door. The way in is the door from a dry room
 * where there is one — the washroom from the hall, not from the bath — and the eye stands
 * just back from the opening, looking straight in; for a pair of fusuma, through the half the
 * front leaf opens. A hinged leaf that swings out toward the eye would stand where it does,
 * so that door is no way in to show.
 */
function doorwayView(room: Room): RoomView | undefined {
  if (room.floor !== 'bath' && !room.storage) return undefined;
  const ways = WALLS.filter((wall) => wall.storey === room.storey).flatMap((wall) =>
    wall.openings.flatMap((o) => {
      if (o.kind !== 'door') return [];
      const mid = (o.from + o.to) / 2;
      const side = ([1, -1] as const).find((s) => roomBeside(wall, mid, s)?.id === room.id);
      if (side === undefined) return [];
      const from = roomBeside(wall, mid, side === 1 ? -1 : 1);
      if (!from || from.storage || from.floor === 'void') return [];
      if (o.leaf === 'hinged' && o.swing !== room.id) return [];
      const along = o.leaf === 'pair' ? (3 * o.from + o.to) / 4 : mid;
      const across = wall.at - side * (wall.thickness / 2 + DOORWAY_BACK);
      const [x, z] = wall.axis === 'x' ? [along, across] : [across, along];
      const y = from.floorY + EYE_HEIGHT;
      if (!footing(room.storey, x, y, z)) return [];
      const [dx, dz] = wall.axis === 'x' ? [0, side] : [side, 0];
      const view: RoomView = {
        room: room.id,
        label: 'Doorway',
        eye: [x, y, z],
        aim: [x + dx, y - TILT, z + dz],
        door: o.id,
      };
      return [{ dry: from.floor !== 'bath', view }];
    }),
  );
  return (ways.find((way) => way.dry) ?? ways[0])?.view;
}

/**
 * Every view of a room: from its doorway first where it has one — for the rooms that need it,
 * that is the picture — then from its corners. The stairwell's void has neither.
 */
export function roomViews(room: Room): RoomView[] {
  if (room.floor === 'void') return [];
  const doorway = doorwayView(room);
  return [...(doorway ? [doorway] : []), ...(room.storage ? [] : cornerViews(room))];
}

/** Every room there is a view of, in plan order, with its views. */
export const ROOM_VIEWS: { room: Room; views: RoomView[] }[] = ROOMS.map((room) => ({
  room,
  views: roomViews(room),
})).filter((entry) => entry.views.length > 0);
