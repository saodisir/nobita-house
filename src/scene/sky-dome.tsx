import { Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BackSide,
  Color,
  type Fog,
  type Group,
  type Mesh,
  type Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Clouds } from './clouds';
import { HorizonMist } from './horizon-mist';
import { Moon } from './moon';
import { displaySunDirection } from './sun-direction';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * Radius of the camera-centred sky dome. Inside `camera.far` (200) from any orbit, because
 * the dome travels with the camera; outside everything the diorama contains within view.
 */
const SKY_RADIUS = 150;

/**
 * drei's starfield shader places each star at `vec4(position, 0.5)`, i.e. at **twice** its
 * geometric radius, so geometry measurements under-report the real distance by half. With
 * the field centred on the camera, stars land at 2 × (45..65) = 90..130 m: inside the dome and
 * well inside `far`.
 */
const STAR_RADIUS = 45;
const STAR_DEPTH = 20;

interface SkyUniforms {
  zenith: { value: Color };
  horizon: { value: Color };
  sunDirection: { value: Vector3 };
  glowColor: { value: Color };
  glowStrength: { value: number };
  discColor: { value: Color };
  discStrength: { value: number };
}

/**
 * One gradient sky for every time of day, replacing three's Preetham `<Sky>`. That model
 * emits high-dynamic-range radiance meant to be tone mapped; this project renders with tone
 * mapping off to keep Doraemon blue saturated, so the morning sky clipped to pure white and
 * the night sky floored at ~35% grey. Here the colours are art-directed and land on screen as
 * authored: zenith per preset, horizon equal to the fog so the ground meets the sky without a
 * seam, plus a two-lobe halo around the sun for dawn and sunset.
 */
function createSkyMaterial() {
  const uniforms: SkyUniforms = {
    zenith: { value: new Color() },
    horizon: { value: new Color() },
    sunDirection: { value: new Vector3(0, 1, 0) },
    glowColor: { value: new Color() },
    glowStrength: { value: 0 },
    discColor: { value: new Color() },
    discStrength: { value: 0 },
  };
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 horizon;
      uniform vec3 sunDirection;
      uniform vec3 glowColor;
      uniform float glowStrength;
      uniform vec3 discColor;
      uniform float discStrength;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        // The orbit camera always looks down at a target near the ground, so the frame shows
        // the sky from the horizon up to ~10 degrees, mostly the lowest few. The gradient
        // therefore reaches the zenith colour by ~8 degrees (measured at the default view,
        // the sky above the rooftops sits at 3-8 degrees). Smoothstep's zero slope at the
        // horizon leaves no visible line where the fogged ground meets the sky; the earlier
        // pow curve had infinite slope there and drew a hard band.
        float height = smoothstep(0.0, 0.14, direction.y);
        vec3 colour = mix(horizon, zenith, height);
        // Wide soft halo plus a tighter core around the sun.
        float facing = max(dot(direction, sunDirection), 0.0);
        colour += glowColor * glowStrength * (0.55 * pow(facing, 6.0) + 0.7 * pow(facing, 48.0));
        // Stylised disc: flat and bright with a soft rim, ~3.2 degrees in radius, far larger
        // than the real 0.27 so it reads at diorama scale. The tight bloom lets it glow into
        // the sky around it instead of sitting there as a cut-out.
        float disc = smoothstep(0.99844, 0.99874, facing);
        colour += discColor * discStrength * 0.5 * pow(facing, 700.0);
        colour = mix(colour, discColor, disc * discStrength);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Sky dome, sun, clouds, stars and fog for the active time of day. The drawn sun and the key
 * light in `Lighting` share the eased sun's azimuth, so shadows point away from where the sun
 * appears; only the drawn elevation is capped, see `SUN_MAX_ELEVATION` in sun-direction.ts.
 *
 * Everything is written imperatively per frame, so the transition itself costs no
 * reconciliation; the click that starts it does re-render this subtree once, via the store
 * subscription in `Scene`.
 */
export function SkyDome({ tod }: { tod: TimeOfDayState }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const dome = useRef<Mesh>(null);
  const starsRig = useRef<Group>(null);
  const stars = useRef<Points>(null);
  const material = useMemo(createSkyMaterial, []);

  useFrame(() => {
    const fog = scene.fog as Fog | null;
    if (fog) {
      fog.color.copy(tod.fogColor);
      fog.near = tod.fogNear;
      fog.far = tod.fogFar;
    }

    const uniforms = material.uniforms as unknown as SkyUniforms;
    uniforms.zenith.value.copy(tod.zenith);
    uniforms.horizon.value.copy(tod.fogColor);
    displaySunDirection(tod.sun, uniforms.sunDirection.value);
    uniforms.glowColor.value.copy(tod.glowColor);
    uniforms.glowStrength.value = tod.glowStrength;
    uniforms.discColor.value.copy(tod.discColor);
    uniforms.discStrength.value = tod.discStrength;
    dome.current?.position.copy(camera.position);

    starsRig.current?.position.copy(camera.position);
    if (stars.current) {
      // drei's <Stars> does not forward renderOrder; drawing after the clouds (2) keeps
      // them on top, and they only show at night when the clouds are gone anyway.
      stars.current.renderOrder = 3;
      // The starfield shader has no usable opacity input, so stars are toggled once the sky
      // is dark enough to hide the pop.
      stars.current.visible = tod.starOpacity > 0.85;
    }
  });

  return (
    <>
      {/* Drawn first, as the backdrop; it writes no depth, so everything else lands on top. */}
      <mesh ref={dome} renderOrder={-1} material={material} frustumCulled={false}>
        <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
      </mesh>
      <HorizonMist tod={tod} />
      <Clouds tod={tod} />
      <Moon tod={tod} />
      {/* The rig follows the camera, so stars keep a fixed distance from any orbit and show
          no parallax, which is right for things at infinity. */}
      <group ref={starsRig}>
        <Stars
          ref={stars}
          radius={STAR_RADIUS}
          depth={STAR_DEPTH}
          count={2600}
          factor={3.2}
          saturation={0}
          fade
          speed={0.3}
        />
      </group>
    </>
  );
}
