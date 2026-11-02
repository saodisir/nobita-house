/**
 * The hotspot cards, recovered from `git show f129690:src/data/hotspots.ts`. Titles and bodies
 * are edited prose from the 2026-08 build; they are not regenerated and not paraphrased. Where
 * the house they described and the one on the lot now disagree on a fact — how many mats a
 * room has, which room the lavatory is in — the fact is corrected and nothing else.
 *
 * What is *not* recovered is where each pin hangs. Every anchor is taken from the furniture and
 * rooms of `src/editor/house/plan.ts`, on the object the card is about, and moved onto the lot
 * by `house-site.ts`.
 */
import {
  baseOf,
  FURNITURE,
  type Furniture,
  LEVEL,
  STAIRS,
  sideToward,
  WALLS,
  yawOf,
} from '../editor/house/plan';
import { toWorld } from './house-site';
import { roomPropById } from './room-props';
import { roomById } from './rooms';

export interface RoomHotspot {
  id: string;
  /** Which room it belongs to. */
  roomId: string;
  /** What the card is *about*. Kept from the recovered data, so provenance survives. */
  propId: string;
  title: string;
  /** 2-4 sentences. */
  body: string;
  /**
   * The prop object the pin actually hangs off, when that is not `propId` itself — the 4D
   * pocket and the bell are parts of the Doraemon figure, not objects of their own.
   */
  anchorTo?: string;
  /** Pin offset in the anchor prop's local space, metres. Props rest on the floor at y = 0. */
  anchor?: [number, number, number];
  /** World anchor: where on the lot the pin hangs. */
  anchorWorld?: [number, number, number];
}

/**
 * A point on a piece of furniture, given in its own frame — width along x, front toward +z,
 * height from what it stands on — the frame `build-furniture.ts` draws it in, turned as it turns.
 */
function onItem(id: string, local: (item: Furniture) => [number, number, number]): [number, number, number] {
  const item = FURNITURE.find((f) => f.id === id);
  if (!item) throw new Error(`no furniture ${id}`);
  const [lx, ly, lz] = local(item);
  const yaw = yawOf(item);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return toWorld(item.x + lx * cos + lz * sin, baseOf(item) + ly, item.z - lx * sin + lz * cos);
}

const doraemonsCloset = (() => {
  for (const wall of WALLS) {
    const door = wall.openings.find((o) => o.id === 'fusuma-dora');
    if (!door) continue;
    const along = (door.from + door.to) / 2;
    const side = sideToward(wall, along, 'nobita');
    if (side === undefined) throw new Error('fusuma-dora does not open onto the bedroom');
    return { wall, along, side };
  }
  throw new Error('no fusuma-dora');
})();

const bedroom = roomById('nobita');
if (!bedroom) throw new Error('no bedroom');
const stairX = (STAIRS.x0 + STAIRS.x1) / 2;

export const roomHotspots: RoomHotspot[] = [
  // --- Nobita's bedroom ------------------------------------------------------------------
  {
    id: 'hs-desk',
    roomId: 'nobita',
    propId: 'prop-01',
    title: 'The Legendary Desk & Time Portal',
    body: "This unassuming wooden school desk hides Doraemon's most famous gadget: the Time Machine, tucked inside the right-side drawer. It has launched countless adventures across past and future, connecting directly back to Doraemon's 22nd-century origin. Nobita studies here too — or tries to, between time-travel escapades.",
    // Over the long centre drawer, at the front edge of the top.
    anchorWorld: onItem('desk', (desk) => [-0.2, desk.h + 0.08, desk.d / 2 - 0.05]),
  },
  {
    id: 'hs-oshiire',
    roomId: 'nobita',
    propId: 'prop-03',
    title: "Doraemon's Secret Sleeping Spot",
    body: "This traditional sliding-door closet was built for storing daytime futons, but Doraemon claimed it as his bedroom, curling up inside every night. The detail traces back to Fujiko F. Fujio's own childhood home, where a real oshiire once stood. It is now one of the most iconic corners of the whole house.",
    // On the bedroom face of the closet's fusuma.
    anchorWorld: (() => {
      const { wall, along, side } = doraemonsCloset;
      const across = wall.at + side * (wall.thickness / 2 + 0.08);
      const y = LEVEL.upper + 1.25;
      return wall.axis === 'x' ? toWorld(along, y, across) : toWorld(across, y, along);
    })(),
  },
  {
    id: 'hs-tatami',
    roomId: 'nobita',
    propId: 'prop-06',
    title: 'Traditional Japanese Flooring',
    body: "Each straw tatami mat measures 1.82 by 0.91 metres, and Japanese room sizes are still counted in mats, or jo. Nobita's bedroom is a six-mat room and the living room below it an eight-mat one, cozy family-sized spaces built around this module. The natural woven texture and gentle give underfoot define the comfort of a traditional Japanese home.",
    anchorWorld: [
      (bedroom.bounds.x0 + bedroom.bounds.x1) / 2,
      bedroom.floorY + 0.08,
      (bedroom.bounds.z0 + bedroom.bounds.z1) / 2,
    ],
  },
  {
    id: 'hs-doraemon',
    roomId: 'nobita',
    propId: 'prop-08',
    title: 'Doraemon: Cat from the Future',
    body: 'MS-903 Doraemon is a robot cat sent from the 22nd century to help Nobita Nobi. Despite missing his ears — lost to a mouse — he remains endlessly loyal and endlessly resourceful. The blue body, red nose, and bell-collar make him instantly recognizable worldwide.',
    // The figure is placed in phase 3; until then it has no object, so no pin.
    anchor: [0, 0.3, 0],
  },
  {
    id: 'hs-4d-pocket',
    roomId: 'nobita',
    propId: 'prop-09',
    title: 'The Infinite Gadget Dimension',
    body: "Doraemon's most powerful feature is a pocket that opens into four-dimensional space, larger than the house itself. It holds thousands of futuristic gadgets — the Time Machine, the Take-copter, the Anywhere Door, and more. Physics does not apply here: it stores objects bigger than the opening and returns exactly what is needed, instantly.",
    anchorTo: 'prop-08',
    anchor: [0, 0.12, 0.09],
  },
  // --- Doraemon's closet -----------------------------------------------------------------
  {
    id: 'hs-dorayaki',
    roomId: 'doraOshiire',
    propId: 'prop-11',
    title: "Doraemon's Favorite Snack",
    body: "A traditional red-bean-paste sandwich between two castella-style sponge cakes, dorayaki is Doraemon's one true weakness. He can be bribed, motivated, or completely distracted by a single one. Nobita's mother Tamako sometimes bakes them fresh at home — though the effect on Doraemon never lasts very long.",
    // The plate beside his pillow (`doraBed` in build-furniture.ts).
    anchorWorld: onItem('dora-bed', (bed) => [-bed.w / 2 + 1.95, bed.h + 0.1, 0]),
  },

  // --- The living room -------------------------------------------------------------------
  {
    id: 'hs-kotatsu',
    roomId: 'living',
    propId: 'prop-12',
    title: 'Warm Winter Gathering Place',
    body: "A low wooden table with an electric heater underneath and a quilted blanket draped over the frame, the kotatsu is Japan's classic symbol of family togetherness. The Nobi family gathers here to eat, study, or just warm up on cold nights. Countless cozy domestic scenes in the series happen right around this table.",
    anchorWorld: onItem('kotatsu', (kotatsu) => [0, kotatsu.h + 0.14, 0]),
  },
  {
    id: 'hs-living',
    roomId: 'living',
    propId: 'prop-16',
    title: 'Center of Home Life',
    body: "The tatami-floored heart of the house, where the whole family eats, watches television, and simply exists together. The vintage TV set and the kotatsu anchor countless cozy domestic scenes. Nobita's friends — Gian, Suneo, and Shizuka — drop by here more than anywhere else in the house.",
    anchorWorld: onItem('tv', (tv) => [0, tv.h + 0.12, 0]),
  },
  // --- the rest of the house ---------------------------------------------------------------
  // Written for the 2026-09 build, not recovered: the 2026-08 data described one room.
  {
    id: 'hs-kitchen',
    roomId: 'kitchen',
    propId: 'prop-19',
    title: 'Tamako\u2019s Kitchen',
    body: 'The counter runs along the back wall, the gas table at the garden end and the sink under the window. This is where Nobita\u2019s mother cooks, and where she calls him down from upstairs to a breakfast he is already too late for. The dining table stands in the middle of the room, where the whole family eats together.',
    // Over the sink (`counterRun` in build-furniture.ts).
    anchorWorld: onItem('counter', (counter) => [0.1, counter.h + 0.24, 0]),
  },
  {
    id: 'hs-genkan',
    roomId: 'hallway',
    propId: 'prop-20',
    title: 'The Genkan and the Stairs',
    body: 'Every Japanese house begins with a genkan: tiled, one step below the floor proper, and the place shoes come off before anyone goes further. The staircase rises straight up the hall ahead of the door, along its west wall, to the landing outside Nobita\u2019s room, which is the route he thunders down every single morning. The shoe cupboard by the door is the getabako, and it is never quite big enough.',
    // Over the third tread, where the flight is still low enough to see from the hall.
    anchorWorld: toWorld(stairX, LEVEL.floor + 1.6, STAIRS.foot - 0.6),
  },
  {
    id: 'hs-bath',
    roomId: 'bath',
    propId: 'prop-21',
    title: 'The Ofuro, the Family Bath',
    body: 'A Japanese bath is for soaking, not for washing: you rinse on the tiled floor first and climb into the tub clean. That is why the tub is deep and square rather than long, and why the stool and the shower sit apart from it. The whole family uses the same water in turn, so the last one in still finds it hot.',
    anchorWorld: onItem('bathtub', (tub) => [0, tub.h + 0.22, 0]),
  },
  {
    id: 'hs-washroom',
    roomId: 'washroom',
    propId: 'prop-22',
    title: 'Washroom and Laundry',
    body: 'The basin and the washing machine share one small room between the lavatory and the bath, which is exactly how the floor plan draws it. The washing machine here is why the drying pole stands out in the yard. It is the least glamorous room in the house and the one a family of three actually uses most.',
    anchorWorld: onItem('vanity', (vanity) => [0, vanity.h + 0.3, 0]),
  },
  {
    id: 'hs-getabako',
    roomId: 'genkan',
    propId: 'prop-23',
    title: 'Shoes Off at the Door',
    body: 'The genkan floor is tiled and sits a step below the rest of the house, and the line between them is the border between outside and inside. Shoes come off here and go into the getabako against the wall, toes pointing back at the door. Nobita is the reason there is always one pair left lying across the step.',
    anchorWorld: onItem('getabako', (getabako) => [0, getabako.h + 0.16, 0]),
  },
  {
    id: 'hs-lavatory',
    roomId: 'toilet',
    propId: 'prop-24',
    title: 'The Smallest Room',
    body: 'Japanese houses put the lavatory in its own room, separate from the bath and the basin, and this one is no exception. It is the last cell in the east column, nearest the entrance, exactly where the floor plan draws it. Doraemon has been known to hide in here when Nobita\u2019s mother is looking for someone to blame.',
    anchorWorld: onItem('toilet', (toilet) => [0, toilet.h + 0.15, 0]),
  },
  {
    id: 'hs-landing',
    roomId: 'upperHall',
    propId: 'prop-25',
    title: 'The Upstairs Landing',
    body: 'The stairs end here, at the back of the house, and the landing runs along the back wall to Nobita\u2019s door, the storeroom at its far end. Every morning of Nobita\u2019s life thunders down this flight late, and every afternoon Doraemon floats up it to beat him home. It is barely a corridor with a railing, and the whole house turns on it.',
    // Over the head of the flight, where it arrives.
    anchorWorld: toWorld(stairX, LEVEL.upper + 1.0, STAIRS.head - 0.4),
  },
];

export const hotspotsOfRoom = (roomId: string) => roomHotspots.filter((h) => h.roomId === roomId);

/** The prop object a pin hangs off — `anchorTo` when the card's subject is part of another prop. */
export function anchorPropOf(hotspot: RoomHotspot) {
  return roomPropById(hotspot.anchorTo ?? hotspot.propId);
}
