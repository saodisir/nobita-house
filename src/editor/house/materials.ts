import {
  BackSide,
  Color,
  type Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  Vector2,
} from 'three';

/** Surface tiles shipped in `public/textures/editor/` by `scripts/editor-textures.py`. */
export const TILE_NAMES = [
  'stucco',
  'concrete',
  'wood',
  'tatami',
  'fabric',
  'jute',
  'bathtile',
  'stonetile',
  'brushed',
  'enamel',
  'formica',
  'katagarasu',
  'shoji',
  'cardboard',
  'bookcloth',
  'clay',
  'glaze',
  'leaf',
] as const;
export type TileName = (typeof TILE_NAMES)[number];

export const tileUrl = (tile: TileName, map: 'albedo' | 'normal') => `/textures/editor/${tile}-${map}.webp`;

export interface MaterialSpec {
  color: string;
  /** Neutral tile the colour tints; absent means a flat colour. */
  tile?: TileName;
  /** Metres of surface one tile repeat covers. UVs are baked in metres / repeat. */
  repeat?: number;
  normal?: number;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  /** Glass and water: seen through, so they neither cast shadows nor fill the section cap. */
  seeThrough?: boolean;
}

/**
 * Every finish in the house. Repeats are the real unit sizes, so a tatami weave repeats once per
 * mat width and a bath tile is 10 cm whichever object it lands on. The tiles are neutral; `color` sets the hue.
 */
export const MATERIALS = {
  // --- shell ---------------------------------------------------------------------------------
  stucco: { color: '#EDE2C8', tile: 'stucco', repeat: 2.2, normal: 0.55, roughness: 0.95 },
  concrete: { color: '#B8B3A9', tile: 'concrete', repeat: 1.8, normal: 0.6, roughness: 0.95 },
  paving: { color: '#C9C4BA', tile: 'concrete', repeat: 1.2, normal: 0.5, roughness: 0.95 },
  /** Flat taupe on every cut and wall top, so the plan reads as poché. */
  cap: { color: '#857A6E', roughness: 1 },
  plaster: { color: '#F3EFE6', tile: 'stucco', repeat: 1.6, normal: 0.35, roughness: 0.95 },
  plasterWarm: { color: '#F2E8D5', tile: 'stucco', repeat: 1.6, normal: 0.35, roughness: 0.95 },
  /** Juraku sand wall of the tatami room: a coarser grain and a clay colour. */
  juraku: { color: '#DCCBA6', tile: 'stucco', repeat: 0.9, normal: 0.7, roughness: 1 },
  bathWall: { color: '#E6ECEE', tile: 'bathtile', repeat: 0.4, normal: 0.6, roughness: 0.35 },
  bathFloor: { color: '#CBD5DA', tile: 'bathtile', repeat: 0.4, normal: 0.6, roughness: 0.5 },
  /**
   * The mint plaster of the genkan, the hallway and the stairwell in ground-1.jpg, whose walls
   * sample at #9AB3B0 in shade. Rendered under this rig's sky and bounce, this albedo lands on
   * that colour; the hall is too narrow for the sun to add much.
   */
  plasterMint: { color: '#B3D2C8', tile: 'stucco', repeat: 1.6, normal: 0.3, roughness: 0.95 },
  /** The underside of the upper floor, the downstairs ceilings under it: plain boards. */
  ceilingBoard: { color: '#E2D2B4', tile: 'wood', repeat: 0.9, normal: 0.35, roughness: 0.8 },
  /** The genkan's light blue tiles, 25 cm squares: four to a bath-tile repeat of 1 m. */
  genkanFloor: { color: '#A9C9D6', tile: 'bathtile', repeat: 1.0, normal: 0.5, roughness: 0.6 },
  /** The 勝手口's mortar floor. */
  domaFloor: { color: '#A39E94', tile: 'concrete', repeat: 1.2, normal: 0.6, roughness: 0.95 },
  /** Showa cushion vinyl in 30 cm squares. */
  kitchenFloor: { color: '#CDC3AC', tile: 'stonetile', repeat: 0.6, normal: 0.35, roughness: 0.7 },
  /** The hallway's golden boards in ground-1.jpg. */
  floorWood: { color: '#DDA962', tile: 'wood', repeat: 1.2, normal: 0.5, roughness: 0.55 },
  floorWoodLight: { color: '#E4C8A0', tile: 'wood', repeat: 1.2, normal: 0.5, roughness: 0.6 },
  /** The dark underlay that shows through the 3 mm joints between floorboards. */
  plankJoint: { color: '#3A2A1D', roughness: 1 },
  tatami: { color: '#E0D6BA', tile: 'tatami', repeat: 0.91, normal: 0.45, roughness: 0.9 },
  tatamiBorder: { color: '#2E3A32', tile: 'fabric', repeat: 0.2, normal: 0.4, roughness: 0.9 },
  trim: { color: '#8C5B33', tile: 'wood', repeat: 0.8, normal: 0.6, roughness: 0.6 },
  /** The polished step board between the genkan and the raised floor. */
  kamachi: { color: '#5B3920', tile: 'wood', repeat: 1.2, normal: 0.6, roughness: 0.4 },
  stairWood: { color: '#B97A41', tile: 'wood', repeat: 0.9, normal: 0.6, roughness: 0.5 },
  /** The interior doors of ground-1.jpg: pale yellow timber in brown frames. */
  doorYellow: { color: '#E3C47E', tile: 'wood', repeat: 0.9, normal: 0.45, roughness: 0.55 },
  /** The front door's terracotta paint. */
  doorFront: { color: '#C9735A', tile: 'wood', repeat: 0.9, normal: 0.35, roughness: 0.5 },
  /** Weathered boards of the garden step. */
  engawaWood: { color: '#BDA27F', tile: 'wood', repeat: 0.8, normal: 0.7, roughness: 0.85 },
  // --- roofs, after home.jpg ----------------------------------------------------------------
  /** Red-brown fired tiles: home.jpg's roof edges and hoods sample #B77959–#BC5639 at sunset. */
  roofTile: { color: '#A9523A', tile: 'concrete', repeat: 0.9, normal: 0.45, roughness: 0.75 },
  /** The ridge and its end tiles, a shade darker. */
  roofRidge: { color: '#8E4431', tile: 'concrete', repeat: 0.9, normal: 0.4, roughness: 0.7 },
  /** Barge boards and fascias, painted the cream of the walls' trim. */
  fascia: { color: '#EFE3CB', tile: 'wood', repeat: 1.2, normal: 0.3, roughness: 0.7 },
  /** The underside of the eaves. */
  soffit: { color: '#E6DAC2', tile: 'wood', repeat: 0.9, normal: 0.3, roughness: 0.85 },
  /** Gutters and downpipes, the brown of home.jpg's pipes. */
  gutter: { color: '#7E4632', tile: 'enamel', repeat: 0.5, normal: 0.2, roughness: 0.55 },
  // Metals are kept mostly diffuse: with no environment map a metallic surface has nothing to
  // reflect and renders near black.
  sash: { color: '#B6BBBE', tile: 'brushed', repeat: 0.3, normal: 0.15, roughness: 0.45, metalness: 0.25 },
  glass: { color: '#CFE3EA', roughness: 0.05, opacity: 0.18, seeThrough: true },
  /** The faintly blue panes of the 居間's hall door. */
  doorGlass: { color: '#B9D3E6', roughness: 0.1, opacity: 0.5, seeThrough: true },
  frosted: {
    color: '#E9EFF1',
    tile: 'katagarasu',
    repeat: 0.12,
    normal: 0.9,
    roughness: 0.3,
    opacity: 0.78,
    seeThrough: true,
  },
  fusumaPaper: { color: '#EEE6D2', tile: 'shoji', repeat: 0.9, normal: 0.25, roughness: 0.9 },
  // --- furniture -----------------------------------------------------------------------------
  woodMid: { color: '#A06B3E', tile: 'wood', repeat: 0.6, normal: 0.6, roughness: 0.55 },
  woodDark: { color: '#5E3C24', tile: 'wood', repeat: 0.5, normal: 0.6, roughness: 0.5 },
  woodLight: { color: '#D3B286', tile: 'wood', repeat: 0.6, normal: 0.5, roughness: 0.6 },
  fabricCream: { color: '#E6D9BF', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  fabricBeige: { color: '#D9C8A6', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  fabricOrange: { color: '#D9623A', tile: 'fabric', repeat: 0.2, normal: 0.45, roughness: 0.95 },
  curtainTeal: { color: '#3E8886', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  curtainGreen: { color: '#79A67E', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  curtainBlue: { color: '#6F8FB8', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  futonGreen: { color: '#94AE8C', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  /** Doraemon's quilt. */
  futonBlue: { color: '#5E9BD6', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  kotatsuQuilt: { color: '#B86A48', tile: 'fabric', repeat: 0.3, normal: 0.45, roughness: 0.95 },
  matBlue: { color: '#6F9FC4', tile: 'fabric', repeat: 0.25, normal: 0.4, roughness: 0.95 },
  sheetWhite: { color: '#F3F0E8', tile: 'fabric', repeat: 0.3, normal: 0.3, roughness: 0.95 },
  /** Book spines: buckram at 0.15 m a repeat, white so each book's tint sets its colour. */
  bookCloth: { color: '#F3F0E8', tile: 'bookcloth', repeat: 0.15, normal: 0.45, roughness: 0.85 },
  rugJute: { color: '#CDBFA3', tile: 'jute', repeat: 0.45, normal: 0.7, roughness: 1 },
  rugBorder: { color: '#8C7B62', tile: 'jute', repeat: 0.45, normal: 0.5, roughness: 1 },
  steel: { color: '#C8CCCF', tile: 'brushed', repeat: 0.5, normal: 0.2, roughness: 0.4, metalness: 0.3 },
  enamel: { color: '#F2F1EC', tile: 'enamel', repeat: 0.5, normal: 0.15, roughness: 0.35 },
  porcelain: { color: '#FAFAF6', tile: 'enamel', repeat: 0.3, normal: 0.1, roughness: 0.25 },
  cabinetCream: { color: '#EDE5D2', tile: 'enamel', repeat: 0.6, normal: 0.1, roughness: 0.5 },
  formica: { color: '#EEE7D8', tile: 'formica', repeat: 0.5, normal: 0.15, roughness: 0.45 },
  /** Moulded plastic: the glaze tile's fine speckle reads as an injection-moulded skin. */
  plasticDark: { color: '#2F3336', tile: 'glaze', repeat: 0.25, normal: 0.3, roughness: 0.6 },
  plasticLight: { color: '#C3CEDD', tile: 'glaze', repeat: 0.25, normal: 0.3, roughness: 0.5 },
  screen: { color: '#1C2224', tile: 'glaze', repeat: 0.4, normal: 0.05, roughness: 0.15, metalness: 0.2 },
  hob: { color: '#26282A', tile: 'brushed', repeat: 0.3, normal: 0.25, roughness: 0.5, metalness: 0.3 },
  blackMetal: {
    color: '#2B2B2B',
    tile: 'brushed',
    repeat: 0.3,
    normal: 0.25,
    roughness: 0.45,
    metalness: 0.5,
  },
  lacquerRed: { color: '#B3322D', tile: 'wood', repeat: 0.5, normal: 0.3, roughness: 0.35 },
  /** Leaf blades: the tile's midrib and veins at one leaf a repeat. The tile is pale green, so the tints run light. */
  leaf: { color: '#5A9142', tile: 'leaf', repeat: 0.12, normal: 0.5, roughness: 0.7 },
  leafLight: { color: '#80B452', tile: 'leaf', repeat: 0.12, normal: 0.5, roughness: 0.7 },
  blossomPink: { color: '#F7A3C4', tile: 'leaf', repeat: 0.05, normal: 0.3, roughness: 0.7 },
  /** Thrown terracotta: the clay tile's throwing rings run round the pot. */
  potTerracotta: { color: '#C9774B', tile: 'clay', repeat: 0.25, normal: 0.6, roughness: 0.9 },
  potWhite: { color: '#ECEAE4', tile: 'enamel', repeat: 0.3, normal: 0.1, roughness: 0.4 },
  soil: { color: '#46352A', tile: 'concrete', repeat: 0.25, normal: 0.9, roughness: 1 },
  /** Doraemon's favourite: two baked pancakes, a bean-paste seam between; the stucco grain reads as crumb. */
  dorayaki: { color: '#C98247', tile: 'stucco', repeat: 0.15, normal: 0.6, roughness: 0.7 },
  /** Kraft board, the corrugation's flutes faint through the liner at their real 5 mm pitch. */
  cardboard: { color: '#C6A175', tile: 'cardboard', repeat: 0.3, normal: 0.35, roughness: 0.95 },
  water: { color: '#8CC2D4', roughness: 0.05, opacity: 0.75, seeThrough: true },
} as const satisfies Record<string, MaterialSpec>;

export type MaterialKey = keyof typeof MATERIALS;

/** The spec behind a key, widened: `as const` narrows every entry to its own literal shape. */
export const specOf = (key: MaterialKey): MaterialSpec => MATERIALS[key];

export type TileTextures = Record<TileName, { albedo: Texture; normal: Texture }>;

/**
 * One material per key. Every material reads vertex colours, which the builders use to vary
 * floorboards and furniture parts within one draw call; untinted geometry carries white.
 */
export function createMaterials(tiles: TileTextures): Record<MaterialKey, Material> {
  const out = {} as Record<MaterialKey, Material>;
  for (const key of Object.keys(MATERIALS) as MaterialKey[]) {
    const spec = specOf(key);
    const tex = spec.tile ? tiles[spec.tile] : undefined;
    out[key] = new MeshStandardMaterial({
      name: `house_${key}`,
      color: new Color(spec.color),
      map: tex?.albedo ?? null,
      normalMap: tex?.normal ?? null,
      normalScale: new Vector2(spec.normal ?? 0.5, spec.normal ?? 0.5),
      roughness: spec.roughness ?? 0.8,
      metalness: spec.metalness ?? 0,
      transparent: spec.opacity !== undefined,
      opacity: spec.opacity ?? 1,
      depthWrite: spec.opacity === undefined,
      vertexColors: true,
    });
  }
  return out;
}

/**
 * The section cap: the inside of every closed solid, drawn flat. Where the plan cut opens a
 * wall, the camera looks into that wall's back faces, and this paints them as a solid fill
 * instead of letting the eye fall through a hollow shell. Pushed back in depth, because an
 * opened solid's inner face often lies in the plane of a neighbour's outer one — each stair
 * step's back against the next step's riser — and the visible surface must win that tie.
 */
export function createCapMaterial() {
  return new MeshBasicMaterial({
    name: 'house_section_cap',
    color: new Color(MATERIALS.cap.color),
    side: BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 2,
  });
}

/** Tiles repeat in world metres; the UVs already carry the metres-per-repeat division. */
export function prepareTile(texture: Texture, colour: boolean) {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = 8;
  if (colour) texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}
