/**
 * The two grown-ups of the house: 玉子 in the kitchen, のび助 at the kotatsu.
 *
 * They are set dressing, not characters. The six children on the pavement are rigged, walked and
 * clicked; these two are a sculpt with no skeleton, no clips and no interaction — set down and
 * left alone, which is all a diorama needs of them. You meet them from the street through a
 * window, or from above with the roof off, and both views only ever show a silhouette held still.
 *
 * Coordinates are the plan's (`src/editor/house/plan.ts`), the same metres `FURNITURE` uses, so a
 * figure stands on the floor it was placed against and not on a floor somewhere else.
 */
import { LEVEL, type RoomId } from '../editor/house/plan';

/**
 * Whether the parents are in the scene. **Off**, by the user's call of 2026-10-31: until the
 * sculpts exist, a stand-in figure standing at the counter reads as a mistake rather than as a
 * placeholder, and the house is better empty of people than furnished with two mannequins.
 *
 * Everything below stays, because none of it is about the stand-in: these are the placements the
 * sculpts will take, checked by `residents.test.ts` against the rooms they stand in. Turning them
 * back on is this flag plus `public/models/residents/{mother,father}.glb` — no code to write.
 */
export const residentsEnabled = false;

export interface Resident {
  id: 'mother' | 'father';
  name: string;
  jpName: string;
  /** The room they belong to, from `plan.ts`; the placement test checks the figure is inside it. */
  room: RoomId;
  /** Plan coordinates: `x`/`z` the figure's centre, `y` the surface it stands or sits on. */
  position: readonly [number, number, number];
  /**
   * Yaw in radians; 0 faces +z, toward the street, so π faces the back of the house. A figure
   * turned a little off the axis they are working on reads better than one squared up to it.
   */
  rotationY: number;
  /**
   * How tall the figure is as placed, metres — a standing figure's height, a seated one's from
   * the cushion to the crown. Sets the stand-in's proportions and fits the sculpt to the room.
   */
  height: number;
  /** `sit` folds the stand-in's legs; a sculpted sitter is authored seated and only placed. */
  pose: 'stand' | 'sit';
  /**
   * Half the width of the body on the floor, metres: what the placement test keeps clear of the
   * furniture. Roughly a shoulder, plus the room a person leaves round themselves.
   */
  girth: number;
  /**
   * Items their body legitimately passes over — the table a sitter's legs go under. The
   * placement test skips these; everything else on the floor still has to be `girth` away.
   */
  ignore?: string[];
  /** A Rodin export that arrives facing the other way is turned here rather than re-exported. */
  modelYaw?: number;
  /** What the stand-in wears, so it reads as the same person the sculpt will be. */
  outfit: { main: string; trim: string; legs: string };
  /** One line for the asset sheet: what the sculpt has to be. */
  brief: string;
}

/** Top of a floor cushion, above the floor: `cushion-s` in `plan.ts` is `h: 0.12`. */
const CUSHION = 0.12;

/**
 * Standing at the sink end of the counter, in the aisle between it and the table. The counter's
 * front face is at z −9.74 and the dining chairs at −9.05, so 0.38 m off the counter leaves the
 * 0.24 m body clear of both. Turned 26° off the counter toward the table, the way someone turns
 * from the sink to answer.
 */
const motherPosition = [2.05, LEVEL.floor, -9.36] as const;

/**
 * Sitting at the far side of the table, facing it and the street beyond it: forward on the
 * cushion, close enough that his folded legs go under the quilt, which is where a kotatsu puts
 * them and why only his back and head show above it. That also hides the part of a seated
 * figure that is hardest to sculpt.
 */
const fatherPosition = [1.95, LEVEL.floor + CUSHION, -5.3] as const;

export const residents: Resident[] = [
  {
    id: 'mother',
    name: 'Tamako Nobi',
    jpName: '野比 玉子',
    room: 'kitchen',
    position: motherPosition,
    rotationY: Math.PI - 0.45,
    height: 1.58,
    pose: 'stand',
    girth: 0.24,
    outfit: { main: '#E8B7A0', trim: '#F3EFE4', legs: '#8C7A6B' },
    brief:
      'A short woman in her late thirties, round wire glasses, black hair in a low bun, a cream apron over a warm pink house dress, slippers. Standing, hands together in front of her.',
  },
  {
    id: 'father',
    name: 'Nobisuke Nobi',
    jpName: '野比 のび助',
    room: 'living',
    position: fatherPosition,
    rotationY: 0,
    height: 0.95,
    pose: 'sit',
    girth: 0.22,
    ignore: ['kotatsu'],
    outfit: { main: '#6E7A85', trim: '#2F3439', legs: '#4A525A' },
    brief:
      'A tall, stooped man in his late thirties, black hair, round glasses, a grey cardigan over a shirt and dark trousers. Seated on the floor with his legs folded under him and his forearms resting forward, as if at a low table. Authored seated, no chair.',
  },
];

export const residentById = (id: Resident['id']) => {
  const resident = residents.find((r) => r.id === id);
  if (!resident) throw new Error(`no resident "${id}"`);
  return resident;
};
