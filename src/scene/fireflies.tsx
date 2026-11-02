import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Points,
  ShaderMaterial,
  Vector2,
} from 'three';
import { useReducedMotionRef } from '../utils/reduced-motion';
import { placeFireflies } from './firefly-placement';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * World diameter of one firefly's glow, halo included; the bright core is ~10% of it. At 0.45
 * the flies read as faint specks from the street, lost against the lit wall.
 */
const GLOW_SIZE = 0.8;
/** Bioluminescent yellow-green, around 560 nm. */
const GLOW_COLOR = '#CFF56A';

interface FireflyUniforms {
  uTime: { value: number };
  uHalfHeight: { value: number };
  uSize: { value: number };
  uColor: { value: Color };
  uOpacity: { value: number };
}

function createGeometry() {
  const flies = placeFireflies();
  const anchors: number[] = [];
  const wander: number[] = [];
  const blink: number[] = [];
  for (const fly of flies) {
    anchors.push(...fly.anchor);
    wander.push(fly.radius, fly.lift, fly.speed, fly.phase);
    blink.push(fly.blinkRate, fly.blinkPhase);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(anchors, 3));
  geometry.setAttribute('aWander', new Float32BufferAttribute(wander, 4));
  geometry.setAttribute('aBlink', new Float32BufferAttribute(blink, 2));
  return geometry;
}

/**
 * Flight and flashing both run in the vertex shader from one time uniform, so the swarm costs
 * one draw call and no per-frame buffer upload. Each path is two sines per axis at unrelated
 * rates, which reads as aimless drifting rather than orbiting. A flash is the peak of a slow
 * sine pushed through a smoothstep: lit for roughly a third of each cycle, near-dark between.
 */
function createMaterial() {
  const uniforms: FireflyUniforms = {
    uTime: { value: 0 },
    uHalfHeight: { value: 1 },
    uSize: { value: GLOW_SIZE },
    uColor: { value: new Color(GLOW_COLOR) },
    uOpacity: { value: 0 },
  };
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: uniforms as unknown as Record<string, { value: unknown }>,
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uHalfHeight;
      uniform float uSize;
      attribute vec4 aWander; // radius, lift, speed, phase
      attribute vec2 aBlink;  // rate, phase
      varying float vGlow;
      void main() {
        float t = uTime * aWander.z + aWander.w;
        vec3 offset = vec3(
          (sin(t) + 0.45 * sin(t * 2.3 + 1.7)) * aWander.x,
          (sin(t * 1.3 + 2.0) + 0.5 * sin(t * 3.1)) * aWander.y,
          (cos(t * 0.8 + 0.6) + 0.4 * sin(t * 1.9 + 4.1)) * aWander.x
        );
        vec4 mvPosition = modelViewMatrix * vec4(position + offset, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vGlow = 0.07 + 0.93 * smoothstep(0.35, 0.95, sin(uTime * aBlink.x + aBlink.y));
        // World size to framebuffer pixels: projectionMatrix[1][1] is 1 / tan(fov / 2).
        // Clamped so a far firefly never drops below a pixel and a near one stays a glow.
        float pixels = uSize * projectionMatrix[1][1] * uHalfHeight / -mvPosition.z;
        gl_PointSize = clamp(pixels, 2.0, 200.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        // A small hot core in a halo that falls off steeply: a flatter halo turned each fly
        // into a soft ball as wide as a shrub.
        float core = 1.0 - smoothstep(0.02, 0.13, d);
        float halo = 0.8 * pow(1.0 - d, 3.4);
        vec3 colour = mix(uColor, vec3(1.0, 1.0, 0.85), core * 0.7) * (core + halo);
        gl_FragColor = vec4(colour * vGlow * uOpacity, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

const scratchSize = new Vector2();

/**
 * Fireflies drifting and flashing over Nobita's garden on clear nights. They fade in with the
 * night and out with the day or with rain, which grounds them. Additive glow with depth testing
 * but no depth writes: the wall, hedges and house hide the ones behind them, and overlapping
 * glows brighten.
 * With reduced motion they hold still, each frozen at its own brightness.
 */
export function Fireflies({ tod }: { tod: TimeOfDayState }) {
  const points = useRef<Points>(null);
  const reduced = useReducedMotionRef();
  const geometry = useMemo(createGeometry, []);
  const material = useMemo(createMaterial, []);

  useFrame((state, delta) => {
    const swarm = points.current;
    if (!swarm) return;
    swarm.visible = tod.fireflyOpacity > 0.01;
    if (!swarm.visible) return;
    const uniforms = material.uniforms as unknown as FireflyUniforms;
    if (!reduced.current) uniforms.uTime.value += delta;
    uniforms.uHalfHeight.value = state.gl.getDrawingBufferSize(scratchSize).y / 2;
    uniforms.uOpacity.value = tod.fireflyOpacity;
  });

  return (
    <points
      ref={points}
      name="fireflies"
      geometry={geometry}
      material={material}
      // Anchors are static but every fly wanders up to ~1.2 m off them in the shader.
      frustumCulled={false}
    />
  );
}
