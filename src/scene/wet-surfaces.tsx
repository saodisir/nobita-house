import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Color, Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { useReducedMotionRef } from '../utils/reduced-motion';
import { RAIN_COVER_GLSL, rainCover } from './rain-cover';
import type { TimeOfDayState } from './use-time-of-day';

/** Seconds for open ground to soak through once rain starts (eased). */
const SOAK_SECONDS = 3;
/** Seconds for fully soaked ground, puddles included, to dry once rain stops (linear, so it ends). */
const DRY_SECONDS = 20;
/** While wet, look for newly streamed-in materials this often. */
const SCAN_SECONDS = 2;

/** Shared by every patched material, so one write per frame reaches them all. */
const wetUniforms = {
  uWet: { value: 0 },
  uRainLevel: { value: 0 },
  uRainTime: { value: 0 },
  uWetSky: { value: new Color() },
};

const VERTEX_PARS = /* glsl */ `
  varying vec3 vWetWorld;
`;

const VERTEX = /* glsl */ `
  {
    vec4 wetPosition = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      wetPosition = batchingMatrix * wetPosition;
    #endif
    #ifdef USE_INSTANCING
      wetPosition = instanceMatrix * wetPosition;
    #endif
    vWetWorld = (modelMatrix * wetPosition).xyz;
  }
`;

const FRAGMENT_PARS = /* glsl */ `
  varying vec3 vWetWorld;
  uniform float uWet;
  uniform float uRainLevel;
  uniform float uRainTime;
  uniform vec3 uWetSky;
  ${RAIN_COVER_GLSL}

  float wetHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float wetNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(wetHash(i), wetHash(i + vec2(1.0, 0.0)), u.x),
      mix(wetHash(i + vec2(0.0, 1.0)), wetHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  // Rings spreading from raindrops over a puddle: in each 33 cm cell, one drop per cycle at a
  // hashed spot and moment, two offset layers so the rings overlap. Returns the surface slope.
  vec2 wetRipples(vec2 p, float t) {
    vec2 slope = vec2(0.0);
    for (int layer = 0; layer < 2; layer++) {
      vec2 q = p * 3.0 + float(layer) * vec2(0.43, 0.71);
      vec2 cell = floor(q);
      float life = fract(t * 1.3 + wetHash(cell + float(layer) * 17.0));
      vec2 centre = vec2(wetHash(cell + 3.1), wetHash(cell + 5.7)) * 0.6 + 0.2;
      vec2 d = fract(q) - centre;
      float r = length(d);
      float front = r - life * 0.5;
      float ring = sin(front * 60.0) * smoothstep(0.1, 0.0, abs(front)) * (1.0 - life);
      slope += d / max(r, 1e-4) * ring;
    }
    return slope;
  }
`;

/**
 * Upward faces out in the open darken and turn glossy; flat low ground — road, paths, the
 * yard — also collects puddles from a two-scale noise, near-mirror smooth and rippled by the
 * falling rain. "Out in the open" is the rain cover: a surface more than 15 cm under it is
 * sheltered, so floors indoors, the ground under the eaves and under the trees stay dry.
 */
const FRAGMENT_WETNESS = /* glsl */ `
  float wetSheen = 0.0;
  if (uWet > 0.001) {
    vec3 wetUp = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
    float open = step(rainCoverAt(vWetWorld.xz) - 0.15, vWetWorld.y);
    float wet = uWet * open * smoothstep(0.35, 0.8, wetUp.y);
    float pools = 0.7 * wetNoise(vWetWorld.xz * 0.35) + 0.3 * wetNoise(vWetWorld.xz * 1.3);
    float puddle = wet * smoothstep(0.93, 0.99, wetUp.y) * (1.0 - smoothstep(0.08, 0.2, vWetWorld.y))
      * smoothstep(0.58, 0.66, pools);
    diffuseColor.rgb *= mix(1.0, 0.6, wet) * mix(1.0, 0.8, puddle);
    roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.4, wet);
    roughnessFactor = mix(roughnessFactor, 0.05, puddle);
    if (puddle > 0.001 && uRainLevel > 0.001) {
      vec2 slope = wetRipples(vWetWorld.xz, uRainTime) * 0.25 * uRainLevel;
      vec3 rippled = normalize((viewMatrix * vec4(normalize(vec3(-slope.x, 1.0, -slope.y)), 0.0)).xyz);
      normal = normalize(mix(normal, rippled, puddle));
    }
    wetSheen = max(puddle, wet * 0.25);
  }
`;

/** The sky in the water: Schlick's Fresnel, so puddles mirror the haze at grazing angles. */
const FRAGMENT_SHEEN = /* glsl */ `
  if (wetSheen > 0.0) {
    float facing = saturate(dot(normal, normalize(vViewPosition)));
    outgoingLight += uWetSky * (0.04 + 0.96 * pow(1.0 - facing, 5.0)) * wetSheen;
  }
`;

const patched = new WeakSet<Material>();

/**
 * Teaches a standard material to get wet. Materials that already rewrite their shader (the
 * lawn blades, the foliage cards) are left alone: two patches cannot share one hook.
 */
function makeWettable(material: MeshStandardMaterial) {
  if (patched.has(material)) return;
  patched.add(material);
  if (material.onBeforeCompile !== Material.prototype.onBeforeCompile) return;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, wetUniforms, rainCover);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${FRAGMENT_WETNESS}`)
      .replace('#include <opaque_fragment>', `${FRAGMENT_SHEEN}\n#include <opaque_fragment>`);
  };
  material.needsUpdate = true;
}

/** Every standard material in the scene but the characters', who stay dry under the rain. */
function wetEverything(root: Object3D) {
  if (root.name.startsWith('character-')) return;
  const mesh = root as Mesh;
  if (mesh.isMesh) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if ((material as MeshStandardMaterial).isMeshStandardMaterial)
        makeWettable(material as MeshStandardMaterial);
    }
  }
  for (const child of root.children) wetEverything(child);
}

/**
 * Wet ground, eased behind the rain: it soaks through over a few seconds once the shower
 * starts and dries at a steady rate after it stops, gone within DRY_SECONDS. Materials are patched the first
 * time it rains — never in dry weather, which keeps its shaders untouched — and again every
 * few seconds while wet, to catch models that stream in later.
 */
export function WetSurfaces({ tod }: { tod: TimeOfDayState }) {
  const scene = useThree((s) => s.scene);
  const reduced = useReducedMotionRef();
  const sinceScan = useRef(Number.POSITIVE_INFINITY);

  useFrame((_, delta) => {
    const target = tod.rain;
    const wet = wetUniforms.uWet;
    if (target <= 0.001 && wet.value <= 0.001) return;
    if (reduced.current) wet.value = target;
    else {
      if (target > wet.value) wet.value += (target - wet.value) * (1 - Math.exp(-delta / SOAK_SECONDS));
      else wet.value = Math.max(target, wet.value - delta / DRY_SECONDS);
      wetUniforms.uRainTime.value += delta;
    }
    wetUniforms.uRainLevel.value = target;
    wetUniforms.uWetSky.value.copy(tod.fogColor).lerp(tod.zenith, 0.3);

    sinceScan.current += delta;
    if (sinceScan.current >= SCAN_SECONDS) {
      sinceScan.current = 0;
      wetEverything(scene);
    }
  });

  return null;
}
