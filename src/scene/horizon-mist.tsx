import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { BackSide, type Mesh, ShaderMaterial } from 'three';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * Radius of the mist shell from the camera: outside every rooftop, inside the sky dome (150)
 * and `camera.far`, just past the cloud shell (120) so cumulus composites over the haze.
 */
const MIST_RADIUS = 130;
/** Cylinder half-height: at 130 m the band spans ~±9 degrees, clear of the drawn sun at 7. */
const MIST_HALF_HEIGHT = 30;
/** Metres over which the haze fades above (into the sky) and below (behind the ground). */
const FADE_UP = 18;
const FADE_DOWN = 5;

interface MistUniforms {
  colour: { value: { r: number; g: number; b: number } };
  opacity: { value: number };
}

/**
 * A soft band of haze lying on the horizon, seen in the user-raised views where the 400 m
 * ground plane's far edge cuts a hard line against the glowing sky (the street-level camera
 * never sees it: there the fogged ground meets a fog-coloured horizon seamlessly).
 *
 * One open cylinder riding the camera like the sky dome. Its alpha peaks exactly at the
 * camera's own height — from any orbit height, the silhouette of the infinite ground plane
 * crosses the cylinder at eye level — so the veil always sits on the seam it hides, tinted
 * the fog colour to meet the fogged ground without a second seam of its own. The sun disc
 * (drawn at 7 degrees, ~15 m above the band's core at this radius) stays clear, and night
 * fades the band to nothing so the stars keep their clear sky.
 */
export function HorizonMist({ tod }: { tod: TimeOfDayState }) {
  const camera = useThree((s) => s.camera);
  const mesh = useRef<Mesh>(null);
  const material = useMemo(() => {
    const uniforms: MistUniforms = {
      colour: { value: { r: 1, g: 1, b: 1 } },
      opacity: { value: 0 },
    };
    return new ShaderMaterial({
      uniforms: uniforms as unknown as Record<string, { value: unknown }>,
      side: BackSide,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 colour;
        uniform float opacity;
        varying vec3 vWorld;
        void main() {
          // Height over the camera's eye: the ground's horizon line sits exactly at zero.
          float d = vWorld.y - cameraPosition.y;
          float up = exp(-pow(max(d, 0.0) / ${FADE_UP}.0, 1.6));
          float down = exp(-pow(max(-d, 0.0) / ${FADE_DOWN}.0, 1.6));
          gl_FragColor = vec4(colour, opacity * up * down);
          #include <colorspace_fragment>
        }
      `,
    });
  }, []);

  useFrame(() => {
    if (mesh.current) {
      mesh.current.position.copy(camera.position);
      mesh.current.visible = tod.mistOpacity > 0.01;
    }
    const uniforms = material.uniforms as unknown as MistUniforms;
    uniforms.colour.value = tod.fogColor;
    uniforms.opacity.value = tod.mistOpacity;
  });

  return (
    <mesh
      ref={mesh}
      name="horizon-mist"
      material={material}
      // After the dome (-1) so the haze composites over the sky, before the clouds (2).
      renderOrder={1}
      frustumCulled={false}
    >
      <cylinderGeometry args={[MIST_RADIUS, MIST_RADIUS, MIST_HALF_HEIGHT * 2, 48, 1, true]} />
    </mesh>
  );
}
