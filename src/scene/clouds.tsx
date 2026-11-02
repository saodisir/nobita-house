import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  CanvasTexture,
  DoubleSide,
  type Group,
  type Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { useReducedMotionRef } from '../utils/reduced-motion';
import { displaySunDirection } from './sun-direction';
import type { TimeOfDayState } from './use-time-of-day';

/** Distance of the cloud shell from the camera: inside the sky dome and `camera.far`. */
const CLOUD_RADIUS = 120;
/** Radians per second the whole cloud field drifts round the camera. */
const DRIFT = 0.004;
const CLOUD_COUNT = 16;
/**
 * Angular window around the drawn sun, as cosines: a cloud fully clear of `SUN_CLEAR_OUTER`
 * keeps its opacity, one centred on the sun fades to `SUN_CLOUD_FLOOR`. Without this a cloud
 * drifting past sat in front of the disc for minutes at a time.
 */
const SUN_CLEAR_INNER = Math.cos((6 * Math.PI) / 180);
const SUN_CLEAR_OUTER = Math.cos((16 * Math.PI) / 180);
const SUN_CLOUD_FLOOR = 0.22;

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rand(seed: number) {
  const x = Math.sin(seed * 91.37) * 43758.5453;
  return x - Math.floor(x);
}

/** Puffs as [x, y, radius] in arbitrary units; the base row is wide and low, the tops pile up. */
const PUFFS: [number, number, number][] = [
  [0.22, 0.72, 0.16],
  [0.38, 0.66, 0.2],
  [0.56, 0.64, 0.22],
  [0.74, 0.7, 0.17],
  [0.86, 0.76, 0.1],
  [0.12, 0.78, 0.09],
  [0.44, 0.44, 0.19],
  [0.6, 0.4, 0.17],
  [0.3, 0.52, 0.14],
  [0.72, 0.52, 0.13],
  [0.52, 0.28, 0.13],
];

/**
 * Fair-weather cumulus with a grey-blue underside, drawn once into a canvas at startup so there
 * is no image asset. The canvas is sized to the puffs' own bounding box plus a margin: a fixed
 * canvas clipped the lowest puffs and left a straight horizontal cut along every cloud's base.
 * Returns the texture and its aspect (height / width) so sprites keep the puffs round.
 */
function createCloudTexture() {
  const pixelsPerUnit = 256;
  const margin = 0.02;
  const minX = Math.min(...PUFFS.map(([x, , r]) => x - r)) - margin;
  const maxX = Math.max(...PUFFS.map(([x, , r]) => x + r)) + margin;
  const minY = Math.min(...PUFFS.map(([, y, r]) => y - r)) - margin;
  const maxY = Math.max(...PUFFS.map(([, y, r]) => y + r)) + margin;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxX - minX) * pixelsPerUnit);
  canvas.height = Math.ceil((maxY - minY) * pixelsPerUnit);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for the cloud texture');

  for (const [px, py, pr] of PUFFS) {
    const x = (px - minX) * pixelsPerUnit;
    const y = (py - minY) * pixelsPerUnit;
    const r = pr * pixelsPerUnit;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.62, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Shade the underside only where cloud already exists.
  ctx.globalCompositeOperation = 'source-atop';
  const shade = ctx.createLinearGradient(0, canvas.height * 0.4, 0, canvas.height);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(158,176,204,0.6)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: canvas.height / canvas.width };
}

/**
 * Cloud placements on the shell: azimuth, elevation (radians), width in metres, mirrored.
 * Elevations stay between 4 and 13 degrees because the orbit camera only ever frames the sky
 * from the horizon up to ~10-15 degrees; higher clouds were simply never on screen. At this
 * height, and this size, they peek over the rooftops as in the hero reference.
 */
const CLOUDS = Array.from({ length: CLOUD_COUNT }, (_, i) => ({
  id: `cloud-${i}`,
  azimuth: (i / CLOUD_COUNT) * Math.PI * 2 + rand(i + 1) * 0.3,
  elevation: (2 + rand(i + 20) * 7) * (Math.PI / 180),
  width: 36 + rand(i + 40) * 30,
  flip: rand(i + 60) > 0.5,
}));

const scratchSun = new Vector3();
const scratchCloud = new Vector3();

/**
 * A ring of cumulus billboards riding a camera-centred shell. They show no parallax, which is
 * right at this distance, drift slowly round the camera, take their tint and opacity from the
 * time of day (white by morning, pink at dawn, lit orange at sunset, gone at night), and thin
 * out as they cross the sun so the disc stays readable.
 *
 * Each cloud owns its material so its opacity can follow its own distance from the sun; the
 * sprites are separate draw calls either way, so this costs nothing extra.
 */
export function Clouds({ tod }: { tod: TimeOfDayState }) {
  const camera = useThree((s) => s.camera);
  const rig = useRef<Group>(null);
  const sprites = useRef<(Sprite | null)[]>([]);
  const reduced = useReducedMotionRef();
  const { materials, aspect } = useMemo(() => {
    const { texture, aspect: textureAspect } = createCloudTexture();
    return {
      aspect: textureAspect,
      materials: CLOUDS.map(
        () =>
          new SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
            // At 120 m every cloud would sit past the fog's far distance and vanish into it.
            fog: false,
            // Mirrored clouds use a negative scale, and three only flips face culling for
            // meshes, not sprites, so a one-sided material would cull every mirrored cloud.
            side: DoubleSide,
          }),
      ),
    };
  }, []);

  useFrame((_, delta) => {
    const group = rig.current;
    if (!group) return;
    group.position.copy(camera.position);
    if (!reduced.current) group.rotation.y += delta * DRIFT;
    group.visible = tod.cloudOpacity > 0.01;
    if (!group.visible) return;

    displaySunDirection(tod.sun, scratchSun);
    CLOUDS.forEach((_, index) => {
      const sprite = sprites.current[index];
      const material = materials[index];
      if (!sprite || !material) return;
      // Direction from the camera to this cloud, after the rig's drift rotation.
      scratchCloud.copy(sprite.position).applyEuler(group.rotation).normalize();
      const facing = scratchCloud.dot(scratchSun);
      const t = Math.min(1, Math.max(0, (facing - SUN_CLEAR_OUTER) / (SUN_CLEAR_INNER - SUN_CLEAR_OUTER)));
      const nearSun = t * t * (3 - 2 * t);
      material.color.copy(tod.cloudTint);
      material.opacity = tod.cloudOpacity * (1 - nearSun * (1 - SUN_CLOUD_FLOOR));
    });
  });

  return (
    <group ref={rig} name="clouds">
      {CLOUDS.map((cloud, index) => {
        const ring = Math.cos(cloud.elevation) * CLOUD_RADIUS;
        return (
          <sprite
            key={cloud.id}
            ref={(node) => {
              sprites.current[index] = node;
            }}
            material={materials[index]}
            renderOrder={2}
            position={[
              Math.sin(cloud.azimuth) * ring,
              Math.sin(cloud.elevation) * CLOUD_RADIUS,
              Math.cos(cloud.azimuth) * ring,
            ]}
            scale={[cloud.flip ? -cloud.width : cloud.width, cloud.width * aspect, 1]}
          />
        );
      })}
    </group>
  );
}
