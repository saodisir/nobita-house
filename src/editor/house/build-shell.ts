import { BoxGeometry, ExtrudeGeometry, Matrix4, Shape } from 'three';
import type { MaterialKey } from './materials';
import { type BoxFaces, type BuiltBatch, MeshBatch, type StoreyBatches, type Vec3 } from './mesh-batch';
import {
  type DoorOpening,
  EXTERIOR,
  interiorOf,
  LEVEL,
  type Rect,
  ROOMS,
  type Room,
  roomBeside,
  STAIR_WALL,
  STAIRS,
  STOREYS,
  type StoreyId,
  sideToward,
  WALLS,
  type Wall,
  type WindowOpening,
  wallAt,
} from './plan';

const EPS = 1e-6;

/** Deterministic noise: the same plan always builds the same boards and leaves. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The house's structure and what it stands on outside. `paving` is the editor's walk from the
 * porch toward the gate; the diorama's lot lays its own path to the gate, so it is left out.
 *
 * Walls and floors go to the batch of the storey they belong to, so the upper floor can be taken
 * off in one piece. The flight, the knee wall, the porch and the garden steps stay with the
 * ground: they are what the upper floor is climbed from and what the house stands on.
 */
export function buildShell(body: StoreyBatches, { paving }: { paving: boolean }) {
  buildFloors(body);
  for (const wall of WALLS) buildWall(body[wall.storey], wall);
  buildStairs(body.ground);
  buildExterior(body.ground, paving);
}

// --- floors ----------------------------------------------------------------------------------

/** Board and mat thickness: the slab under them stops this far below the finished floor. */
const LAYER: Record<Room['floor'], number> = {
  tatami: 0.05,
  planks: 0.015,
  planksLight: 0.015,
  genkan: 0,
  doma: 0,
  kitchen: 0,
  bath: 0,
  void: 0,
};
const TILE_FINISH: Partial<Record<Room['floor'], MaterialKey>> = {
  genkan: 'genkanFloor',
  doma: 'domaFloor',
  kitchen: 'kitchenFloor',
  bath: 'bathFloor',
};
/** Depth of the polished step board where a raised floor drops to a doma. */
const KAMACHI_DEPTH = 0.12;
/** How far the board's nosing stands proud of the slab face below it. */
const KAMACHI_NOSE = 0.005;

/**
 * Every room's floor: a slab from its storey's base up to the finish, then mats or boards. On
 * the ground it stands on the earth; upstairs it spans from the downstairs wall tops, and its
 * underside is the ceiling of the rooms below. The stairwell has no floor at all — and that
 * ceiling lifting with it is exactly what opens the ground floor up when the upper floor goes.
 */
function buildFloors(body: StoreyBatches) {
  const rand = seeded(11);
  for (const room of ROOMS) {
    if (room.floor === 'void') continue;
    const batch = body[room.storey];
    const base = STOREYS[room.storey].base;
    for (const r of room.rects) {
      const finish = interiorOf(r, room.storey);
      const top = room.floorY - LAYER[room.floor];
      batch.box([r.x0, base, r.z0], [r.x1, top, r.z1], 'kamachi', {
        py: TILE_FINISH[room.floor] ?? (room.floor === 'tatami' ? 'tatamiBorder' : 'plankJoint'),
        ny: base > 0 ? 'ceilingBoard' : 'cap',
      });
      if (room.floor === 'tatami') layTatami(batch, finish, room.floorY);
      if (room.floor === 'planks' || room.floor === 'planksLight') {
        layBoards(batch, finish, room.floorY, room.floor === 'planks' ? 'floorWood' : 'floorWoodLight', rand);
      }
      // The step: a solid board from the ground to just over the finished floor, along every
      // edge where this floor drops to a doma with no wall between.
      for (const s of kamachiStrips(room, r)) {
        batch.box([s.x0, base, s.z0], [s.x1, room.floorY + 0.003, s.z1], 'kamachi');
      }
    }
  }
}

/** Every strip of `r`, one board deep, along an edge that drops to a lower room with no wall on it. */
function kamachiStrips(room: Room, r: Rect): Rect[] {
  const finish = interiorOf(r, room.storey);
  const strips: Rect[] = [];
  const D = KAMACHI_DEPTH;
  const N = KAMACHI_NOSE;
  const noWall = (x: number, z: number) => !wallAt(x, z, room.storey);
  for (const other of ROOMS) {
    if (other.storey !== room.storey || other.floor === 'void' || other.floorY >= room.floorY - EPS) continue;
    for (const low of other.rects) {
      const x0 = Math.max(finish.x0, low.x0);
      const x1 = Math.min(finish.x1, low.x1);
      const z0 = Math.max(finish.z0, low.z0);
      const z1 = Math.min(finish.z1, low.z1);
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      if (x1 > x0 && Math.abs(r.z1 - low.z0) < EPS && noWall(mx, r.z1))
        strips.push({ x0, x1, z0: r.z1 - D, z1: r.z1 + N });
      if (x1 > x0 && Math.abs(r.z0 - low.z1) < EPS && noWall(mx, r.z0))
        strips.push({ x0, x1, z0: r.z0 - N, z1: r.z0 + D });
      if (z1 > z0 && Math.abs(r.x1 - low.x0) < EPS && noWall(r.x1, mz))
        strips.push({ x0: r.x1 - D, x1: r.x1 + N, z0, z1 });
      if (z1 > z0 && Math.abs(r.x0 - low.x1) < EPS && noWall(r.x0, mz))
        strips.push({ x0: r.x0 - N, x1: r.x0 + D, z0, z1 });
    }
  }
  return strips;
}

/**
 * Floorboards 0.15 wide running front to back, in 1.82 m lengths staggered row to row, each a
 * shade apart. 3 mm joints show the dark underlay, which is what makes a floor read as boards.
 */
function layBoards(batch: MeshBatch, area: Rect, top: number, material: MaterialKey, rand: () => number) {
  const width = 0.15;
  const length = 1.82;
  const joint = 0.0015;
  const columns = Math.ceil((area.x1 - area.x0) / width - EPS);
  for (let c = 0; c < columns; c++) {
    const x0 = area.x0 + c * width;
    const x1 = Math.min(area.x1, x0 + width);
    // Each column's first board overhangs the front edge by its stagger and is trimmed there,
    // so the joints step across the room and no strip is left bare.
    for (let z = area.z1 + ((c * 0.61) % length); z > area.z0; z -= length) {
      const b0 = Math.max(area.z0, z - length);
      const b1 = Math.min(area.z1, z);
      if (b1 - b0 < 0.02) continue;
      const shade = 0.88 + rand() * 0.2;
      const tint = `#${[shade, shade * 0.985, shade * 0.97]
        .map((v) =>
          Math.round(Math.min(1, v) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`;
      batch.box([x0 + joint, top - 0.015, b0 + joint], [x1 - joint, top, b1 - joint], material, undefined, {
        tint,
      });
    }
  }
}

/** A mat as [u0, u1, v0, v1] in mat-width units across x (u) and z (v). */
type MatCell = readonly [number, number, number, number];

/**
 * The eight-mat room as the drawing lays it: two mats across the top, two across the bottom,
 * one upright down each side and two across the middle — the layout where no four corners meet.
 */
const EIGHT_JO: readonly MatCell[] = [
  [0, 2, 0, 1],
  [2, 4, 0, 1],
  [0, 1, 1, 3],
  [1, 3, 1, 2],
  [1, 3, 2, 3],
  [3, 4, 1, 3],
  [0, 2, 3, 4],
  [2, 4, 3, 4],
];

/**
 * The six-mat room, three mats wide and four long: one across each end, the rest upright, no
 * four corners meeting. Laid across the other way when the room runs the other way.
 */
const SIX_JO: readonly MatCell[] = [
  [0, 2, 0, 1],
  [2, 3, 0, 2],
  [0, 1, 1, 3],
  [1, 2, 1, 3],
  [2, 3, 2, 4],
  [0, 2, 3, 4],
];

/** The drawn layout for an eight- or six-mat room, the running bond for anything else. */
function matLayout(ux: number, uz: number): readonly MatCell[] {
  if (ux === 4 && uz === 4) return EIGHT_JO;
  if (ux === 3 && uz === 4) return SIX_JO;
  if (ux === 4 && uz === 3) return SIX_JO.map(([u0, u1, v0, v1]) => [v0, v1, u0, u1] as const);
  return runningBond(ux, uz);
}

/** Any other room: rows of full mats in running bond, a half mat at alternate ends. */
function runningBond(ux: number, uz: number): MatCell[] {
  const alongX = ux >= uz;
  const [units, rows] = alongX ? [ux, uz] : [uz, ux];
  const cells: MatCell[] = [];
  for (let r = 0; r < rows; r++) {
    let u = 0;
    const spans: [number, number][] = [];
    if (r % 2 === 1) {
      spans.push([0, 1]);
      u = 1;
    }
    while (units - u >= 2) {
      spans.push([u, u + 2]);
      u += 2;
    }
    if (u < units) spans.push([u, units]);
    for (const [s0, s1] of spans) cells.push(alongX ? [s0, s1, r, r + 1] : [r, r + 1, s0, s1]);
  }
  return cells;
}

/**
 * Tatami sized to the room, as real mats are cut to it. Each full mat carries its dark cloth
 * edge (heri) along both long sides, and its weave runs along its length.
 */
function layTatami(batch: MeshBatch, area: Rect, top: number) {
  const ux = Math.max(1, Math.round((area.x1 - area.x0) / 0.91));
  const uz = Math.max(1, Math.round((area.z1 - area.z0) / 0.91));
  const sx = (area.x1 - area.x0) / ux;
  const sz = (area.z1 - area.z0) / uz;
  const gap = 0.002;
  const heri = 0.028;
  for (const [u0, u1, v0, v1] of matLayout(ux, uz)) {
    const x0 = area.x0 + u0 * sx + gap;
    const x1 = area.x0 + u1 * sx - gap;
    const z0 = area.z0 + v0 * sz + gap;
    const z1 = area.z0 + v1 * sz - gap;
    const longX = x1 - x0 >= z1 - z0;
    batch.box([x0, top - 0.05, z0], [x1, top, z1], 'tatami', undefined, { turn: !longX });
    if ((u1 - u0) * (v1 - v0) !== 2) continue;
    const y0 = top - 0.05;
    const y1 = top + 0.002;
    if (longX) {
      batch.box([x0, y0, z0], [x1, y1, z0 + heri], 'tatamiBorder');
      batch.box([x0, y0, z1 - heri], [x1, y1, z1], 'tatamiBorder');
    } else {
      batch.box([x0, y0, z0], [x0 + heri, y1, z1], 'tatamiBorder', undefined, { turn: true });
      batch.box([x1 - heri, y0, z0], [x1, y1, z1], 'tatamiBorder', undefined, { turn: true });
    }
  }
}

// --- walls -----------------------------------------------------------------------------------

/** How far each end of a wall runs: to a crossing wall's face at a T, through the corner at an L. */
function wallSpan(wall: Wall): [number, number] {
  let a = wall.from;
  let b = wall.to;
  for (const end of [wall.from, wall.to]) {
    const x = wall.axis === 'x' ? end : wall.at;
    const z = wall.axis === 'x' ? wall.at : end;
    for (const other of WALLS) {
      if (other.storey !== wall.storey || other.axis === wall.axis) continue;
      const along = other.axis === 'x' ? x : z;
      const across = other.axis === 'x' ? z : x;
      if (Math.abs(across - other.at) > EPS || along < other.from - EPS || along > other.to + EPS) continue;
      const corner = Math.abs(along - other.from) < EPS || Math.abs(along - other.to) < EPS;
      // At an L the x wall runs through the corner square and the z wall stops at it, so the
      // two never share a face; at a T the wall always stops at the crossing wall's face.
      const grow = corner && wall.axis === 'x' ? other.thickness / 2 : -other.thickness / 2;
      if (end === wall.from) a = wall.from - grow;
      else b = wall.to + grow;
    }
  }
  return [a, b];
}

/** Places one box in a wall's frame: `p` along its axis, `y` up, `c` across from its centre line. */
type Put = (
  p0: number,
  p1: number,
  y0: number,
  y1: number,
  c0: number,
  c1: number,
  material: MaterialKey,
  faces?: WallFaces,
  tint?: string,
) => void;

function wallFrame(batch: MeshBatch, wall: Wall): Put {
  return (p0, p1, y0, y1, c0, c1, material, faces, tint) => {
    const lo = Math.min(c0, c1);
    const hi = Math.max(c0, c1);
    const f = faces && toBoxFaces(wall, faces);
    if (wall.axis === 'x')
      batch.box([p0, y0, wall.at + lo], [p1, y1, wall.at + hi], material, f, tint ? { tint } : undefined);
    else batch.box([wall.at + lo, y0, p0], [wall.at + hi, y1, p1], material, f, tint ? { tint } : undefined);
  };
}

/** Faces named in the wall's frame: `plus`/`minus` are its two long sides, `start`/`end` its ends. */
interface WallFaces {
  plus?: MaterialKey;
  minus?: MaterialKey;
  start?: MaterialKey;
  end?: MaterialKey;
  top?: MaterialKey;
  bottom?: MaterialKey;
}

function toBoxFaces(wall: Wall, f: WallFaces): BoxFaces {
  return wall.axis === 'x'
    ? { pz: f.plus, nz: f.minus, nx: f.start, px: f.end, py: f.top, ny: f.bottom }
    : { px: f.plus, nx: f.minus, nz: f.start, pz: f.end, py: f.top, ny: f.bottom };
}

/** A face's finish: its room's, or outside, stucco over a concrete footing at the ground. */
function faceFinish(wall: Wall, along: number, side: 1 | -1, y1: number): MaterialKey {
  const room = roomBeside(wall, along, side);
  if (room) return room.wall;
  const { base, floor } = STOREYS[wall.storey];
  return base === 0 && y1 <= floor + EPS ? 'concrete' : 'stucco';
}

function buildWall(batch: MeshBatch, wall: Wall) {
  const [a, b] = wallSpan(wall);
  const t = wall.thickness / 2;
  const put = wallFrame(batch, wall);
  const { base, floor, top } = STOREYS[wall.storey];

  // Pieces break at every opening edge and wherever a room boundary meets the wall, so each
  // face belongs to exactly one room and takes that room's finish.
  const cuts = new Set<number>([a, b]);
  for (const o of wall.openings) cuts.add(o.from).add(o.to);
  for (const room of ROOMS.filter((r) => r.storey === wall.storey)) {
    for (const r of room.rects) {
      const [lo, hi] = wall.axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
      const [clo, chi] = wall.axis === 'x' ? [r.z0, r.z1] : [r.x0, r.x1];
      if (wall.at < clo - EPS || wall.at > chi + EPS) continue;
      for (const v of [lo, hi]) if (v > a + EPS && v < b - EPS) cuts.add(v);
    }
  }
  const points = [...cuts].filter((v) => v >= a - EPS && v <= b + EPS).sort((p, q) => p - q);

  for (let i = 0; i < points.length - 1; i++) {
    const s0 = points[i] ?? 0;
    const s1 = points[i + 1] ?? 0;
    if (s1 - s0 < EPS) continue;
    const mid = (s0 + s1) / 2;
    const opening = wall.openings.find((o) => mid > o.from && mid < o.to);
    const startJamb = wall.openings.some((o) => Math.abs(o.to - s0) < EPS);
    const endJamb = wall.openings.some((o) => Math.abs(o.from - s1) < EPS);

    const bands: [number, number, 'sill' | 'head' | null][] = opening
      ? [
          [base, Math.min(opening.sill, floor), opening.sill <= floor ? 'sill' : null],
          ...(opening.sill > floor ? [[floor, opening.sill, 'sill'] as [number, number, 'sill']] : []),
          [opening.head, top, 'head'],
        ]
      : [
          [base, floor, null],
          [floor, top, null],
        ];
    for (const [y0, y1, edge] of bands) {
      put(s0, s1, y0, y1, -t, t, 'cap', {
        plus: faceFinish(wall, mid, 1, y1),
        minus: faceFinish(wall, mid, -1, y1),
        start: startJamb && !opening ? 'trim' : 'cap',
        end: endJamb && !opening ? 'trim' : 'cap',
        top: edge === 'sill' ? 'trim' : 'cap',
        // An upstairs wall's underside is ceiling wherever it spans open space below — over
        // the stair foot, across the hall at the stair head — and matches the ceiling boards
        // where it sits flush with them.
        bottom: edge === 'head' ? 'trim' : y0 === base && base > 0 ? 'ceilingBoard' : 'cap',
      });
    }

    if (!opening) {
      for (const side of [1, -1] as const) {
        const room = roomBeside(wall, mid, side);
        if (!room || room.floorY !== floor || room.floor === 'bath' || room.floor === 'void') continue;
        // Skirting along every dry room's walls: the line that separates wall from floor.
        put(s0, s1, room.floorY, room.floorY + 0.07, side * t, side * (t + 0.012), 'trim');
      }
    }
  }

  for (const o of wall.openings) {
    if (o.kind === 'window') buildWindow(batch, wall, o);
    else buildDoor(batch, wall, o);
  }
}

/** +1 or −1: the side of a wall a room lies on at `along`, preferring +1 when both do. */
function insideOf(wall: Wall, along: number): 1 | -1 {
  return roomBeside(wall, along, 1) ? 1 : -1;
}

// --- windows ---------------------------------------------------------------------------------

/** The aluminium frame's face round an opening, and each sash's rail and stile depth. */
const SASH_FACE = 0.035;
/** A sash's rail and stile width. */
const SASH_MEMBER = 0.028;

/** Which way an opening faces across its wall: outward from the house (−1) or into a room (+1). */
function facingOf(wall: Wall, o: WindowOpening): 1 | -1 {
  const mid = (o.from + o.to) / 2;
  const inside = insideOf(wall, mid);
  const exterior = !roomBeside(wall, mid, 1) || !roomBeside(wall, mid, -1);
  if (!exterior) return 1;
  return inside === 1 ? -1 : 1;
}

/** One aluminium sash and its pane, filling [p0, p1] of the opening on a track centred at `c`. */
function putSash(put: Put, o: WindowOpening, glass: MaterialKey, p0: number, p1: number, c: number) {
  const f = SASH_FACE;
  const s = SASH_MEMBER;
  const c0 = c - 0.012;
  const c1 = c + 0.012;
  put(p0, p1, o.sill + f, o.sill + f + s, c0, c1, 'sash');
  put(p0, p1, o.head - f - s, o.head - f, c0, c1, 'sash');
  put(p0, p0 + s, o.sill + f, o.head - f, c0, c1, 'sash');
  put(p1 - s, p1, o.sill + f, o.head - f, c0, c1, 'sash');
  put(p0 + s, p1 - s, o.sill + f + s, o.head - f - s, c - 0.003, c + 0.003, glass);
}

/**
 * An aluminium frame set toward the outside face with two sashes on two tracks — the Japanese
 * sliding window, and, run down to the floor, the glass doors onto the garden — a wood sill
 * board inside a raised one, and, where the plan asks, curtains. A fixed light is one pane
 * crossed by timber glazing bars instead. A walkout's sashes are the glass doors themselves,
 * and `walkoutLeaves` builds them apart so a click slides them.
 */
function buildWindow(batch: MeshBatch, wall: Wall, o: WindowOpening) {
  const put = wallFrame(batch, wall);
  const t = wall.thickness / 2;
  const mid = (o.from + o.to) / 2;
  const inside = insideOf(wall, mid);
  const out = facingOf(wall, o);
  const f = SASH_FACE;
  const outer = out * (t - 0.015);
  const inner = out * (t - 0.095);
  put(o.from, o.to, o.sill, o.sill + f, outer, inner, 'sash');
  put(o.from, o.to, o.head - f, o.head, outer, inner, 'sash');
  put(o.from, o.from + f, o.sill, o.head, outer, inner, 'sash');
  put(o.to - f, o.to, o.sill, o.head, outer, inner, 'sash');
  const glass: MaterialKey = o.glass === 'frosted' ? 'frosted' : 'glass';

  if (o.fixed) {
    const c = out * (t - 0.05);
    put(o.from + f, o.to - f, o.sill + f, o.head - f, c - 0.003, c + 0.003, glass);
    for (let y = o.sill + f + 0.28; y < o.head - f - 0.05; y += 0.28) {
      put(o.from + f, o.to - f, y, y + 0.022, c - 0.012, c + 0.012, 'trim');
    }
  } else if (!o.walkout) {
    const width = o.to - o.from - 2 * f;
    const sashWidth = width / 2 + 0.02;
    const tracks: [number, number, number][] = [
      [o.from + f, o.from + f + sashWidth, out * (t - 0.03)],
      [o.to - f - sashWidth, o.to - f, out * (t - 0.065)],
    ];
    for (const [p0, p1, c] of tracks) putSash(put, o, glass, p0, p1, c);
  }

  if (o.sill > STOREYS[wall.storey].floor + 0.1) {
    // The inside sill board, proud of the plaster.
    put(
      o.from - 0.03,
      o.to + 0.03,
      o.sill - 0.025,
      o.sill,
      inside * (t - 0.095),
      inside * (t + 0.03),
      'woodMid',
    );
  }
  if (o.curtains) buildCurtains(batch, wall, o, inside, o.curtains);
}

/** A rod over the window and two gathered panels drawn back to either side of it. */
function buildCurtains(batch: MeshBatch, wall: Wall, o: WindowOpening, inside: 1 | -1, cloth: MaterialKey) {
  const put = wallFrame(batch, wall);
  const t = wall.thickness / 2;
  const top = o.head + 0.1;
  // A walkout's curtains stop short of the floor; a window's hang past its sill.
  const bottom = o.walkout ? o.sill + 0.03 : o.sill - 0.15;
  put(o.from - 0.38, o.to + 0.38, top, top + 0.025, inside * (t + 0.09), inside * (t + 0.115), 'woodDark');
  const pleat = 0.055;
  for (const [start, dir] of [
    [o.from - 0.35, 1],
    [o.to + 0.35, -1],
  ] as const) {
    for (let k = 0; k < 6; k++) {
      const p0 = start + dir * k * pleat;
      const p1 = p0 + dir * pleat;
      const deep = k % 2 === 0 ? 0.065 : 0.11;
      put(
        Math.min(p0, p1),
        Math.max(p0, p1),
        bottom,
        top,
        inside * (t + deep),
        inside * (t + deep + 0.02),
        cloth,
      );
    }
  }
}

// --- doors -----------------------------------------------------------------------------------

/**
 * A door's frame, which stays put: a timber casing round the opening on both faces, and a
 * glazed transom over the leaf where the plan has one. The leaves are `buildDoors`'.
 */
function buildDoor(batch: MeshBatch, wall: Wall, o: DoorOpening) {
  const put = wallFrame(batch, wall);
  const t = wall.thickness / 2;
  const casing = 0.045;
  for (const side of [1, -1] as const) {
    const c0 = side * t;
    const c1 = side * (t + 0.012);
    put(o.from - casing, o.from, o.sill, o.head + casing, c0, c1, 'trim');
    put(o.to, o.to + casing, o.sill, o.head + casing, c0, c1, 'trim');
    put(o.from, o.to, o.head, o.head + casing, c0, c1, 'trim');
  }
  if (o.transom !== undefined) {
    put(o.from, o.to, o.transom, o.transom + 0.05, -0.03, 0.03, 'trim');
    put(o.from, o.to, o.transom + 0.05, o.head, -0.004, 0.004, 'glass');
  }
}

/** How a leaf opens: sliding along its track, or swinging on its hinge. */
export type OpenMotion =
  | { kind: 'slide'; axis: 'x' | 'z'; distance: number }
  /** Degrees about the leaf's pivot, which stands on its hinge line. */
  | { kind: 'swing'; degrees: number };

/** One leaf of a door, built shut in a frame whose origin is its pivot. */
export interface DoorLeafPart extends BuiltBatch {
  /** World position of the frame's origin: the hinge line, or the leaf's shut place on its track. */
  pivot: Vec3;
  /** How it opens from shut; null for a pair's back leaf, which the front one slides over. */
  motion: OpenMotion | null;
}

export interface Door {
  id: string;
  /** The storey whose wall it hangs in: the upper floor's doors lift away with it. */
  storey: StoreyId;
  leaves: DoorLeafPart[];
}

/** How much of a sliding leaf stays in the opening when it is open: its pull, to close it by. */
const PULL_SHOWING = 0.12;

/** Every door's leaves, each its own geometry so it can open on its own. */
export function buildDoors(): Door[] {
  return WALLS.flatMap((wall) =>
    wall.openings.flatMap((o) => {
      if (o.kind === 'door') return [{ id: o.id, storey: wall.storey, leaves: doorLeaves(wall, o) }];
      // A walkout is a glass door on a window's track: its sashes slide open on a click.
      if (o.kind === 'window' && o.walkout)
        return [{ id: o.id, storey: wall.storey, leaves: walkoutLeaves(wall, o) }];
      return [];
    }),
  );
}

/** A walkout's two sashes: the front one on the outer track, sliding shut over the back. */
function walkoutLeaves(wall: Wall, o: WindowOpening): DoorLeafPart[] {
  const out = facingOf(wall, o);
  const f = SASH_FACE;
  const glass: MaterialKey = o.glass === 'frosted' ? 'frosted' : 'glass';
  const width = o.to - o.from - 2 * f;
  const sashWidth = width / 2 + 0.02;
  const leaf = (along: number, motion: OpenMotion | null, p0: number, p1: number, c: number) => {
    const pivot: Vec3 = wall.axis === 'x' ? [along, 0, wall.at] : [wall.at, 0, along];
    const batch = MeshBatch.create().at(-pivot[0], 0, -pivot[2]);
    putSash(wallFrame(batch, wall), o, glass, p0, p1, c);
    return { pivot, motion, ...batch.build() };
  };
  return [
    // The front sash slides over the back one until it meets the far stile, the way a
    // Japanese sliding window opens.
    leaf(
      o.from + f,
      { kind: 'slide', axis: wall.axis, distance: width - sashWidth },
      o.from + f,
      o.from + f + sashWidth,
      out * (wall.thickness / 2 - 0.03),
    ),
    leaf(o.to - f - sashWidth, null, o.to - f - sashWidth, o.to - f, out * (wall.thickness / 2 - 0.065)),
  ];
}

function doorLeaves(wall: Wall, o: DoorOpening): DoorLeafPart[] {
  const y0 = o.sill + 0.005;
  const y1 = (o.transom ?? o.head) - 0.005;
  /** A leaf drawn in the wall's frame, stored relative to a pivot at (along, across) in it. */
  const leaf = (along: number, across: number, motion: OpenMotion | null, draw: (put: Put) => void) => {
    const pivot: Vec3 = wall.axis === 'x' ? [along, 0, wall.at + across] : [wall.at + across, 0, along];
    const batch = MeshBatch.create().at(-pivot[0], 0, -pivot[2]);
    draw(wallFrame(batch, wall));
    return { pivot, motion, ...batch.build() };
  };
  const slide = (distance: number): OpenMotion => ({ kind: 'slide', axis: wall.axis, distance });

  if (o.leaf === 'pair') {
    // Two leaves on a double track, overlapping where they meet in the middle; the front one
    // slides over the back one until their far edges line up.
    const mid = (o.from + o.to) / 2;
    return [
      leaf(o.from, 0, slide(o.to - mid - 0.025), (put) =>
        leafPanel(put, o.panel, o.from + 0.005, mid + 0.02, y0, y1, -0.036, -0.006, 'to'),
      ),
      leaf(o.from, 0, null, (put) =>
        leafPanel(put, o.panel, mid - 0.02, o.to - 0.005, y0, y1, 0.006, 0.036, 'from'),
      ),
    ];
  }
  if (o.leaf === 'sliding') {
    // Into the wall past its far edge, the way it pulls from its latch.
    const travel = (o.to - o.from - 0.01 - PULL_SHOWING) * (o.latch === 'from' ? 1 : -1);
    return [
      leaf(o.from, 0, slide(travel), (put) =>
        leafPanel(put, o.panel, o.from + 0.005, o.to - 0.005, y0, y1, -0.017, 0.017, o.latch),
      ),
    ];
  }

  // Hinged: the leaf fills its frame, a knob on each face at the latch edge, hung on the face
  // it swings toward so it turns out of the frame instead of through it.
  const side = sideToward(wall, (o.from + o.to) / 2, o.swing);
  if (side === undefined) throw new Error(`${o.id} swings into ${o.swing}, on neither side of ${wall.id}`);
  const hinge = o.latch === 'to' ? o.from : o.to;
  // Turn the hinge-to-latch direction onto the swing side. Three's +90° about Y takes
  // (x, z) to (z, −x); if that lands on the wrong side, it is −90°.
  const toLatch = o.latch === 'to' ? 1 : -1;
  const [dx, dz] = wall.axis === 'x' ? [toLatch, 0] : [0, toLatch];
  const [nx, nz] = wall.axis === 'x' ? [0, side] : [side, 0];
  const degrees = dz * nx - dx * nz > 0 ? 90 : -90;
  const knob = o.latch === 'from' ? o.from + 0.075 : o.to - 0.075;
  const ky = o.sill + 0.95;
  return [
    leaf(hinge, side * 0.02, { kind: 'swing', degrees }, (put) => {
      leafPanel(put, o.panel, o.from + 0.008, o.to - 0.008, y0, y1, -0.02, 0.02, null);
      for (const face of [1, -1] as const) {
        put(knob - 0.022, knob + 0.022, ky - 0.022, ky + 0.022, face * 0.02, face * 0.028, 'steel');
        put(knob - 0.02, knob + 0.02, ky - 0.02, ky + 0.02, face * 0.028, face * 0.07, 'steel');
      }
    }),
  ];
}

/** One door leaf filling [p0, p1] × [y0, y1] × [c0, c1] in its wall's frame. */
function leafPanel(
  put: Put,
  panel: DoorOpening['panel'],
  p0: number,
  p1: number,
  y0: number,
  y1: number,
  c0: number,
  c1: number,
  pullAt: 'from' | 'to' | null,
) {
  const lo = Math.min(c0, c1);
  const hi = Math.max(c0, c1);
  const midC = (lo + hi) / 2;
  const pull = pullAt === 'from' ? p0 + 0.08 : p1 - 0.08;

  if (panel === 'fusuma') {
    // Paper over a lacquered edge frame, with a sunken round pull.
    const e = 0.02;
    put(p0, p1, y0, y0 + e, lo, hi, 'woodDark');
    put(p0, p1, y1 - e, y1, lo, hi, 'woodDark');
    put(p0, p0 + e, y0, y1, lo, hi, 'woodDark');
    put(p1 - e, p1, y0, y1, lo, hi, 'woodDark');
    put(p0 + e, p1 - e, y0 + e, y1 - e, lo + 0.003, hi - 0.003, 'fusumaPaper');
    put(pull - 0.025, pull + 0.025, y0 + 0.85, y0 + 0.9, lo - 0.002, hi + 0.002, 'blackMetal');
    return;
  }

  if (panel === 'front') {
    // The terracotta front door with its small square window, framed, at eye height.
    put(p0, p1, y0, y1, lo, hi, 'doorFront');
    const pm = (p0 + p1) / 2;
    const s = Math.min(0.3, (p1 - p0) * 0.4);
    const wy = y1 - 0.55;
    put(pm - s / 2 - 0.035, pm + s / 2 + 0.035, wy - 0.035, wy + s + 0.035, lo - 0.004, hi + 0.004, 'trim');
    put(pm - s / 2, pm + s / 2, wy, wy + s, lo - 0.007, hi + 0.007, 'frosted');
    return;
  }

  if (panel === 'glass' || panel === 'frosted') {
    // A timber frame and a mid rail, glazed above and below.
    const e = 0.05;
    const midY = y0 + (y1 - y0) * 0.42;
    put(p0, p1, y0, y0 + 0.12, lo, hi, 'trim');
    put(p0, p1, y1 - e, y1, lo, hi, 'trim');
    put(p0, p0 + e, y0, y1, lo, hi, 'trim');
    put(p1 - e, p1, y0, y1, lo, hi, 'trim');
    put(p0 + e, p1 - e, midY - 0.025, midY + 0.025, lo, hi, 'trim');
    const pane: MaterialKey = panel === 'glass' ? 'doorGlass' : 'frosted';
    put(p0 + e, p1 - e, y0 + 0.12, y1 - e, midC - 0.003, midC + 0.003, pane);
    if (pullAt) put(pull - 0.012, pull + 0.012, y0 + 0.9, y0 + 1.05, lo - 0.003, hi + 0.003, 'blackMetal');
    return;
  }

  // Wood: the pale yellow leaf of ground-1.jpg with two raised panels on each face; the
  // toilet's has a frosted strip down its hinge side instead of a solid upper panel.
  const inset = 0.09;
  const split = y0 + (y1 - y0) * 0.5;
  put(p0, p1, y0, y1, lo, hi, 'doorYellow');
  put(
    p0 + inset,
    p1 - inset,
    y0 + 0.15,
    split - 0.04,
    lo - 0.004,
    hi + 0.004,
    'doorYellow',
    undefined,
    '#F6EBD3',
  );
  if (panel === 'woodGlass') {
    put(p0 + 0.07, p0 + 0.17, split + 0.04, y1 - 0.15, lo - 0.006, hi + 0.006, 'frosted');
    put(
      p0 + 0.22,
      p1 - inset,
      split + 0.04,
      y1 - 0.15,
      lo - 0.004,
      hi + 0.004,
      'doorYellow',
      undefined,
      '#F6EBD3',
    );
  } else {
    put(
      p0 + inset,
      p1 - inset,
      split + 0.04,
      y1 - 0.15,
      lo - 0.004,
      hi + 0.004,
      'doorYellow',
      undefined,
      '#F6EBD3',
    );
  }
  if (pullAt) put(pull - 0.012, pull + 0.012, y0 + 0.9, y0 + 1.05, lo - 0.003, hi + 0.003, 'blackMetal');
}

// --- stairs ----------------------------------------------------------------------------------

/**
 * The flight as stacked solid steps — the enclosed underside of a Japanese box stair — with
 * tread boards nosing over each riser, and on the hallway side the knee wall of ground-1.jpg:
 * plaster to a rail height over the treads, its sloped top capped in dark timber, rising until
 * it meets the storey's top.
 */
function buildStairs(batch: MeshBatch) {
  const { x0, x1, foot, head, risers, fromY, toY } = STAIRS;
  const going = (foot - head) / risers;
  const rise = (toY - fromY) / risers;
  for (let i = 0; i < risers; i++) {
    const zFront = foot - i * going;
    const zBack = foot - (i + 1) * going;
    const y = fromY + (i + 1) * rise;
    batch.box([x0, fromY, zBack], [x1, y - 0.03, zFront], 'plaster', {
      py: 'stairWood',
      pz: 'woodLight',
      nx: 'cap',
    });
    batch.box([x0, y - 0.03, zBack], [x1, y, zFront + 0.02], 'stairWood', undefined, { tint: '#E8DCCF' });
  }

  // The knee wall, as a profile in (s, y) — s the distance back from the foot — extruded across
  // its thickness, then turned into place: s runs to −z, the extrusion to +x.
  const run = foot - head;
  const height = toY - fromY;
  const { rail } = STAIR_WALL;
  const full = Math.min(run, ((LEVEL.top - rail - fromY) / height) * run);
  const profile = new Shape();
  profile.moveTo(0, fromY);
  profile.lineTo(run, fromY);
  profile.lineTo(run, LEVEL.top);
  profile.lineTo(full, LEVEL.top);
  profile.lineTo(0, fromY + rail);
  profile.closePath();
  const thickness = STAIR_WALL.x1 - STAIR_WALL.x0;
  const wall = new ExtrudeGeometry(profile, { depth: thickness, bevelEnabled: false });
  wall.applyMatrix4(new Matrix4().set(0, 0, 1, STAIR_WALL.x0, 0, 1, 0, 0, -1, 0, 0, foot, 0, 0, 0, 1));
  batch.geometry(wall, 'plasterMint');

  // The cap along the sloped top, and a post finishing the wall's low end at the foot.
  const capRise = (full / run) * height;
  const cap = new BoxGeometry(thickness + 0.03, 0.05, Math.hypot(full, capRise));
  cap.rotateX(Math.atan2(height, run));
  cap.translate((STAIR_WALL.x0 + STAIR_WALL.x1) / 2, fromY + rail + capRise / 2 + 0.02, foot - full / 2);
  batch.geometry(cap, 'woodDark');
  batch.box(
    [STAIR_WALL.x0 - 0.015, fromY, foot - 0.02],
    [STAIR_WALL.x1 + 0.015, fromY + rail + 0.05, foot + 0.03],
    'woodDark',
  );
}

// --- outside ---------------------------------------------------------------------------------

function buildExterior(batch: MeshBatch, paving: boolean) {
  const { porch, path, engawa, kitchenStep, backStep } = EXTERIOR;
  batch.box([porch.rect.x0, 0, porch.rect.z0], [porch.rect.x1, porch.top, porch.rect.z1], 'concrete', {
    py: 'genkanFloor',
  });
  if (paving) batch.box([path.rect.x0, 0, path.rect.z0], [path.rect.x1, path.top, path.rect.z1], 'paving');

  // The garden step: four boards running along the wall on two aprons and six legs.
  {
    const { x0, x1, z0, z1 } = engawa.rect;
    const top = engawa.top;
    const boards = 4;
    const bw = (x1 - x0) / boards;
    for (let i = 0; i < boards; i++) {
      batch.box(
        [x0 + i * bw + 0.006, top - 0.03, z0],
        [x0 + (i + 1) * bw - 0.006, top, z1],
        'engawaWood',
        undefined,
        {
          tint: i % 2 === 0 ? '#FFFFFF' : '#EEE8DC',
        },
      );
    }
    for (const z of [z0 + 0.03, z1 - 0.07])
      batch.box([x0 + 0.04, top - 0.11, z], [x1 - 0.04, top - 0.03, z + 0.04], 'engawaWood');
    for (const x of [x0 + 0.05, x1 - 0.11]) {
      for (const z of [z0 + 0.03, (z0 + z1) / 2 - 0.03, z1 - 0.09])
        batch.box([x, 0, z], [x + 0.06, top - 0.03, z + 0.06], 'engawaWood');
    }
  }

  for (const { rect: r, top } of [kitchenStep, backStep])
    batch.box([r.x0, 0, r.z0], [r.x1, top, r.z1], 'concrete');
}
