import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import type { MaterialKey } from './materials';
import type { MeshBatch, StoreyBatches } from './mesh-batch';
import {
  coverRanges,
  DOWNPIPES,
  type Downpipe,
  HOODS,
  type Hood,
  isEave,
  massAlong,
  ROOF_BUILD,
  ROOFS,
  type Roof,
  type RoofRect,
  rectRanges,
  roofPlaneAt,
  roofTopAt,
  roomBeside,
  SHUTTER_BOXES,
  type ShutterBox,
  WALL_EXTERIOR,
  WALLS,
  type Wall,
} from './plan';

const EPS = 1e-6;
const { depth: DEPTH } = ROOF_BUILD;
/** One course of tiles, measured up the slope, and how thick its exposed butt stands. */
const COURSE = 0.28;
const BUTT = 0.05;
const HEAD = 0.018;

/**
 * The roofs proper: the tiles and the structure under them, and nothing else.
 *
 * Kept apart from the fittings because the diorama lifts this and only this. A downpipe goes up
 * with the roof and hangs in mid-air; a door hood leaves its door.
 */
export function buildRoofs(batch: MeshBatch) {
  for (const roof of ROOFS) {
    for (const r of roof.rects) buildRoofRect(batch, roof, r);
  }
}

/**
 * What hangs off the walls and happens to live in this file: hoods, shutter boxes, downpipes.
 *
 * A hood or a shutter box belongs to the wall it is screwed to, and lifts with that wall's
 * storey. A downpipe does not: it runs from a gutter past its own storey down to the ground or
 * to the roof below, so it stays with the ground floor however high it starts — lifted with the
 * upper floor it would hang metres of pipe under a floating slab.
 */
export function buildRoofFittings(body: StoreyBatches) {
  for (const hood of HOODS) buildHood(body[wallById(hood.wall).storey], hood);
  for (const box of SHUTTER_BOXES) buildShutterBox(body[wallById(box.wall).storey], box);
  for (const pipe of DOWNPIPES) buildDownpipe(body.ground, pipe);
}

// --- prisms ----------------------------------------------------------------------------------

/** A point in a prism's profile: `p` across its axis, `y` up. */
type P2 = readonly [number, number];

/**
 * A convex prism: `profile` in (across, y), extruded along `axis` from `a0` to `a1`. Side face
 * `i` runs from profile point `i` to the next and takes `sides[i]`; the two end faces take
 * `ends`. Faces are wound outward from the prism's centroid, so the profile may run either way
 * round; degenerate faces — a gable's zero-height eave side — are dropped.
 */
function prism(
  batch: MeshBatch,
  axis: 'x' | 'z',
  profile: readonly P2[],
  a0: number,
  a1: number,
  sides: MaterialKey | readonly MaterialKey[],
  ends: MaterialKey | readonly [MaterialKey, MaterialKey],
) {
  const at = ([p, y]: P2, a: number) => (axis === 'z' ? new Vector3(p, y, a) : new Vector3(a, y, p));
  const n = profile.length;
  const centroid = new Vector3();
  for (const pt of profile) centroid.add(at(pt, (a0 + a1) / 2));
  centroid.divideScalar(n);

  const tris = new Map<MaterialKey, number[]>();
  const tri = (material: MaterialKey, a: Vector3, b: Vector3, c: Vector3) => {
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a));
    if (normal.lengthSq() < 1e-12) return;
    // Outward: away from the centroid. For a convex prism every face plane separates the two.
    const [q, r] = normal.dot(new Vector3().subVectors(a, centroid)) < 0 ? [c, b] : [b, c];
    normal.subVectors(q, a).cross(new Vector3().subVectors(r, a)).normalize();
    let list = tris.get(material);
    if (!list) {
      list = [];
      tris.set(material, list);
    }
    for (const v of [a, q, r]) list.push(v.x, v.y, v.z, normal.x, normal.y, normal.z);
  };

  for (let i = 0; i < n; i++) {
    const p = profile[i] as P2;
    const q = profile[(i + 1) % n] as P2;
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < EPS) continue;
    const material = typeof sides === 'string' ? sides : (sides[i] ?? 'cap');
    tri(material, at(p, a0), at(q, a0), at(q, a1));
    tri(material, at(p, a0), at(q, a1), at(p, a1));
  }
  const [end0, end1] = typeof ends === 'string' ? [ends, ends] : ends;
  const first = profile[0] as P2;
  for (let i = 1; i < n - 1; i++) {
    const b = profile[i] as P2;
    const c = profile[i + 1] as P2;
    tri(end0, at(first, a0), at(b, a0), at(c, a0));
    tri(end1, at(first, a1), at(b, a1), at(c, a1));
  }

  for (const [material, data] of tris) {
    const count = data.length / 6;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    for (let v = 0; v < count; v++) {
      position.set(data.slice(v * 6, v * 6 + 3), v * 3);
      normal.set(data.slice(v * 6 + 3, v * 6 + 6), v * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('normal', new BufferAttribute(normal, 3));
    batch.geometry(geometry, material);
  }
}

// --- roofs -----------------------------------------------------------------------------------

/**
 * The planes over one rectangle of a roof, each as the stretch of the across axis it spans,
 * from its low end to its ridge or high side: one for a lean-to, two for a gable. `edge` is
 * where the plane's tiles start, out over its eave, so every rectangle of one plane lays its
 * courses on the same lines even when it does not reach the eave itself.
 */
function planesOf(roof: Roof, span: [number, number]): { low: number; high: number; edge: number }[] {
  const [c0, c1] = span;
  if (roof.shape.kind === 'shed') {
    const { eave, rises } = roof.shape;
    return rises < 0
      ? [{ low: c1, high: c0, edge: eave + roof.eave }]
      : [{ low: c0, high: c1, edge: eave - roof.eave }];
  }
  const [e0, e1] = roof.shape.eaves;
  const ridge = (e0 + e1) / 2;
  const planes: { low: number; high: number; edge: number }[] = [];
  if (c0 < ridge - EPS) planes.push({ low: c0, high: Math.min(c1, ridge), edge: e0 - roof.eave });
  if (c1 > ridge + EPS) planes.push({ low: c1, high: Math.max(c0, ridge), edge: e1 + roof.eave });
  return planes;
}

/**
 * One rectangle of roof: the attic block closing it (flat ceiling below, stucco gable faces
 * at its open ends), the rafter-and-sheathing layer out over the eaves and rakes (soffit
 * underneath, cream fascia and barge boards on its edges), the tiles in stepped courses, the
 * ridge, gutters, and a vent in each gable.
 */
function buildRoofRect(batch: MeshBatch, roof: Roof, r: RoofRect) {
  const h = (p: number) => roofPlaneAt(roof, p);
  const { across, along } = rectRanges(roof, r);
  const [p0, p1] = across;
  const mass = massAlong(r, along);
  const cover = coverRanges(roof, r);
  const ridge = roof.shape.kind === 'gable' ? (roof.shape.eaves[0] + roof.shape.eaves[1]) / 2 : null;
  const { plate } = roof;

  // The attic: the plate-high floor of it is the ceiling of the rooms below.
  const top: P2[] = [[p1, h(p1)]];
  if (ridge !== null && ridge > p0 + EPS && ridge < p1 - EPS) top.push([ridge, h(ridge)]);
  top.push([p0, h(p0)]);
  const profile: P2[] = [[p0, plate], [p1, plate], ...top];
  const sides: MaterialKey[] = profile.map((pt, i) => {
    const next = profile[(i + 1) % profile.length] as P2;
    if (i === 0) return 'ceilingBoard';
    return Math.abs(pt[0] - next[0]) < EPS ? 'stucco' : 'cap';
  });
  prism(batch, roof.axis, profile, mass[0], mass[1], sides, 'stucco');

  // Rafters and sheathing, only where they stand out from the walls: a strip over each eave,
  // and one past each open end. Inside the walls the attic carries the tiles.
  const layer = (a: number, b: number): P2[] => [
    [a, h(a) - DEPTH],
    [b, h(b) - DEPTH],
    [b, h(b)],
    [a, h(a)],
  ];
  for (const side of ['lo', 'hi'] as const) {
    if (!isEave(roof, r, side)) continue;
    const [edge, wall] = side === 'lo' ? [cover.across[0], p0] : [cover.across[1], p1];
    // Faces: soffit underneath, the wall-side end hidden in the wall, the tiles' bed, the fascia.
    prism(
      batch,
      roof.axis,
      layer(edge, wall),
      cover.along[0],
      cover.along[1],
      ['soffit', 'stucco', 'cap', 'fascia'],
      'fascia',
    );
  }
  for (const end of [0, 1] as const) {
    if (r.rake[end] === null) continue;
    const [a0, a1] = end === 0 ? [cover.along[0], mass[0]] : [mass[1], cover.along[1]];
    for (const plane of planesOf(roof, cover.across)) {
      const [lo, hi] = plane.low < plane.high ? [plane.low, plane.high] : [plane.high, plane.low];
      // The barge board is the outer end face; the inner one sits against the gable face.
      prism(
        batch,
        roof.axis,
        layer(lo, hi),
        a0,
        a1,
        ['soffit', 'fascia', 'cap', 'fascia'],
        end === 0 ? ['fascia', 'stucco'] : ['stucco', 'fascia'],
      );
    }
  }

  // Tiles: courses from the eave edge up to the ridge or the wall, each butt standing proud of
  // the course below it, which is what makes a tiled roof read as one from any distance. A
  // rectangle that starts above the eave takes up the plane's courses part-way through one.
  const slope = Math.sqrt(1 + roof.pitch * roof.pitch);
  const step = COURSE / slope;
  for (const plane of planesOf(roof, cover.across)) {
    const dir = Math.sign(plane.high - plane.low);
    const start = Math.abs(plane.low - plane.edge);
    const end = Math.abs(plane.high - plane.edge);
    /** Tile thickness `d` up the plane: full at a course's butt, thinning to its head. */
    const thick = (d: number) => {
      const t = d / step - Math.floor(d / step + EPS);
      return BUTT + (HEAD - BUTT) * Math.max(0, t);
    };
    for (let i = Math.floor(start / step + EPS); i * step < end - EPS; i++) {
      const d0 = Math.max(start, i * step);
      const d1 = Math.min(end, (i + 1) * step + 0.03);
      const lo = plane.edge + dir * d0;
      const hi = plane.edge + dir * d1;
      prism(
        batch,
        roof.axis,
        [
          [lo, h(lo)],
          [hi, h(hi)],
          [hi, h(hi) + (d1 >= (i + 1) * step - EPS ? HEAD : thick(d1))],
          [lo, h(lo) + thick(d0)],
        ],
        cover.along[0],
        cover.along[1],
        'roofTile',
        'roofTile',
      );
    }
  }

  if (ridge !== null && ridge > p0 && ridge < p1) {
    // The ridge: a bed of tiles and a rounded cap over the seam, an end tile at each open end.
    const y = h(ridge) + BUTT - 0.01;
    prism(
      batch,
      roof.axis,
      [
        [ridge - 0.14, h(ridge - 0.14) + BUTT],
        [ridge + 0.14, h(ridge + 0.14) + BUTT],
        [ridge + 0.11, y + 0.07],
        [ridge - 0.11, y + 0.07],
      ],
      cover.along[0],
      cover.along[1],
      'roofRidge',
      'roofRidge',
    );
    const round: P2[] = [];
    for (let k = 0; k <= 8; k++) {
      const t = (Math.PI * k) / 8;
      round.push([ridge + Math.cos(t) * 0.085, y + 0.07 + Math.sin(t) * 0.075]);
    }
    prism(batch, roof.axis, round, cover.along[0] - 0.02, cover.along[1] + 0.02, 'roofRidge', 'roofRidge');
    for (const end of [0, 1] as const) {
      if (r.rake[end] === null) continue;
      const a = cover.along[end];
      const [b0, b1] = end === 0 ? [a - 0.05, a + 0.04] : [a - 0.04, a + 0.05];
      prism(
        batch,
        roof.axis,
        [
          [ridge - 0.15, y],
          [ridge + 0.15, y],
          [ridge + 0.12, y + 0.3],
          [ridge, y + 0.34],
          [ridge - 0.12, y + 0.3],
        ],
        b0,
        b1,
        'roofRidge',
        'roofRidge',
      );
    }
  }

  const high = roof.shape.kind === 'shed' ? (roof.shape.rises < 0 ? p0 : p1) : null;
  // Where another rectangle of the lean-to carries its plane on up, the high side is a seam in
  // the tiles, not a wall.
  const continued =
    high !== null &&
    roof.rects.some((o) => {
      const other = rectRanges(roof, o);
      return (
        o !== r &&
        (Math.abs(other.across[0] - high) < EPS || Math.abs(other.across[1] - high) < EPS) &&
        other.along[0] < along[1] - EPS &&
        other.along[1] > along[0] + EPS
      );
    });
  if (high !== null && !continued) {
    // Flashing along the high side, where the lean-to meets the wall above it.
    const off = high + (high === p0 ? 0.1 : -0.1);
    prism(
      batch,
      roof.axis,
      [
        [high, h(high) + BUTT],
        [off, h(off) + BUTT],
        [off, h(off) + BUTT + 0.02],
        [high, h(high) + 0.14],
      ],
      cover.along[0],
      cover.along[1],
      'roofRidge',
      'roofRidge',
    );
  }

  // Gutters along the eaves, hung under the tiles' edge outside the fascia.
  for (const side of ['lo', 'hi'] as const) {
    if (!isEave(roof, r, side)) continue;
    const edge = side === 'lo' ? cover.across[0] : cover.across[1];
    const out = side === 'lo' ? -1 : 1;
    const y = h(edge) - DEPTH * 0.6;
    prism(
      batch,
      roof.axis,
      [
        [edge, y - 0.06],
        [edge + out * 0.11, y - 0.06],
        [edge + out * 0.12, y + 0.05],
        [edge, y + 0.05],
      ],
      cover.along[0],
      cover.along[1],
      'gutter',
      'gutter',
    );
  }

  // A louvred vent high in every gable face.
  if (ridge !== null) {
    for (const end of [0, 1] as const) {
      if (r.rake[end] === null) continue;
      const a = mass[end];
      const out = end === 0 ? -1 : 1;
      const cy = h(ridge) - 0.45;
      const [w, hh] = [0.26, 0.11];
      prism(
        batch,
        roof.axis,
        rectProfile(ridge - w, ridge + w, cy - hh, cy + hh),
        a,
        a + out * 0.03,
        'woodMid',
        'woodMid',
      );
      for (let k = 0; k < 7; k++) {
        const x = ridge - w + 0.04 + (k * (2 * w - 0.08)) / 6;
        prism(
          batch,
          roof.axis,
          rectProfile(x - 0.012, x + 0.012, cy - hh + 0.02, cy + hh - 0.02),
          a + out * 0.03,
          a + out * 0.045,
          'woodDark',
          'woodDark',
        );
      }
    }
  }
}

const rectProfile = (p0: number, p1: number, y0: number, y1: number): P2[] => [
  [p0, y0],
  [p1, y0],
  [p1, y1],
  [p0, y1],
];

// --- things on the outside walls -------------------------------------------------------------

function wallById(id: string): Wall {
  const wall = WALLS.find((w) => w.id === id);
  if (!wall) throw new Error(`no wall "${id}"`);
  return wall;
}

/** +1 or −1: the side of a wall with no room on it at `along` — its outside. */
function outsideOf(wall: Wall, along: number): 1 | -1 {
  return roomBeside(wall, along, 1) ? -1 : 1;
}

/**
 * A pent roof over an opening, as slim as home.jpg draws them: a cream board sloping out from
 * the wall at 3 sun, soffit under and fascia on its edge, a thin skin of tiles on it and a
 * flashing strip where it meets the wall; a canopy as deep as the front door's gets brackets.
 */
function buildHood(batch: MeshBatch, hood: Hood) {
  const wall = wallById(hood.wall);
  const s = outsideOf(wall, (hood.from + hood.to) / 2);
  const face = wall.at + s * (wall.thickness / 2);
  const edge = face + s * hood.depth;
  const drop = (c: number) => hood.y - 0.3 * Math.abs(c - face);
  const axis = wall.axis === 'x' ? 'x' : 'z';
  const board = 0.045;
  // The profile runs along the wall's normal, so the prism's axis is the wall's own.
  prism(
    batch,
    axis,
    [
      [face, drop(face)],
      [edge, drop(edge)],
      [edge, drop(edge) + board],
      [face, drop(face) + board],
    ],
    hood.from,
    hood.to,
    ['soffit', 'fascia', 'cap', 'stucco'],
    'fascia',
  );
  const tip = edge + s * 0.025;
  prism(
    batch,
    axis,
    [
      [face, drop(face) + board],
      [tip, drop(tip) + board],
      [tip, drop(tip) + board + 0.025],
      [face, drop(face) + board + 0.025],
    ],
    hood.from - 0.025,
    hood.to + 0.025,
    'roofTile',
    'roofTile',
  );
  const f = face + s * 0.05;
  prism(
    batch,
    axis,
    [
      [face, drop(face) + board + 0.025],
      [f, drop(f) + board + 0.025],
      [f, drop(f) + board + 0.045],
      [face, drop(face) + board + 0.07],
    ],
    hood.from - 0.025,
    hood.to + 0.025,
    'roofRidge',
    'roofRidge',
  );
  if (hood.depth < 0.8) return;
  const reach = face + s * (hood.depth - 0.08);
  for (const a of [hood.from + 0.04, hood.to - 0.09]) {
    prism(
      batch,
      wall.axis === 'x' ? 'x' : 'z',
      [
        [face, drop(face) - 0.42],
        [face, drop(face)],
        [reach, drop(reach)],
      ],
      a,
      a + 0.05,
      'fascia',
      'fascia',
    );
  }
}

/** The louvred box the storm shutters slide into, standing off the wall's outside face. */
function buildShutterBox(batch: MeshBatch, box: ShutterBox) {
  const wall = wallById(box.wall);
  const s = outsideOf(wall, (box.from + box.to) / 2);
  const face = wall.at + s * (wall.thickness / 2);
  const front = face + s * 0.15;
  const axis = wall.axis === 'x' ? 'x' : 'z';
  prism(
    batch,
    axis,
    rectProfile(Math.min(face, front - s * 0.02), Math.max(face, front - s * 0.02), box.y0, box.y1),
    box.from,
    box.to,
    'woodMid',
    'woodMid',
  );
  prism(
    batch,
    axis,
    rectProfile(Math.min(face, front + s * 0.01), Math.max(face, front + s * 0.01), box.y1, box.y1 + 0.04),
    box.from - 0.02,
    box.to + 0.02,
    'woodDark',
    'woodDark',
  );
  const mid = (box.from + box.to) / 2;
  for (const [a, b] of [
    [box.from + 0.03, mid - 0.015],
    [mid + 0.015, box.to - 0.03],
  ] as const) {
    for (let y = box.y0 + 0.06; y < box.y1 - 0.05; y += 0.065) {
      prism(
        batch,
        axis,
        rectProfile(
          Math.min(front - s * 0.02, front + s * 0.01),
          Math.max(front - s * 0.02, front + s * 0.01),
          y,
          y + 0.035,
        ),
        a,
        b,
        'woodLight',
        'woodLight',
      );
    }
  }
}

/** A downpipe: from the gutter back to the wall, then down it to the ground or the roof below. */
function buildDownpipe(batch: MeshBatch, pipe: Downpipe) {
  const roof = ROOFS.find((r) => r.id === pipe.roof);
  if (!roof) throw new Error(`no roof "${pipe.roof}"`);
  const r = roof.rects.find((rect) => {
    const { along } = coverRanges(roof, rect);
    return isEave(roof, rect, pipe.side) && pipe.at >= along[0] && pipe.at <= along[1];
  });
  if (!r) throw new Error(`${pipe.roof} has no ${pipe.side} eave at ${pipe.at}`);
  const { across } = rectRanges(roof, r);
  const cover = coverRanges(roof, r);
  const out = pipe.side === 'lo' ? -1 : 1;
  const edge = pipe.side === 'lo' ? cover.across[0] : cover.across[1];
  const line = (pipe.side === 'lo' ? across[0] : across[1]) + out * (WALL_EXTERIOR / 2 + 0.05);
  const gutter = roofPlaneAt(roof, edge) - DEPTH * 0.6 - 0.06;
  const [x, z] = roof.axis === 'z' ? [line, pipe.at] : [pipe.at, line];
  const bottom = roofTopAt(x, z, roof.id) ?? 0;
  // The leg from the gutter's outlet back to the wall, then the pipe down the wall.
  const legTop = gutter;
  const legBottom = gutter - 0.18;
  prism(
    batch,
    roof.axis,
    [
      [edge + out * 0.03, legTop],
      [edge + out * 0.08, legTop],
      [line + out * 0.03, legBottom],
      [line - out * 0.03, legBottom],
    ],
    pipe.at - 0.03,
    pipe.at + 0.03,
    'gutter',
    'gutter',
  );
  batch.cylinder([x, bottom, z], 0.035, Math.max(0.05, legBottom - bottom), 'gutter', { segments: 10 });
  // Straps holding it to the wall.
  for (let y = bottom + 0.6; y < legBottom - 0.3; y += 1.1)
    batch.cylinder([x, y, z], 0.042, 0.03, 'gutter', { segments: 10 });
}
