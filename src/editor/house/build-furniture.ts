import { CylinderGeometry } from 'three';
import { seeded } from './build-shell';
import type { MaterialKey } from './materials';
import type { MeshBatch, StoreyBatches } from './mesh-batch';
import { baseOf, FURNITURE, type Furniture, type FurnitureKind, storeyOfRoom, yawOf } from './plan';

/**
 * Every item is built in its own frame: origin at the centre of its footprint on whatever it
 * stands on, width along x, front toward +z, height up y. `buildFurniture` places and turns it.
 */
type Builder = (b: MeshBatch, item: Furniture, rand: () => number) => void;

/** Each item goes to its room's storey, so the upper floor's furniture lifts away with the floor. */
export function buildFurniture(body: StoreyBatches) {
  const rand = seeded(23);
  for (const item of FURNITURE) {
    const quarterTurns = yawOf(item) / (Math.PI / 2);
    const batch = body[storeyOfRoom(item.room)];
    BUILDERS[item.kind](batch.at(item.x, baseOf(item), item.z, quarterTurns), item, rand);
  }
}

// --- shared parts ----------------------------------------------------------------------------

/** Four square legs inset from a w × d footprint. */
function legs(
  b: MeshBatch,
  w: number,
  d: number,
  h: number,
  size: number,
  inset: number,
  material: MaterialKey,
) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - inset - size / 2);
      const z = sz * (d / 2 - inset - size / 2);
      b.box([x - size / 2, 0, z - size / 2], [x + size / 2, h, z + size / 2], material);
    }
  }
}

/** A carcase with a grid of door or drawer fronts across its face and a pull on each. */
function carcase(
  b: MeshBatch,
  w: number,
  d: number,
  h: number,
  body: MaterialKey,
  front: MaterialKey,
  columns: number,
  rows: number,
  plinth = 0.06,
) {
  b.box([-w / 2 + 0.02, 0, -d / 2], [w / 2 - 0.02, plinth, d / 2 - 0.03], 'plasticDark');
  b.rounded([-w / 2, plinth, -d / 2], [w / 2, h, d / 2], 0.008, body);
  const gap = 0.006;
  const cw = (w - 0.03) / columns;
  const rh = (h - plinth - 0.04) / rows;
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const x0 = -w / 2 + 0.015 + c * cw + gap;
      const y0 = plinth + 0.02 + r * rh + gap;
      b.box([x0, y0, d / 2], [x0 + cw - 2 * gap, y0 + rh - 2 * gap, d / 2 + 0.012], front);
      const px = rows > 1 ? x0 + cw / 2 - gap : c % 2 === 0 ? x0 + cw - 0.07 : x0 + 0.05;
      const py = rows > 1 ? y0 + rh - 0.06 : y0 + rh * 0.6;
      b.box([px - 0.03, py, d / 2 + 0.012], [px + 0.03, py + 0.014, d / 2 + 0.028], 'blackMetal');
    }
  }
}

/**
 * Pot, soil, a stalk out of the soil and a rosette of leaves climbing to the item's height.
 * Every leaf is rooted: its base end sits on the stalk's axis, so none hangs in the air.
 */
function plant(b: MeshBatch, w: number, h: number, rand: () => number) {
  const potR = w * 0.3;
  const potH = Math.max(0.1, h * 0.28);
  const pot: MaterialKey = rand() > 0.5 ? 'potTerracotta' : 'potWhite';
  b.cylinder([0, 0, 0], potR * 0.82, potH, pot, { topRadius: potR });
  // Proud of the pot's closed top by 4 mm, inside its rim: level with it, the two z-fight.
  b.cylinder([0, potH - 0.02, 0], potR * 0.9, 0.024, 'soil');
  const soilTop = potH + 0.004;
  const reach = Math.max(0.12, h - potH);
  // Leaves bud from the soil up to 60% of the reach, bunched low like a rosette; the rest of
  // the height is their length.
  const topBud = reach * 0.6;
  b.cylinder([0, soilTop - 0.01, 0], Math.max(0.006, potR * 0.08), topBud + 0.02, 'woodDark', {
    topRadius: Math.max(0.004, potR * 0.05),
    segments: 8,
  });
  const leaves = Math.round(10 + h * 16);
  for (let i = 0; i < leaves; i++) {
    const t = i / leaves;
    const yaw = i * 2.4 + rand() * 0.6;
    const pitch = -(0.35 + rand() * 0.75);
    const len = (0.08 + rand() * 0.07) * Math.min(1.6, 0.6 + h);
    const bud = soilTop - 0.005 + topBud * t ** 1.5;
    // The leaf's long axis; its base end is `len` back from the centre, on the stalk.
    const ax = Math.sin(yaw) * Math.cos(pitch);
    const ay = -Math.sin(pitch);
    const az = Math.cos(yaw) * Math.cos(pitch);
    b.ellipsoid(
      [ax * len, bud + ay * len, az * len],
      [len * 0.32, 0.01, len],
      i % 3 === 0 ? 'leafLight' : 'leaf',
      yaw,
      pitch,
      { coarse: true },
    );
  }
}

/** A cylinder whose axis runs front to back (local z): a dial, a knob. */
function disc(
  b: MeshBatch,
  x: number,
  y: number,
  z: number,
  radius: number,
  depth: number,
  material: MaterialKey,
) {
  const g = new CylinderGeometry(radius, radius, depth, 24);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  b.geometry(g, material);
}

/** Relative luminance of a `#RRGGBB` tint, 0 (black) to 1 (white). */
function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
}

/**
 * One book standing on a shelf, spine to the front (local +z): cloth-bound in `tint`, with its
 * title label two thirds of the way up the spine, dark on a pale binding and pale on a dark one.
 * The label is placed by the book's own height, so a row of books never lines its labels up.
 */
function book(
  b: MeshBatch,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  tint = '#FFFFFF',
) {
  b.box([x0, y0, z0], [x1, y1, z1], 'bookCloth', undefined, { tint });
  const ly = y0 + (y1 - y0) * 0.62;
  const lh = Math.min(0.03, (y1 - y0) * 0.15);
  b.box([x0 + 0.004, ly, z1], [x1 - 0.004, ly + lh, z1 + 0.0015], 'sheetWhite', undefined, {
    tint: luminance(tint) > 0.6 ? '#4A3F36' : '#EFE3C4',
  });
}

// --- builders --------------------------------------------------------------------------------

const BUILDERS: Record<FurnitureKind, Builder> = {
  plant: (b, { w, h }, rand) => plant(b, w, h, rand),

  flowers: (b, { w, h }, rand) => {
    // The genkan's pot of pink flowers in ground-1.jpg: a low bowl, leaves, a dome of blooms.
    const r = w * 0.45;
    b.cylinder([0, 0, 0], r * 0.7, h * 0.35, 'potWhite', { topRadius: r });
    b.cylinder([0, h * 0.35 - 0.015, 0], r * 0.92, 0.02, 'soil');
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4;
      const rr = r * (0.3 + rand() * 0.6);
      const y = h * 0.4 + rand() * h * 0.45;
      b.ellipsoid(
        [Math.sin(a) * rr, y, Math.cos(a) * rr],
        [0.035, 0.028, 0.035],
        i % 3 === 0 ? 'leaf' : 'blossomPink',
        a,
        0,
        {
          coarse: true,
        },
      );
    }
  },

  sofa: (b, { w, d, h }, rand) => {
    const arm = 0.17;
    legs(b, w, d, 0.06, 0.05, 0.05, 'woodDark');
    b.rounded([-w / 2, 0.06, -d / 2], [w / 2, 0.4, d / 2], 0.04, 'fabricCream');
    b.rounded([-w / 2, 0.06, -d / 2], [-w / 2 + arm, 0.62, d / 2], 0.06, 'fabricCream');
    b.rounded([w / 2 - arm, 0.06, -d / 2], [w / 2, 0.62, d / 2], 0.06, 'fabricCream');
    b.rounded(
      [-w / 2 + arm - 0.02, 0.38, -d / 2],
      [w / 2 - arm + 0.02, h, -d / 2 + 0.2],
      0.06,
      'fabricCream',
    );
    const seats = w > 1.8 ? 3 : 2;
    const sw = (w - 2 * arm) / seats;
    for (let i = 0; i < seats; i++) {
      const x0 = -w / 2 + arm + i * sw + 0.005;
      const tint = `#${Math.round(236 + rand() * 12).toString(16)}EBE0`;
      b.rounded([x0, 0.38, -d / 2 + 0.18], [x0 + sw - 0.01, 0.52, d / 2 - 0.02], 0.06, 'fabricCream', {
        tint,
      });
      b.rounded([x0, 0.5, -d / 2 + 0.17], [x0 + sw - 0.01, h - 0.02, -d / 2 + 0.36], 0.07, 'fabricCream', {
        tint,
      });
    }
  },

  armchair: (b, { w, d, h }) => {
    const arm = 0.14;
    legs(b, w, d, 0.07, 0.045, 0.04, 'woodDark');
    b.rounded([-w / 2, 0.07, -d / 2], [w / 2, 0.4, d / 2], 0.04, 'fabricCream');
    b.rounded([-w / 2, 0.07, -d / 2], [-w / 2 + arm, 0.6, d / 2], 0.05, 'fabricCream');
    b.rounded([w / 2 - arm, 0.07, -d / 2], [w / 2, 0.6, d / 2], 0.05, 'fabricCream');
    b.rounded(
      [-w / 2 + arm - 0.02, 0.38, -d / 2],
      [w / 2 - arm + 0.02, h, -d / 2 + 0.18],
      0.06,
      'fabricCream',
    );
    b.rounded([-w / 2 + arm, 0.38, -d / 2 + 0.16], [w / 2 - arm, 0.52, d / 2 - 0.02], 0.06, 'fabricCream', {
      tint: '#F2EDE4',
    });
  },

  coffeeTable: (b, { w, d, h }) => {
    b.rounded([-w / 2, h - 0.035, -d / 2], [w / 2, h, d / 2], 0.01, 'woodMid');
    b.box([-w / 2 + 0.05, h - 0.1, -d / 2 + 0.05], [w / 2 - 0.05, h - 0.035, d / 2 - 0.05], 'woodDark');
    legs(b, w, d, h - 0.035, 0.05, 0.04, 'woodDark');
    // A glass ashtray and a lace mat, the Showa reception-room table.
    b.box([-0.2, h, -0.12], [0.2, h + 0.003, 0.12], 'sheetWhite');
    b.cylinder([0.3, h, 0.05], 0.07, 0.025, 'glass');
  },

  rug: (b, { w, d, h }) => {
    b.box([-w / 2, 0, -d / 2], [w / 2, h * 0.8, d / 2], 'rugBorder', undefined, { solid: false });
    b.box([-w / 2 + 0.08, 0, -d / 2 + 0.08], [w / 2 - 0.08, h, d / 2 - 0.08], 'rugJute', undefined, {
      solid: false,
    });
  },

  bookcase: (b, { w, d, h }, rand) => {
    const s = 0.02;
    b.box([-w / 2, 0, -d / 2], [-w / 2 + s, h, d / 2], 'woodMid');
    b.box([w / 2 - s, 0, -d / 2], [w / 2, h, d / 2], 'woodMid');
    b.box([-w / 2, h - s, -d / 2], [w / 2, h, d / 2], 'woodMid');
    b.box([-w / 2 + s, 0, -d / 2], [w / 2 - s, h - s, -d / 2 + 0.01], 'woodMid');
    const shelves = 4;
    const gap = (h - 0.06) / shelves;
    for (let k = 0; k < shelves; k++) {
      const y = 0.04 + k * gap;
      b.box([-w / 2 + s, y - 0.02, -d / 2 + 0.01], [w / 2 - s, y, d / 2], 'woodMid');
      let x = -w / 2 + s + 0.01;
      while (x < w / 2 - s - 0.05) {
        const bw = 0.025 + rand() * 0.035;
        const bh = gap * (0.6 + rand() * 0.3);
        const tint = ['#8C3B30', '#2F4A76', '#D8C49A', '#3F6B4A', '#E8E2D2'][Math.floor(rand() * 5)];
        book(b, x, Math.min(x + bw, w / 2 - s - 0.01), y, y + bh, -d / 2 + 0.03, d / 2 - 0.03, tint);
        x += bw + 0.003;
      }
    }
  },

  lowCabinet: (b, { w, d, h }) => {
    carcase(b, w, d, h, 'woodMid', 'woodLight', Math.max(2, Math.round(w / 0.45)), 1, 0.05);
    b.box([-w / 2 - 0.01, h, -d / 2 - 0.01], [w / 2 + 0.01, h + 0.02, d / 2 + 0.01], 'woodDark');
    b.cylinder([w / 2 - 0.2, h + 0.02, 0], 0.06, 0.22, 'potWhite', { topRadius: 0.04 });
    b.box([-w / 2 + 0.1, h + 0.02, -0.08], [-w / 2 + 0.34, h + 0.05, 0.1], 'lacquerRed');
  },

  tvStand: (b, { w, d, h }) => {
    b.rounded([-w / 2, 0.04, -d / 2], [w / 2, h, d / 2], 0.01, 'woodMid');
    b.box([-w / 2 + 0.03, 0.08, d / 2 - 0.02], [-0.02, h - 0.04, d / 2 + 0.002], 'woodDark');
    carcase(b.at(w / 4, 0, 0), w / 2 - 0.04, d, h, 'woodMid', 'woodLight', 2, 1, 0.04);
  },

  crtTv: (b, { w, d, h }) => {
    // A Showa set: a deep cream cabinet, a bulging dark screen, a speaker grille beside it.
    b.rounded([-w / 2, 0, -d / 2], [w / 2, h, d / 2], 0.04, 'cabinetCream', { tint: '#E9E1CD' });
    b.rounded([-w / 2 + 0.04, 0.06, d / 2 - 0.04], [w / 2 - 0.2, h - 0.06, d / 2 + 0.015], 0.03, 'screen');
    b.box([w / 2 - 0.16, 0.08, d / 2], [w / 2 - 0.05, h - 0.1, d / 2 + 0.008], 'plasticDark');
    for (const y of [0.18, 0.28]) disc(b, w / 2 - 0.105, y, d / 2 + 0.012, 0.02, 0.012, 'steel');
    b.rod([0, h + 0.005, -0.05], 0.004, 0.5, 'steel');
  },

  kotatsu: (b, { w, d, h }) => {
    // The quilt fills the footprint to the floor; the top board sits on it, a bowl of mandarins
    // and the tea things on the board.
    b.rounded([-w / 2, 0.01, -d / 2], [w / 2, h - 0.03, d / 2], 0.06, 'kotatsuQuilt');
    b.rounded([-w / 2 + 0.05, h - 0.035, -d / 2 + 0.05], [w / 2 - 0.05, h, d / 2 - 0.05], 0.008, 'woodMid');
    b.cylinder([0, h, -0.2], 0.1, 0.04, 'porcelain', { topRadius: 0.13 });
    for (const [x, z] of [
      [-0.03, -0.23],
      [0.04, -0.17],
      [0.02, -0.25],
    ] as const)
      b.ellipsoid([x, h + 0.07, z], [0.035, 0.03, 0.035], 'fabricOrange');
    b.ellipsoid([0, h + 0.07, 0.2], [0.07, 0.065, 0.07], 'porcelain');
    for (const x of [-0.12, 0.12]) b.cylinder([x, h, 0.3], 0.03, 0.06, 'porcelain', { topRadius: 0.034 });
  },

  floorCushion: (b, { w, d, h }, rand) => {
    const tint = rand() > 0.5 ? '#F2EBDD' : '#E9E0CF';
    b.rounded([-w / 2, 0.012, -d / 2], [w / 2, h, d / 2], 0.06, 'fabricBeige', { tint });
  },

  tansu: (b, { w, d, h }) => {
    carcase(b, w, d, h, 'woodMid', 'woodLight', 2, 3, 0.04);
    b.box([-w / 2 - 0.01, h, -d / 2 - 0.01], [w / 2 + 0.01, h + 0.025, d / 2 + 0.01], 'woodDark');
    b.rounded([-w / 2 + 0.1, h + 0.025, -0.1], [-w / 2 + 0.34, h + 0.1, 0.08], 0.01, 'lacquerRed');
  },

  kyodai: (b, { w, d, h }) => {
    // The mother's dresser: a low two-drawer chest, a tall mirror standing on it with a rounded
    // top, a cloth over its crest.
    const base = 0.36;
    carcase(b, w, d, base, 'woodMid', 'woodLight', 1, 2, 0.03);
    const mw = w * 0.72;
    const mz = -d / 2 + 0.09;
    b.box([-mw / 2 - 0.03, base, mz - 0.03], [-mw / 2, h - 0.12, mz + 0.03], 'woodDark');
    b.box([mw / 2, base, mz - 0.03], [mw / 2 + 0.03, h - 0.12, mz + 0.03], 'woodDark');
    b.box([-mw / 2, base + 0.06, mz - 0.02], [mw / 2, h - 0.12, mz + 0.02], 'woodDark');
    b.box(
      [-mw / 2 + 0.02, base + 0.08, mz + 0.02],
      [mw / 2 - 0.02, h - 0.14, mz + 0.024],
      'steel',
      undefined,
      {
        tint: '#E4ECEF',
      },
    );
    b.ellipsoid([0, h - 0.12, mz], [mw / 2 + 0.03, 0.12, 0.03], 'woodDark');
    b.box([-mw / 2, h - 0.2, mz + 0.024], [mw / 2, h - 0.08, mz + 0.03], 'fabricOrange', undefined, {
      tint: '#F4C9C0',
    });
  },

  oshiireShelf: (b, { w, d, h }) => {
    // The 中段 the futons are folded onto, the 枕棚 above, boxes on the floor under both.
    b.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], 'woodLight');
    b.box([-w / 2, h - 0.08, d / 2 - 0.04], [w / 2, h - 0.03, d / 2], 'woodLight');
    b.box([-w / 2, 1.78, -d / 2], [w / 2, 1.8, -d / 2 + 0.45], 'woodLight');
    for (const [y, material, tint] of [
      [0, 'futonGreen', '#FFFFFF'],
      [0.11, 'sheetWhite', '#F6F6F0'],
      [0.22, 'fabricBeige', '#E8D7C5'],
      [0.33, 'futonGreen', '#E3EAD9'],
    ] as const)
      b.rounded(
        [-w / 2 + 0.05, h + y, -d / 2 + 0.04],
        [w / 2 - 0.08, h + y + 0.1, d / 2 - 0.05],
        0.04,
        material,
        { tint },
      );
    b.box([-w / 2 + 0.06, 0, -d / 2 + 0.08], [-0.05, 0.32, d / 2 - 0.12], 'woodLight', undefined, {
      tint: '#C9A87A',
    });
    b.box([0.05, 0, -d / 2 + 0.1], [w / 2 - 0.08, 0.26, d / 2 - 0.15], 'woodLight', undefined, {
      tint: '#B8C6D6',
    });
  },

  getabako: (b, { w, d, h }) => {
    carcase(b, w, d, h, 'woodLight', 'woodLight', 3, 1, 0.08);
    b.rounded(
      [-w / 2 - 0.015, h, -d / 2 - 0.015],
      [w / 2 + 0.015, h + 0.03, d / 2 + 0.015],
      0.006,
      'woodMid',
    );
    // Two pairs of shoes left on the tiles in front of it.
    for (const [x, tint] of [
      [0.1, '#3B3530'],
      [0.35, '#7A4B2E'],
    ] as const) {
      for (const s of [-0.055, 0.055]) {
        b.rounded(
          [x + s - 0.04, 0.001, d / 2 + 0.2],
          [x + s + 0.04, 0.07, d / 2 + 0.45],
          0.03,
          'plasticDark',
          { tint },
        );
      }
    }
  },

  umbrellaStand: (b, { w, h }) => {
    b.cylinder([0, 0, 0], w / 2 - 0.01, h, 'porcelain', { topRadius: w / 2 });
    for (const [x, z, tint] of [
      [0.03, 0.02, '#2A3F66'],
      [-0.035, -0.01, '#B53A33'],
      [0.0, -0.04, '#D8C08A'],
    ] as const) {
      b.cylinder([x, h - 0.2, z], 0.012, 0.45, 'blackMetal', { tint });
      b.ellipsoid([x, h + 0.25, z + 0.04], [0.012, 0.012, 0.05], 'woodDark');
    }
  },

  mat: (b, { w, d, h }) => {
    // The hall mat of ground-1.jpg: blue ends, a pale field, a blue diamond in the middle.
    b.box([-w / 2, 0, -d / 2], [w / 2, h, d / 2], 'matBlue', undefined, { solid: false });
    b.box(
      [-w / 2 + 0.12, 0, -d / 2 + 0.03],
      [w / 2 - 0.12, h + 0.001, d / 2 - 0.03],
      'fabricCream',
      undefined,
      {
        solid: false,
        tint: '#F4E2E0',
      },
    );
    b.box([-0.05, 0, -0.05], [0.05, h + 0.002, 0.05], 'matBlue', undefined, { solid: false });
  },

  phoneStand: (b, { w, d, h }) => {
    carcase(b, w, d, h - 0.03, 'woodMid', 'woodMid', 1, 1, 0.04);
    b.rounded([-w / 2 - 0.01, h - 0.03, -d / 2 - 0.01], [w / 2 + 0.01, h, d / 2 + 0.01], 0.006, 'woodDark');
  },

  phone: (b, { w, d }) => {
    // The grey-blue push-button set of ground-1.jpg, its handset across the top.
    b.rounded([-w / 2, 0, -d / 2], [w / 2, 0.07, d / 2], 0.02, 'plasticLight');
    b.box([-w / 2 + 0.04, 0.07, 0.0], [w / 2 - 0.04, 0.072, d / 2 - 0.02], 'plasticDark');
    b.rounded(
      [-w / 2 - 0.01, 0.07, -d / 2 + 0.01],
      [w / 2 + 0.01, 0.11, -d / 2 + 0.07],
      0.02,
      'plasticLight',
    );
  },

  sideboard: (b, { w, d, h }) => {
    carcase(b, w, d, h, 'woodMid', 'woodLight', 2, 2, 0.05);
    b.box([-w / 2 - 0.01, h, -d / 2 - 0.01], [w / 2 + 0.01, h + 0.02, d / 2 + 0.01], 'woodDark');
    b.cylinder([0.25, h + 0.02, 0], 0.07, 0.03, 'porcelain', { topRadius: 0.1 });
  },

  trashBin: (b, { w, h }) => {
    b.cylinder([0, 0, 0], w / 2 - 0.02, h - 0.03, 'enamel', { topRadius: w / 2 });
    b.cylinder([0, h - 0.03, 0], w / 2 + 0.005, 0.03, 'plasticDark');
  },

  diningTable: (b, { w, d, h }, rand) => {
    b.rounded([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], 0.01, 'formica');
    b.box([-w / 2 + 0.05, h - 0.1, -d / 2 + 0.05], [w / 2 - 0.05, h - 0.03, d / 2 - 0.05], 'woodMid');
    legs(b, w, d, h - 0.03, 0.05, 0.06, 'woodMid');
    plant(b.at(0, h, 0), 0.2, 0.3, rand);
    b.cylinder([0.3, h, 0.1], 0.025, 0.1, 'glass');
    b.cylinder([0.3, h + 0.1, 0.1], 0.015, 0.025, 'lacquerRed');
  },

  chair: (b, { w, d, h }) => {
    const seat = 0.44;
    legs(b, w, d, seat - 0.04, 0.035, 0.02, 'woodDark');
    b.rounded([-w / 2, seat - 0.05, -d / 2], [w / 2, seat, d / 2], 0.02, 'fabricCream', { tint: '#F4F2EC' });
    for (const x of [-w / 2 + 0.02, w / 2 - 0.055])
      b.box([x, seat, -d / 2 + 0.02], [x + 0.035, h, -d / 2 + 0.055], 'woodDark');
    b.rounded(
      [-w / 2 + 0.02, h - 0.2, -d / 2 + 0.015],
      [w / 2 - 0.02, h - 0.02, -d / 2 + 0.06],
      0.015,
      'fabricCream',
      {
        tint: '#F4F2EC',
      },
    );
  },

  counterRun: (b, { w, d, h }) => {
    // The drawing's run along the back wall: the gas table at the garden end, the sink under
    // the window, a wall cupboard and the rice cooker toward the fridge.
    const top = h - 0.03;
    carcase(b, w, d - 0.02, top, 'cabinetCream', 'cabinetCream', Math.round(w / 0.45), 1, 0.1);
    b.box([-w / 2, top, -d / 2], [w / 2, h, d / 2], 'steel');
    const sinkX = 0.1;
    b.box([sinkX - 0.38, h, -0.2], [sinkX + 0.38, h + 0.004, 0.2], 'steel', undefined, { tint: '#DDE1E4' });
    b.box([sinkX - 0.34, h + 0.004, -0.17], [sinkX + 0.34, h + 0.006, 0.17], 'steel', undefined, {
      tint: '#9AA1A6',
    });
    b.cylinder([sinkX, h, -0.26], 0.018, 0.28, 'steel');
    b.box([sinkX - 0.012, h + 0.26, -0.26], [sinkX + 0.012, h + 0.28, -0.08], 'steel');
    const hobX = -w / 2 + 0.45;
    b.rounded([hobX - 0.3, h, -0.22], [hobX + 0.3, h + 0.08, 0.22], 0.015, 'hob');
    for (const x of [hobX - 0.15, hobX + 0.15]) {
      b.cylinder([x, h + 0.08, 0], 0.08, 0.012, 'blackMetal');
      b.cylinder([x, h + 0.092, 0], 0.045, 0.012, 'hob');
    }
    b.cylinder([hobX + 0.15, h + 0.104, 0], 0.09, 0.16, 'steel', { topRadius: 0.07 });
    b.box([hobX + 0.15 - 0.15, h + 0.19, -0.012], [hobX + 0.15 - 0.07, h + 0.21, 0.012], 'steel');
    b.rounded([hobX - 0.35, 1.55, -d / 2], [hobX + 0.35, 1.9, -d / 2 + 0.5], 0.015, 'steel');
    carcase(
      b.at(w / 2 - 0.35, 1.5, -d / 2 + 0.175),
      0.7,
      0.35,
      0.7,
      'cabinetCream',
      'cabinetCream',
      2,
      1,
      0.001,
    );
    b.rounded([w / 2 - 0.38, h, -0.15], [w / 2 - 0.1, h + 0.24, 0.13], 0.1, 'enamel');
    b.box([w / 2 - 0.28, h + 0.1, 0.13], [w / 2 - 0.2, h + 0.14, 0.135], 'plasticDark');
  },

  fridge: (b, { w, d, h }) => {
    b.rounded([-w / 2, 0.02, -d / 2], [w / 2, h, d / 2], 0.03, 'enamel', { tint: '#F4F1EA' });
    b.box(
      [-w / 2 + 0.01, h * 0.64, d / 2 - 0.004],
      [w / 2 - 0.01, h * 0.64 + 0.012, d / 2 + 0.002],
      'plasticDark',
    );
    for (const [y0, y1] of [
      [h * 0.68, h * 0.9],
      [h * 0.3, h * 0.6],
    ] as const)
      b.box([w / 2 - 0.08, y0, d / 2], [w / 2 - 0.06, y1, d / 2 + 0.03], 'steel');
  },

  dishCabinet: (b, { w, d, h }, rand) => {
    // 食器棚: doors below, glazed doors above with the plates and bowls behind them.
    const low = 0.85;
    carcase(b, w, d, low, 'woodMid', 'woodLight', 2, 1, 0.05);
    b.box([-w / 2, low, -d / 2], [w / 2, low + 0.02, d / 2], 'woodDark');
    const s = 0.025;
    b.box([-w / 2, low + 0.02, -d / 2], [-w / 2 + s, h, d / 2 - 0.04], 'woodMid');
    b.box([w / 2 - s, low + 0.02, -d / 2], [w / 2, h, d / 2 - 0.04], 'woodMid');
    b.box([-w / 2, h - s, -d / 2], [w / 2, h, d / 2 - 0.04], 'woodMid');
    b.box([-w / 2 + s, low + 0.02, -d / 2], [w / 2 - s, h - s, -d / 2 + 0.01], 'woodMid');
    for (const y of [low + 0.3, low + 0.62])
      b.box([-w / 2 + s, y - 0.015, -d / 2 + 0.01], [w / 2 - s, y, d / 2 - 0.05], 'woodMid');
    for (const y of [low + 0.02, low + 0.3, low + 0.62]) {
      for (let x = -w / 2 + 0.12; x < w / 2 - 0.1; x += 0.17) {
        if (rand() > 0.5) b.cylinder([x, y, -0.02], 0.07, 0.03, 'porcelain', { topRadius: 0.09 });
        else b.cylinder([x, y, -0.02], 0.045, 0.07, 'porcelain', { topRadius: 0.065 });
      }
    }
    b.box([-w / 2 + s, low + 0.04, d / 2 - 0.05], [w / 2 - s, h - s, d / 2 - 0.045], 'glass');
  },

  riceBin: (b, { w, d, h }) => {
    carcase(b, w, d, h - 0.02, 'woodLight', 'woodLight', 1, 2, 0.04);
    b.box([-w / 2 - 0.005, h - 0.02, -d / 2 - 0.005], [w / 2 + 0.005, h, d / 2 + 0.005], 'formica');
  },

  toilet: (b, { d }) => {
    // Cistern against the wall, pedestal, bowl and seat.
    b.rounded([-0.2, 0.42, -d / 2], [0.2, 0.82, -d / 2 + 0.18], 0.03, 'porcelain');
    b.rounded([-0.21, 0.82, -d / 2 - 0.005], [0.21, 0.85, -d / 2 + 0.19], 0.012, 'porcelain', {
      tint: '#F0F0EC',
    });
    b.box([0.12, 0.84, -d / 2 + 0.05], [0.16, 0.86, -d / 2 + 0.09], 'steel');
    b.cylinder([0, 0, 0.02], 0.12, 0.3, 'porcelain', { topRadius: 0.15 });
    b.ellipsoid([0, 0.33, 0.06], [0.19, 0.08, 0.25], 'porcelain');
    b.ellipsoid([0, 0.405, 0.06], [0.195, 0.022, 0.255], 'porcelain', 0, 0, { tint: '#EEF0F2' });
    b.rounded([-0.19, 0.41, -d / 2 + 0.17], [0.19, 0.83, -d / 2 + 0.2], 0.02, 'porcelain', {
      tint: '#EEF0F2',
    });
  },

  vanity: (b, { w, d, h }) => {
    carcase(b, w, d, h - 0.1, 'cabinetCream', 'cabinetCream', 2, 1, 0.08);
    b.rounded([-w / 2, h - 0.1, -d / 2], [w / 2, h, d / 2], 0.02, 'porcelain');
    b.box(
      [-w / 2 + 0.07, h - 0.001, -d / 2 + 0.1],
      [w / 2 - 0.07, h + 0.002, d / 2 - 0.05],
      'steel',
      undefined,
      {
        tint: '#E7ECEF',
      },
    );
    b.cylinder([0, h, -d / 2 + 0.05], 0.014, 0.16, 'steel');
    // The mirror cabinet on the wall behind.
    b.rounded([-w / 2, 1.05, -d / 2], [w / 2, 1.75, -d / 2 + 0.13], 0.01, 'cabinetCream');
    b.box([-w / 2 + 0.03, 1.08, -d / 2 + 0.13], [w / 2 - 0.03, 1.72, -d / 2 + 0.135], 'steel', undefined, {
      tint: '#DCE6EA',
    });
  },

  washingMachine: (b, { w, d, h }) => {
    // The drawing's round lid seen from above: a top-loader, controls along the back.
    b.rounded([-w / 2, 0.02, -d / 2], [w / 2, h, d / 2], 0.03, 'enamel');
    b.box([-w / 2 + 0.02, h, -d / 2 + 0.02], [w / 2 - 0.02, h + 0.08, -d / 2 + 0.12], 'enamel', undefined, {
      tint: '#E4E8EC',
    });
    b.cylinder([0, h, 0.04], 0.21, 0.015, 'plasticLight');
    b.cylinder([0, h + 0.015, 0.04], 0.16, 0.006, 'screen');
    for (const x of [-0.15, 0.15]) disc(b, x, h + 0.045, -d / 2 + 0.125, 0.02, 0.012, 'steel');
  },

  bathtub: (b, { w, d, h }) => {
    // A deep Japanese tub: enamel shell, a wide rim, the water well up it, the lid rolled at
    // one end, and the shower on the wall above.
    const rim = 0.07;
    b.box([-w / 2, 0, -d / 2], [w / 2, 0.08, d / 2], 'enamel');
    b.rounded([-w / 2, 0, -d / 2], [-w / 2 + rim, h, d / 2], 0.02, 'enamel');
    b.rounded([w / 2 - rim, 0, -d / 2], [w / 2, h, d / 2], 0.02, 'enamel');
    b.rounded([-w / 2 + rim - 0.01, 0, -d / 2], [w / 2 - rim + 0.01, h, -d / 2 + rim], 0.02, 'enamel');
    b.rounded([-w / 2 + rim - 0.01, 0, d / 2 - rim], [w / 2 - rim + 0.01, h, d / 2], 0.02, 'enamel');
    b.box([-w / 2 + rim, 0.08, -d / 2 + rim], [w / 2 - rim, 0.09, d / 2 - rim], 'bathFloor');
    b.box([-w / 2 + rim, 0.09, -d / 2 + rim], [w / 2 - rim, h - 0.12, d / 2 - rim], 'water');
    b.rounded([w / 2 - 0.3, h, -d / 2 + 0.02], [w / 2 - 0.04, h + 0.16, d / 2 - 0.02], 0.07, 'porcelain', {
      tint: '#C9D9E0',
    });
    b.box([-w / 2 + 0.2, 0.9, -d / 2 - 0.02], [-w / 2 + 0.4, 0.98, -d / 2 + 0.03], 'steel');
    b.box([-w / 2 + 0.28, 0.98, -d / 2 - 0.015], [-w / 2 + 0.3, 1.75, -d / 2 + 0.0], 'steel');
    b.ellipsoid([-w / 2 + 0.29, 1.78, -d / 2 + 0.05], [0.045, 0.02, 0.06], 'steel', 0, -0.5);
  },

  bathStool: (b, { w, d, h }) => {
    // A wash stool and its bucket.
    b.rounded([-w / 2, h - 0.04, -d / 2], [w / 2, h, d / 2], 0.02, 'plasticLight', { tint: '#F4F1E8' });
    for (const x of [-w / 2 + 0.02, w / 2 - 0.05])
      b.box([x, 0, -d / 2 + 0.03], [x + 0.03, h - 0.04, d / 2 - 0.03], 'plasticLight');
    b.cylinder([0, h, 0], 0.09, 0.1, 'woodLight', { topRadius: 0.1 });
  },

  studyDesk: (b, { w, d, h }, rand) => {
    // Nobita's desk: a drawer pedestal on the right, the long centre drawer the time machine
    // opens out of, a book hutch across the back of the top and a lamp on the left.
    const top = h - 0.03;
    const ped = 0.38;
    b.rounded([-w / 2, top, -d / 2], [w / 2, h, d / 2], 0.008, 'woodMid');
    carcase(b.at(w / 2 - ped / 2, 0, 0), ped, d, top, 'woodMid', 'woodLight', 1, 3, 0.04);
    b.box([-w / 2, 0, -d / 2], [-w / 2 + 0.03, top, d / 2], 'woodMid');
    b.box([-w / 2 + 0.03, 0.3, -d / 2], [w / 2 - ped, top, -d / 2 + 0.02], 'woodMid');
    b.box([-w / 2 + 0.03, top - 0.1, -d / 2 + 0.02], [w / 2 - ped, top, d / 2], 'woodMid');
    b.box([-w / 2 + 0.05, top - 0.09, d / 2], [w / 2 - ped - 0.02, top - 0.01, d / 2 + 0.012], 'woodLight');
    b.box([-0.14, top - 0.06, d / 2 + 0.012], [-0.08, top - 0.045, d / 2 + 0.028], 'blackMetal');
    // The hutch and its books.
    const hy = h + 0.34;
    const hd = 0.2;
    for (const x of [-w / 2, w / 2 - 0.02]) b.box([x, h, -d / 2], [x + 0.02, hy, -d / 2 + hd], 'woodMid');
    b.box([-w / 2, hy - 0.02, -d / 2], [w / 2, hy, -d / 2 + hd], 'woodMid');
    b.box([-w / 2 + 0.02, h, -d / 2], [w / 2 - 0.02, hy - 0.02, -d / 2 + 0.01], 'woodMid');
    let x = -w / 2 + 0.3;
    while (x < w / 2 - 0.06) {
      const bw = 0.025 + rand() * 0.03;
      const bh = 0.18 + rand() * 0.1;
      const tint = ['#C0463A', '#3F6EA8', '#E7D9A8', '#4E8A55', '#EEE8DA', '#E0A43A'][Math.floor(rand() * 6)];
      book(b, x, Math.min(x + bw, w / 2 - 0.03), h, h + bh, -d / 2 + 0.02, -d / 2 + hd - 0.02, tint);
      x += bw + 0.003;
    }
    // The lamp on the left, a comic and a pencil box on the top.
    const lx = -w / 2 + 0.14;
    const lz = -d / 2 + 0.1;
    b.cylinder([lx, h, lz], 0.07, 0.025, 'blackMetal', { topRadius: 0.06 });
    b.cylinder([lx, h + 0.025, lz], 0.01, 0.3, 'steel');
    b.cylinder([lx, h + 0.26, lz + 0.09], 0.075, 0.1, 'enamel', { topRadius: 0.03, tint: '#E9C548' });
    b.box([-0.1, h, 0.02], [0.12, h + 0.012, 0.18], 'sheetWhite', undefined, { tint: '#F2D25C' });
    b.box([0.2, h, 0.06], [0.38, h + 0.02, 0.12], 'lacquerRed');
  },

  doraBed: (b, { w, d, h }) => {
    // Doraemon's bed: the 押し入れ's middle shelf with a mattress, a blue quilt turned down and a
    // pillow at one end, his dorayaki by it; the upper shelf over it, boxes on the floor below.
    b.box([-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2], 'woodLight');
    b.box([-w / 2, h - 0.08, d / 2 - 0.04], [w / 2, h, d / 2], 'woodMid');
    b.box([-w / 2, 1.78, -d / 2], [w / 2, 1.8, -d / 2 + 0.45], 'woodLight');
    const x0 = -w / 2 + 0.05;
    b.rounded([x0, h, -d / 2 + 0.05], [x0 + 1.6, h + 0.08, d / 2 - 0.08], 0.03, 'sheetWhite');
    b.rounded([x0, h + 0.05, -d / 2 + 0.03], [x0 + 1.15, h + 0.15, d / 2 - 0.05], 0.04, 'futonBlue');
    b.rounded([x0 + 1.25, h + 0.07, -0.17], [x0 + 1.55, h + 0.17, 0.15], 0.04, 'sheetWhite', {
      tint: '#F6E7EC',
    });
    const px = x0 + 1.9;
    b.cylinder([px, h, 0], 0.1, 0.015, 'porcelain', { topRadius: 0.11 });
    for (const y of [0.015, 0.045]) b.cylinder([px, h + y, 0], 0.065, 0.03, 'dorayaki', { topRadius: 0.06 });
    for (const [bx0, bx1, bh, tint] of [
      [-w / 2 + 0.08, -w / 2 + 0.6, 0.34, '#FFFFFF'],
      [-w / 2 + 0.66, -w / 2 + 1.1, 0.26, '#E8DCC4'],
      [w / 2 - 0.7, w / 2 - 0.1, 0.4, '#FFFFFF'],
    ] as const)
      b.box([bx0, 0, -d / 2 + 0.06], [bx1, bh, d / 2 - 0.12], 'cardboard', undefined, { tint });
  },

  storageBoxes: (b, { w, d, h }) => {
    // A storeroom stack: cardboard boxes, a clear bin, a suitcase stood on end.
    b.box([-w / 2, 0, -d / 2], [w / 2 - 0.02, 0.36, d / 2 - 0.05], 'cardboard');
    b.box([-w / 2 + 0.03, 0.36, -d / 2 + 0.03], [w / 2 - 0.1, 0.66, d / 2 - 0.1], 'cardboard', undefined, {
      tint: '#E4D6BE',
    });
    b.rounded([-w / 2 + 0.05, 0.66, -d / 2 + 0.05], [w / 2 - 0.15, 0.9, d / 2 - 0.15], 0.02, 'plasticLight', {
      tint: '#DCE6EE',
    });
    b.box([-w / 2 + 0.1, 0.9, -d / 2 + 0.08], [0.05, h, d / 2 - 0.2], 'cardboard', undefined, {
      tint: '#F2EBDD',
    });
  },
};
