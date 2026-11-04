/**
 * The rooms of Nobita's house as the diorama uses them: named, placed on the lot, with the
 * places a visitor can stand in each and the window the street sees it through.
 *
 * Nothing here is authored. The rooms, their walls and windows are `src/editor/house/plan.ts`
 * and the places to stand are `src/editor/room-views.ts` — the same data `/editor` builds and
 * shows — moved onto the lot by `house-site.ts`. Change the plan and the diorama follows.
 */
import { interiorOf, type RoomId, roomBeside, STOREYS, type StoreyId, WALLS } from '../editor/house/plan';
import { ROOM_VIEWS, type RoomView } from '../editor/room-views';
import type { Localized } from '../i18n/locale';
import { rectToWorld, toWorld } from './house-site';
import type { Rect } from './scene';

/** A window in an outside wall of a room, in world metres. */
export interface RoomWindow {
  /** Centre of the opening, on the wall's outer face — a walkout's sits just inside its sashes. */
  centre: [number, number, number];
  width: number;
  height: number;
  /** Unit direction out of the house through it, on the ground plane. */
  outward: [number, number];
}

export interface HouseRoom {
  id: RoomId;
  name: Localized;
  /** Toolbar label: the full name does not fit a control beside the other places. */
  shortName: Localized;
  kana: string;
  storey: StoreyId;
  /** Bounding box of its finished floor. */
  bounds: Rect;
  floorY: number;
  ceilingY: number;
  /** Where a visitor can stand, from `room-views.ts`; the first is where they arrive. */
  views: RoomView[];
  /** Its widest window in an outside wall: what the street sees it through. */
  entry?: RoomWindow;
}

/**
 * How far a walkout's entry plate is set in from the wall face: with the portal's 6 cm standoff
 * it lands behind both sash tracks, so a click on shut glass opens the door, and through the
 * open half it takes you in.
 */
const WALKOUT_RECESS = 0.15;

/** Only the names too long for the toolbar; every other room goes by its own. */
const SHORT_NAMES: Partial<Record<RoomId, string>> = {
  yoshitsu: 'Western room',
  kitchen: 'Kitchen',
  nobita: 'Bedroom',
  doraOshiire: 'Doraemon',
  upperHall: 'Landing',
};

/**
 * The rooms in Chinese. English is not repeated here: it is the plan's own `room.name`, so a room
 * renamed in `plan.ts` renames itself in the diorama and the two can never drift apart. The
 * Japanese name is the house's, written over the fusuma — not a label for the visitor, so it is
 * not translated either.
 */
const NAMES_ZH: Record<RoomId, string> = {
  yoshitsu: '西式客厅',
  living: '起居室',
  nook: '梳妆角',
  oshiire: '壁橱',
  genkan: '玄关',
  hallway: '走廊',
  toilet: '厕所',
  washroom: '盥洗室',
  bath: '浴室',
  kitchen: '厨房与餐厅',
  doma: '后门',
  nobita: '大雄的房间',
  doraOshiire: '哆啦A梦的壁橱',
  storeroom: '储藏室',
  upperHall: '二楼走廊',
  stairwell: '楼梯间',
};

/** The same shortening, in Chinese: only the ones that need it. */
const SHORT_NAMES_ZH: Partial<Record<RoomId, string>> = {
  kitchen: '厨房',
  nobita: '卧室',
  doraOshiire: '哆啦A梦',
  upperHall: '二楼',
};

function entryOf(roomId: RoomId, storey: StoreyId): RoomWindow | undefined {
  let best: { area: number; window: RoomWindow } | undefined;
  for (const wall of WALLS) {
    if (wall.storey !== storey) continue;
    for (const o of wall.openings) {
      if (o.kind !== 'window') continue;
      const along = (o.from + o.to) / 2;
      const inside = ([1, -1] as const).find((side) => roomBeside(wall, along, side)?.id === roomId);
      if (inside === undefined || roomBeside(wall, along, inside === 1 ? -1 : 1)) continue;
      const out = -inside;
      const area = (o.to - o.from) * (o.head - o.sill);
      if (best && best.area >= area) continue;
      const across = wall.at + out * (wall.thickness / 2 - (o.walkout ? WALKOUT_RECESS : 0));
      const y = (o.sill + o.head) / 2;
      best = {
        area,
        window: {
          centre: wall.axis === 'x' ? toWorld(along, y, across) : toWorld(across, y, along),
          width: o.to - o.from,
          height: o.head - o.sill,
          outward: wall.axis === 'x' ? [0, out] : [out, 0],
        },
      };
    }
  }
  return best?.window;
}

/** Every room there is a view of, in plan order: the stairwell's void is the only one without. */
export const rooms: HouseRoom[] = ROOM_VIEWS.map(({ room, views }) => {
  const floors = room.rects.map((r) => rectToWorld(interiorOf(r, room.storey)));
  return {
    id: room.id,
    name: { en: room.name, zh: NAMES_ZH[room.id] },
    shortName: {
      en: SHORT_NAMES[room.id] ?? room.name,
      zh: SHORT_NAMES_ZH[room.id] ?? NAMES_ZH[room.id],
    },
    kana: room.kana,
    storey: room.storey,
    bounds: {
      x0: Math.min(...floors.map((r) => r.x0)),
      x1: Math.max(...floors.map((r) => r.x1)),
      z0: Math.min(...floors.map((r) => r.z0)),
      z1: Math.max(...floors.map((r) => r.z1)),
    },
    floorY: room.floorY,
    ceilingY: STOREYS[room.storey].top,
    views: views.map((view) => ({ ...view, eye: toWorld(...view.eye), aim: toWorld(...view.aim) })),
    entry: entryOf(room.id, room.storey),
  };
});

export const roomById = (id: string) => rooms.find((room) => room.id === id);
