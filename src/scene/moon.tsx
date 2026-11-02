import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, type Sprite, SpriteMaterial, SRGBColorSpace } from 'three';
import { displayMoonDirection } from './sun-direction';
import type { TimeOfDayState } from './use-time-of-day';

/** Distance from the camera: inside the sky dome (150) and `camera.far`, level with the stars. */
const MOON_DISTANCE = 110;
/**
 * Sprite width in metres. The disc fills `DISC_FRACTION` of it, so its radius is ~1.9 degrees:
 * stylised like the sun's, about seven times the real moon, so it reads at diorama scale.
 */
const MOON_SIZE = 17;
const TEXTURE_SIZE = 256;
const DISC_FRACTION = 0.43;

/**
 * Dark maria as [x, y, radius] relative to the disc radius, y down, after the near side:
 * Imbrium, Serenitatis, Tranquillitatis, Crisium, Fecunditatis, Procellarum, Nubium, Humorum
 * and the thin band of Frigoris. Overlapping soft blobs merge into irregular seas; fewer,
 * darker ones read as spots.
 */
const MARIA: [number, number, number][] = [
  [-0.26, -0.36, 0.32],
  [0.12, -0.36, 0.19],
  [0.3, -0.1, 0.23],
  [0.64, -0.26, 0.12],
  [0.5, 0.14, 0.16],
  [-0.56, -0.04, 0.4],
  [-0.36, 0.22, 0.24],
  [-0.18, 0.34, 0.18],
  [-0.52, 0.38, 0.13],
  [-0.12, -0.7, 0.13],
  [0.16, -0.64, 0.11],
];

/**
 * A full moon drawn once into a canvas, so there is no image asset: an ivory disc darkened
 * towards the limb, soft grey maria, and a cool halo behind it. The maria are composited
 * `source-atop` so they only land on the disc; the halo goes `destination-over`, behind it.
 */
function createMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the moon texture');
  const centre = TEXTURE_SIZE / 2;
  const radius = (TEXTURE_SIZE * DISC_FRACTION) / 2;

  const disc = ctx.createRadialGradient(centre, centre, 0, centre, centre, radius);
  disc.addColorStop(0, '#FBF8EE');
  disc.addColorStop(0.75, '#F2EEE0');
  disc.addColorStop(1, '#DCD6C4');
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(centre, centre, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-atop';
  for (const [mx, my, mr] of MARIA) {
    const x = centre + mx * radius;
    const y = centre + my * radius;
    const r = mr * radius;
    const mare = ctx.createRadialGradient(x, y, 0, x, y, r);
    mare.addColorStop(0, 'rgba(150,154,156,0.34)');
    mare.addColorStop(0.5, 'rgba(158,162,162,0.22)');
    mare.addColorStop(1, 'rgba(170,172,170,0)');
    ctx.fillStyle = mare;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.globalCompositeOperation = 'destination-over';
  const halo = ctx.createRadialGradient(centre, centre, radius * 0.9, centre, centre, centre);
  halo.addColorStop(0, 'rgba(206,220,255,0.42)');
  halo.addColorStop(0.3, 'rgba(170,192,245,0.14)');
  halo.addColorStop(1, 'rgba(150,175,240,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * The night moon, a billboard that travels with the camera like the stars, so it shows no
 * parallax. It hangs in the moonlight's direction: the preset's night `sun` vector is the key
 * light in `Lighting`, so the shadows fall away from the moon. It fades with the stars.
 *
 * Drawn after the stars (renderOrder 3) so the disc covers any star behind it; it is
 * transparent, so it still depth-tests against the opaque scene and hides behind rooftops.
 */
export function Moon({ tod }: { tod: TimeOfDayState }) {
  const camera = useThree((s) => s.camera);
  const sprite = useRef<Sprite>(null);
  const material = useMemo(
    () =>
      new SpriteMaterial({
        map: createMoonTexture(),
        transparent: true,
        depthWrite: false,
        // At 110 m the moon is past the fog's far distance and would vanish into it.
        fog: false,
      }),
    [],
  );

  useFrame(() => {
    const moon = sprite.current;
    if (!moon) return;
    moon.visible = tod.starOpacity > 0.01;
    if (!moon.visible) return;
    displayMoonDirection(tod.sun, moon.position).multiplyScalar(MOON_DISTANCE).add(camera.position);
    material.opacity = tod.starOpacity;
  });

  return (
    <sprite
      ref={sprite}
      name="moon"
      material={material}
      renderOrder={4}
      scale={[MOON_SIZE, MOON_SIZE, 1]}
      frustumCulled={false}
    />
  );
}
