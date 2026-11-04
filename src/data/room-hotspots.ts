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
import type { Localized } from '../i18n/locale';
import { toWorld } from './house-site';
import { roomPropById } from './room-props';
import { roomById } from './rooms';

export interface RoomHotspot {
  id: string;
  /** Which room it belongs to. */
  roomId: string;
  /** What the card is *about*. Kept from the recovered data, so provenance survives. */
  propId: string;
  title: Localized;
  /** 2-4 sentences. */
  body: Localized;
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
    title: { en: 'The Legendary Desk & Time Portal', zh: '传说中的书桌与时光机' },
    body: {
      en: "This unassuming wooden school desk hides Doraemon's most famous gadget: the Time Machine, tucked inside the right-side drawer. It has launched countless adventures across past and future, connecting directly back to Doraemon's 22nd-century origin. Nobita studies here too — or tries to, between time-travel escapades.",
      zh: '这张不起眼的木制课桌里，藏着哆啦A梦最有名的那件法宝——时光机就塞在右手边的抽屉里。无数趟穿越过去与未来的冒险都从这里出发，也一路连回哆啦A梦的 22 世纪。大雄也在这张桌子上写作业——或者说，在穿越的空档里努力想写。',
    },
    // Over the long centre drawer, at the front edge of the top.
    anchorWorld: onItem('desk', (desk) => [-0.2, desk.h + 0.08, desk.d / 2 - 0.05]),
  },
  {
    id: 'hs-oshiire',
    roomId: 'nobita',
    propId: 'prop-03',
    title: { en: "Doraemon's Secret Sleeping Spot", zh: '哆啦A梦的秘密睡铺' },
    body: {
      en: "This traditional sliding-door closet was built for storing daytime futons, but Doraemon claimed it as his bedroom, curling up inside every night. The detail traces back to Fujiko F. Fujio's own childhood home, where a real oshiire once stood. It is now one of the most iconic corners of the whole house.",
      zh: '这个传统的推拉门壁橱本来是收白天用的被褥的，却被哆啦A梦据为己有，每晚蜷在里面睡。这个细节可以追到藤子·F·不二雄自己的旧宅，那里真有一个这样的押入れ。如今它已经是整栋房子里最有名的角落之一。',
    },
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
    title: { en: 'Traditional Japanese Flooring', zh: '榻榻米：日式地面' },
    body: {
      en: "Each straw tatami mat measures 1.82 by 0.91 metres, and Japanese room sizes are still counted in mats, or jo. Nobita's bedroom is a six-mat room and the living room below it an eight-mat one, cozy family-sized spaces built around this module. The natural woven texture and gentle give underfoot define the comfort of a traditional Japanese home.",
      zh: '一张草编榻榻米是 1.82 米乘 0.91 米，日本房间的面积至今仍按「叠」来数。大雄的卧室是六叠，楼下的起居室是八叠，都是围着这个模数长出来的、刚好够一家人用的尺寸。天然的编织纹理，脚下微微的回弹，就是传统日式住宅的舒适感所在。',
    },
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
    title: { en: 'Doraemon: Cat from the Future', zh: '哆啦A梦：来自未来的猫' },
    body: {
      en: 'MS-903 Doraemon is a robot cat sent from the 22nd century to help Nobita Nobi. Despite missing his ears — lost to a mouse — he remains endlessly loyal and endlessly resourceful. The blue body, red nose, and bell-collar make him instantly recognizable worldwide.',
      zh: 'MS-903 哆啦A梦是从 22 世纪送来帮助野比大雄的机器猫。耳朵被老鼠咬掉之后，他仍然无比忠诚，也总能在关键时刻掏出办法。蓝色的身体、红色的鼻子、挂着铃铛的项圈，让他在全世界一眼就能被认出来。',
    },
    // The figure is placed in phase 3; until then it has no object, so no pin.
    anchor: [0, 0.3, 0],
  },
  {
    id: 'hs-4d-pocket',
    roomId: 'nobita',
    propId: 'prop-09',
    title: { en: 'The Infinite Gadget Dimension', zh: '无限法宝的四次元口袋' },
    body: {
      en: "Doraemon's most powerful feature is a pocket that opens into four-dimensional space, larger than the house itself. It holds thousands of futuristic gadgets — the Time Machine, the Take-copter, the Anywhere Door, and more. Physics does not apply here: it stores objects bigger than the opening and returns exactly what is needed, instantly.",
      zh: '哆啦A梦最厉害的地方，是肚子上那个通向四次元空间的口袋，里面比这栋房子还大。几千件未来道具都收在里面——时光机、竹蜻蜓、任意门，数不完。物理规律在这儿不成立：它能装下比袋口大得多的东西，而且想要什么，立刻就能掏出来。',
    },
    anchorTo: 'prop-08',
    anchor: [0, 0.12, 0.09],
  },
  // --- Doraemon's closet -----------------------------------------------------------------
  {
    id: 'hs-dorayaki',
    roomId: 'doraOshiire',
    propId: 'prop-11',
    title: { en: "Doraemon's Favorite Snack", zh: '哆啦A梦最爱的点心' },
    body: {
      en: "A traditional red-bean-paste sandwich between two castella-style sponge cakes, dorayaki is Doraemon's one true weakness. He can be bribed, motivated, or completely distracted by a single one. Nobita's mother Tamako sometimes bakes them fresh at home — though the effect on Doraemon never lasts very long.",
      zh: '两片松软的厚蛋糕夹着红豆沙，铜锣烧是哆啦A梦唯一的软肋。只要一个，就能哄住他、请动他，或者让他彻底走神。大雄的妈妈玉子偶尔会在家现做——不过这份效力在哆啦A梦身上从来维持不了多久。',
    },
    // The plate beside his pillow (`doraBed` in build-furniture.ts).
    anchorWorld: onItem('dora-bed', (bed) => [-bed.w / 2 + 1.95, bed.h + 0.1, 0]),
  },

  // --- The living room -------------------------------------------------------------------
  {
    id: 'hs-kotatsu',
    roomId: 'living',
    propId: 'prop-12',
    title: { en: 'Warm Winter Gathering Place', zh: '冬天的暖炉桌' },
    body: {
      en: "A low wooden table with an electric heater underneath and a quilted blanket draped over the frame, the kotatsu is Japan's classic symbol of family togetherness. The Nobi family gathers here to eat, study, or just warm up on cold nights. Countless cozy domestic scenes in the series happen right around this table.",
      zh: '一张低矮的木桌，底下装着电热器，架子上搭一条厚被子——被炉是日本家庭团聚的经典象征。野比一家在这里吃饭、写作业，或者只是在天冷的夜里凑在一起取暖。剧里无数温馨的日常场面，都发生在这张桌子周围。',
    },
    anchorWorld: onItem('kotatsu', (kotatsu) => [0, kotatsu.h + 0.14, 0]),
  },
  {
    id: 'hs-living',
    roomId: 'living',
    propId: 'prop-16',
    title: { en: 'Center of Home Life', zh: '一家人生活的中心' },
    body: {
      en: "The tatami-floored heart of the house, where the whole family eats, watches television, and simply exists together. The vintage TV set and the kotatsu anchor countless cozy domestic scenes. Nobita's friends — Gian, Suneo, and Shizuka — drop by here more than anywhere else in the house.",
      zh: '铺着榻榻米的家宅心脏，一家人在这里吃饭、看电视，只是待在一起。老式电视机和被炉撑起了无数温情的日常画面。大雄的朋友——胖虎、小夫和静香——来这儿串门的次数，比去这栋房子里的任何地方都多。',
    },
    anchorWorld: onItem('tv', (tv) => [0, tv.h + 0.12, 0]),
  },
  // --- the rest of the house ---------------------------------------------------------------
  // Written for the 2026-09 build, not recovered: the 2026-08 data described one room.
  {
    id: 'hs-kitchen',
    roomId: 'kitchen',
    propId: 'prop-19',
    title: { en: 'Tamako\u2019s Kitchen', zh: '玉子的厨房' },
    body: {
      en: 'The counter runs along the back wall, the gas table at the garden end and the sink under the window. This is where Nobita\u2019s mother cooks, and where she calls him down from upstairs to a breakfast he is already too late for. The dining table stands in the middle of the room, where the whole family eats together.',
      zh: '操作台沿着后墙摆开，靠院子那头是燃气灶，窗户底下是水槽。大雄的妈妈在这里做饭，也在这里朝楼上喊他下来吃早饭——而他每次都已经迟了。餐桌摆在屋子中间，一家人就在那儿一起吃饭。',
    },
    // Over the sink (`counterRun` in build-furniture.ts).
    anchorWorld: onItem('counter', (counter) => [0.1, counter.h + 0.24, 0]),
  },
  {
    id: 'hs-genkan',
    roomId: 'hallway',
    propId: 'prop-20',
    title: { en: 'The Genkan and the Stairs', zh: '玄关与楼梯' },
    body: {
      en: 'Every Japanese house begins with a genkan: tiled, one step below the floor proper, and the place shoes come off before anyone goes further. The staircase rises straight up the hall ahead of the door, along its west wall, to the landing outside Nobita\u2019s room, which is the route he thunders down every single morning. The shoe cupboard by the door is the getabako, and it is never quite big enough.',
      zh: '每座日式住宅都从玄关开始：铺着地砖，比屋里低一级，谁要往里走，都得先在这儿脱鞋。楼梯就在门前顺着西墙直上，通到大雄房门外的那块平台——每天早上他就是这么咚咚咚冲下来的。门边的鞋柜叫下足箱，永远嫌不够大。',
    },
    // Over the third tread, where the flight is still low enough to see from the hall.
    anchorWorld: toWorld(stairX, LEVEL.floor + 1.6, STAIRS.foot - 0.6),
  },
  {
    id: 'hs-bath',
    roomId: 'bath',
    propId: 'prop-21',
    title: { en: 'The Ofuro, the Family Bath', zh: '浴缸：全家的风吕' },
    body: {
      en: 'A Japanese bath is for soaking, not for washing: you rinse on the tiled floor first and climb into the tub clean. That is why the tub is deep and square rather than long, and why the stool and the shower sit apart from it. The whole family uses the same water in turn, so the last one in still finds it hot.',
      zh: '日式泡澡是为了泡，不是为了洗：先在铺了砖的地面上把身子冲干净，再下到浴缸里。所以缸是深而方，不是长条；凳子和淋浴也另放在一边。一家人轮流用同一缸水，最后进去的那个，水还是热的。',
    },
    anchorWorld: onItem('bathtub', (tub) => [0, tub.h + 0.22, 0]),
  },
  {
    id: 'hs-washroom',
    roomId: 'washroom',
    propId: 'prop-22',
    title: { en: 'Washroom and Laundry', zh: '盥洗与洗衣' },
    body: {
      en: 'The basin and the washing machine share one small room between the lavatory and the bath, which is exactly how the floor plan draws it. The washing machine here is why the drying pole stands out in the yard. It is the least glamorous room in the house and the one a family of three actually uses most.',
      zh: '洗手台和洗衣机挤在厕所与浴室之间的一个小房间里，户型图上画的正是这样。也正因为有这台洗衣机，院子里才立着那根晾衣杆。这是全屋最不起眼的一间，却是三口之家实际用得最多的一间。',
    },
    anchorWorld: onItem('vanity', (vanity) => [0, vanity.h + 0.3, 0]),
  },
  {
    id: 'hs-getabako',
    roomId: 'genkan',
    propId: 'prop-23',
    title: { en: 'Shoes Off at the Door', zh: '进门脱鞋' },
    body: {
      en: 'The genkan floor is tiled and sits a step below the rest of the house, and the line between them is the border between outside and inside. Shoes come off here and go into the getabako against the wall, toes pointing back at the door. Nobita is the reason there is always one pair left lying across the step.',
      zh: '玄关铺地砖，比屋里低一级，这条界线就是外与内的分界。鞋子在这里脱下来，收进靠墙的下足箱，鞋尖朝回门口。而玄关台阶上永远横着一双没人收的鞋，那是大雄的功劳。',
    },
    anchorWorld: onItem('getabako', (getabako) => [0, getabako.h + 0.16, 0]),
  },
  {
    id: 'hs-lavatory',
    roomId: 'toilet',
    propId: 'prop-24',
    title: { en: 'The Smallest Room', zh: '最小的一间' },
    body: {
      en: 'Japanese houses put the lavatory in its own room, separate from the bath and the basin, and this one is no exception. It is the last cell in the east column, nearest the entrance, exactly where the floor plan draws it. Doraemon has been known to hide in here when Nobita\u2019s mother is looking for someone to blame.',
      zh: '日式住宅把厕所单独隔成一个小间，和浴室、洗手台分开，这里也不例外。它在东侧那一列的最后一格，最靠近门口，正是户型图上画的位置。据说大雄的妈妈要找个人来怪罪的时候，哆啦A梦会躲进这里。',
    },
    anchorWorld: onItem('toilet', (toilet) => [0, toilet.h + 0.15, 0]),
  },
  {
    id: 'hs-landing',
    roomId: 'upperHall',
    propId: 'prop-25',
    title: { en: 'The Upstairs Landing', zh: '二楼平台' },
    body: {
      en: 'The stairs end here, at the back of the house, and the landing runs along the back wall to Nobita\u2019s door, the storeroom at its far end. Every morning of Nobita\u2019s life thunders down this flight late, and every afternoon Doraemon floats up it to beat him home. It is barely a corridor with a railing, and the whole house turns on it.',
      zh: '楼梯到这儿为止，就在房子后部；平台沿后墙一直铺到大雄的房门口，尽头是储藏室。大雄每天早晨都从这段楼梯上迟到了冲下去，哆啦A梦每天下午都飘上来，抢在他前面到家。它不过是带栏杆的一条过道，可整栋房子都绕着它转。',
    },
    // Over the head of the flight, where it arrives.
    anchorWorld: toWorld(stairX, LEVEL.upper + 1.0, STAIRS.head - 0.4),
  },
];

export const hotspotsOfRoom = (roomId: string) => roomHotspots.filter((h) => h.roomId === roomId);

/** The prop object a pin hangs off — `anchorTo` when the card's subject is part of another prop. */
export function anchorPropOf(hotspot: RoomHotspot) {
  return roomPropById(hotspot.anchorTo ?? hotspot.propId);
}
