import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Matrix4,
  SphereGeometry,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { type MaterialKey, specOf } from './materials';

export type Vec3 = readonly [number, number, number];

/** A box's faces in `BoxGeometry` group order. Each may take its own finish. */
export interface BoxFaces {
  px?: MaterialKey;
  nx?: MaterialKey;
  py?: MaterialKey;
  ny?: MaterialKey;
  pz?: MaterialKey;
  nz?: MaterialKey;
}
const BOX_FACE_ORDER = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const;

export interface PartOptions {
  /** Multiplies the material colour for this part only, e.g. one floorboard a shade darker. */
  tint?: string;
  /** Horizontal faces map `u` along z instead of x: turns a directional grain a quarter turn. */
  turn?: boolean;
  /** False for open surfaces the section cap must not fill. Closed solids are the default. */
  solid?: boolean;
}

interface Bucket {
  position: number[];
  normal: number[];
  uv: number[];
  color: number[];
}

/** A batch's output: one merged geometry per material, and the closed solids for the cap. */
export interface BuiltBatch {
  parts: { material: MaterialKey; geometry: BufferGeometry }[];
  cap: BufferGeometry;
}

/**
 * The house as two storeys. Everything above the ground floor's wall tops is one storey's worth
 * of walls, floor slab, furniture and doors, and the diorama lifts it clear as a unit; keeping
 * it in its own batch is what lets a single group move all of it.
 */
export interface StoreyBatches {
  ground: MeshBatch;
  upper: MeshBatch;
}

/** Where every part lands: one bucket per material, plus the closed solids for the cap. */
class Sink {
  readonly buckets = new Map<MaterialKey, Bucket>();
  readonly cap: number[] = [];
}

const WHITE = [1, 1, 1] as const;

/**
 * Collects the house as triangles, one merged geometry per material, so the whole plan draws
 * in a few dozen calls however many boards and legs it has.
 *
 * Parts are authored in the batch's frame: `at()` returns a view whose parts are placed and
 * turned by a multiple of 90° about Y, which is how every piece of furniture is written — in
 * its own frame, front toward local +z. UVs are projected from final world positions after
 * that transform, so a tile runs on unbroken from one object to the next at its real size.
 */
export class MeshBatch {
  private constructor(
    private readonly sink: Sink,
    private readonly matrix: Matrix4 | null,
  ) {}

  static create() {
    return new MeshBatch(new Sink(), null);
  }

  /** A view with its origin at (x, y, z) in this frame and turned `quarterTurns` × 90° about Y. */
  at(x: number, y: number, z: number, quarterTurns = 0): MeshBatch {
    const local = new Matrix4().makeRotationY((quarterTurns * Math.PI) / 2).setPosition(x, y, z);
    return new MeshBatch(this.sink, this.matrix ? this.matrix.clone().multiply(local) : local);
  }

  box(min: Vec3, max: Vec3, material: MaterialKey, faces?: BoxFaces, options?: PartOptions) {
    const sx = max[0] - min[0];
    const sy = max[1] - min[1];
    const sz = max[2] - min[2];
    // A zero-length pier between two openings is no piece at all.
    if (sx <= 1e-5 || sy <= 1e-5 || sz <= 1e-5) return;
    const geometry = new BoxGeometry(sx, sy, sz);
    geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    const groups = BOX_FACE_ORDER.map((face) => faces?.[face] ?? material);
    this.add(geometry, groups, options);
  }

  /** A box with every edge rounded by `radius`: cushions, mattresses, appliance bodies. */
  rounded(min: Vec3, max: Vec3, radius: number, material: MaterialKey, options?: PartOptions) {
    const sx = max[0] - min[0];
    const sy = max[1] - min[1];
    const sz = max[2] - min[2];
    const r = Math.min(radius, sx / 2, sy / 2, sz / 2) * 0.999;
    const geometry = new RoundedBoxGeometry(sx, sy, sz, 3, r);
    geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    this.add(geometry, [material], options);
  }

  /** An upright cylinder standing on `base`, optionally tapering to `topRadius`. */
  cylinder(
    base: Vec3,
    radius: number,
    height: number,
    material: MaterialKey,
    options?: PartOptions & { topRadius?: number; segments?: number },
  ) {
    const geometry = new CylinderGeometry(
      options?.topRadius ?? radius,
      radius,
      height,
      options?.segments ?? 20,
    );
    geometry.translate(base[0], base[1] + height / 2, base[2]);
    this.add(geometry, [material], options);
  }

  /** A cylinder lying along local x, centred on `centre`: rails, rods, handles, drums. */
  rod(centre: Vec3, radius: number, length: number, material: MaterialKey, options?: PartOptions) {
    const geometry = new CylinderGeometry(radius, radius, length, 12);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(centre[0], centre[1], centre[2]);
    this.add(geometry, [material], options);
  }

  /**
   * An ellipsoid with radii `r`, turned by `yaw` then tipped by `pitch`: leaves, pillows, bowls.
   * `coarse` drops to 8 × 4 segments, enough for a leaf a centimetre thick.
   */
  ellipsoid(
    centre: Vec3,
    r: Vec3,
    material: MaterialKey,
    yaw = 0,
    pitch = 0,
    options?: PartOptions & { coarse?: boolean },
  ) {
    const geometry = options?.coarse ? new SphereGeometry(1, 8, 4) : new SphereGeometry(1, 16, 10);
    geometry.scale(r[0], r[1], r[2]);
    geometry.rotateX(pitch);
    geometry.rotateY(yaw);
    geometry.translate(centre[0], centre[1], centre[2]);
    this.add(geometry, [material], options);
  }

  /** Any geometry already in this frame's coordinates: a sloped rail, a pleat. */
  geometry(geometry: BufferGeometry, material: MaterialKey, options?: PartOptions) {
    this.add(geometry, [material], options);
  }

  private add(source: BufferGeometry, groupMaterials: MaterialKey[], options?: PartOptions) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (this.matrix) geometry.applyMatrix4(this.matrix);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const tint = options?.tint ? new Color(options.tint) : null;
    const rgb = tint ? [tint.r, tint.g, tint.b] : WHITE;
    const groups =
      geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: position.count, materialIndex: 0 }];

    for (const group of groups) {
      const material = groupMaterials[group.materialIndex ?? 0] ?? groupMaterials[0];
      if (!material) continue;
      const repeat = specOf(material).repeat ?? 1;
      let bucket = this.sink.buckets.get(material);
      if (!bucket) {
        bucket = { position: [], normal: [], uv: [], color: [] };
        this.sink.buckets.set(material, bucket);
      }
      for (let i = group.start; i < group.start + group.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        const nx = Math.abs(normal.getX(i));
        const ny = Math.abs(normal.getY(i));
        const nz = Math.abs(normal.getZ(i));
        bucket.position.push(x, y, z);
        bucket.normal.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        // Box projection from world metres: the dominant normal axis picks the plane.
        if (ny >= nx && ny >= nz) {
          if (options?.turn) bucket.uv.push(z / repeat, x / repeat);
          else bucket.uv.push(x / repeat, z / repeat);
        } else if (nx >= nz) bucket.uv.push(z / repeat, y / repeat);
        else bucket.uv.push(x / repeat, y / repeat);
        bucket.color.push(rgb[0], rgb[1], rgb[2]);
      }
    }

    const seeThrough = groupMaterials.every((m) => specOf(m).seeThrough);
    if (options?.solid !== false && !seeThrough) {
      for (let i = 0; i < position.count; i++)
        this.sink.cap.push(position.getX(i), position.getY(i), position.getZ(i));
    }
    geometry.dispose();
    if (geometry !== source) source.dispose();
  }

  /** The merged geometries, one per material, and the cap solid. */
  build(): BuiltBatch {
    const parts = [...this.sink.buckets].map(([material, bucket]) => {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(new Float32Array(bucket.position), 3));
      geometry.setAttribute('normal', new BufferAttribute(new Float32Array(bucket.normal), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(bucket.uv), 2));
      geometry.setAttribute('color', new BufferAttribute(new Float32Array(bucket.color), 3));
      geometry.computeBoundingSphere();
      return { material, geometry };
    });
    const cap = new BufferGeometry();
    cap.setAttribute('position', new BufferAttribute(new Float32Array(this.sink.cap), 3));
    cap.computeBoundingSphere();
    return { parts, cap };
  }
}
