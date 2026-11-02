import { useEffect, useMemo } from 'react';
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
import { heroLot, type Rect } from '../data/scene';
import { earthCover } from './lawn-placement';

/**
 * The worn earth in Nobita's garden, painted over the lawn instead of laid on it as a slab.
 *
 * One lot-sized plane a few millimetres above the turf carries a texture baked here from
 * `earthCover`, the same field that thins the grass blades. Alpha rises across the band
 * where the blades die out, the dirt mottles at two scales with a scatter of pale grit, and
 * its margin is pulled toward the turf colour so the lawn wears into it instead of meeting it
 * at a line. Nothing is drawn where the cover is zero.
 */

/** 4 cm texels: a pebble is one texel, and the whole lot is a 360 × 312 texture. */
const TEXELS_PER_METRE = 24;
/** Lifted off the turf so the lawn texture never z-fights it; blade roots hide the gap. */
const LIFT = 0.004;

// sRGB, 0–255. Packed loam, pulled toward grey so it reads as ground, not a swatch of colour.
const DIRT_DARK = [128, 111, 86] as const;
const DIRT_LIGHT = [172, 155, 124] as const;
const GRIT = [198, 188, 164] as const;
/** Trodden turf at the margin: grass worn thin over the soil. */
const TURF = [118, 136, 70] as const;

function hash(i: number, j: number, channel: number) {
  const x = Math.sin(i * 127.1 + j * 311.7 + channel * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Smooth value noise in [0, 1]: a hashed lattice, bilinear with a smoothstep. */
function noise(x: number, z: number, channel: number) {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const fx = x - i;
  const fz = z - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, channel);
  const b = hash(i + 1, j, channel);
  const c = hash(i, j + 1, channel);
  const d = hash(i + 1, j + 1, channel);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function mix(a: readonly number[], b: readonly number[], t: number, out: number[]) {
  for (let k = 0; k < 3; k++) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  return out;
}

function createEarthTexture(area: Rect) {
  const width = Math.ceil((area.x1 - area.x0) * TEXELS_PER_METRE);
  const height = Math.ceil((area.z1 - area.z0) * TEXELS_PER_METRE);
  const data = new Uint8Array(width * height * 4);
  const dirt = [0, 0, 0];
  const out = [0, 0, 0];
  for (let j = 0; j < height; j++) {
    // Row 0 is v = 0, which the plane (turned face up) puts at its +z edge.
    const z = area.z1 - (j + 0.5) / TEXELS_PER_METRE;
    for (let i = 0; i < width; i++) {
      const x = area.x0 + (i + 0.5) / TEXELS_PER_METRE;
      const k = (j * width + i) * 4;
      const cover = earthCover(x, z);
      const shade =
        0.3 * noise(x * 1.4, z * 1.4, 1) + 0.45 * noise(x * 4.5, z * 4.5, 2) + 0.25 * hash(i, j, 3);
      mix(DIRT_DARK, DIRT_LIGHT, shade, dirt);
      if (hash(i, j, 4) > 0.985) mix(dirt, GRIT, 0.35, dirt);
      // The last third of the band toward the lawn goes over to worn turf.
      const turf = 1 - Math.min(Math.max((cover - 0.15) / 0.55, 0), 1);
      mix(dirt, TURF, turf * 0.75, out);
      data[k] = out[0] ?? 0;
      data[k + 1] = out[1] ?? 0;
      data[k + 2] = out[2] ?? 0;
      data[k + 3] = Math.round(255 * Math.min(cover / 0.7, 1));
    }
  }
  const texture = new DataTexture(data, width, height);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

export function YardEarth() {
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        map: createEarthTexture(heroLot),
        roughness: 1,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    [],
  );
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  const w = heroLot.x1 - heroLot.x0;
  const d = heroLot.z1 - heroLot.z0;
  return (
    <mesh
      name="yard-earth"
      position={[(heroLot.x0 + heroLot.x1) / 2, LIFT, (heroLot.z0 + heroLot.z1) / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      // First of the transparent pass: it is ground, under everything see-through. Sorted by
      // its lot-centre origin it could land after the house's frosted glass (which writes no
      // depth) and paint the earth over the kitchen door from inside.
      renderOrder={-1}
      receiveShadow
    >
      <planeGeometry args={[w, d]} />
    </mesh>
  );
}
