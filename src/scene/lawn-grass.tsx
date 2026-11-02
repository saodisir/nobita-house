import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import {
  Box3,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Material,
  type Mesh,
  MeshStandardMaterial,
  type Object3D,
  ShaderChunk,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { heroLot, layout, type Rect } from '../data/scene';
import { useReducedMotionRef } from '../utils/reduced-motion';
import {
  BLADE_SPACING,
  earthEdgeScale,
  isHeroLawn,
  type LawnBlades,
  MAX_HEIGHT,
  NEIGHBOUR_SPACING,
  neighbourLawn,
  placeLawnBlades,
  sandlotLawn,
} from './lawn-placement';

/** Blades shrink into the ground between these camera distances, metres. The far end sits
 * past the widest orbit, where a blade is down to about a pixel and would only shimmer. */
const FADE_NEAR = 30;
const FADE_FAR = 48;
/**
 * Root matches the lawn texture under it so the blades grow out of it without a seam; the tip
 * sits only a little lighter, so the lawn reads as one soft sward rather than a field of
 * dark roots and bright points.
 */
const ROOT_COLOR = '#6BB232';
const TIP_COLOR = '#8EC64C';
/** Direction the breeze blows along the ground, and how far it bends a tip per metre of blade. */
const WIND_DIR = new Vector2(0.8, 0.6).normalize();
const WIND_STRENGTH = 0.28;

interface GrassUniforms {
  uTime: { value: number };
  uWindDir: { value: Vector2 };
  uWind: { value: number };
  uFade: { value: Vector2 };
  uRoot: { value: Color };
  uTip: { value: Color };
}

/**
 * One blade: two tapering segments and a tip, x in [-0.5, 0.5] across the blade and y in
 * [0, 1] up it. The vertex shader scales, leans, turns and bends it per instance.
 */
function createGeometry(blades: LawnBlades, area: Rect) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, -0.36, 0.55, 0, 0.36, 0.55, 0, 0, 1, 0], 3),
  );
  // Real normals come from the shader; the attribute only has to exist for the lit chunks.
  geometry.setAttribute(
    'normal',
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3),
  );
  geometry.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
  geometry.setAttribute('aBase', new InstancedBufferAttribute(blades.base, 4));
  geometry.setAttribute('aShape', new InstancedBufferAttribute(blades.shape, 4));
  geometry.instanceCount = blades.count;
  // The attribute bounds describe one blade at the origin; cull against the whole lot.
  geometry.boundingBox = new Box3(
    new Vector3(area.x0, 0, area.z0),
    new Vector3(area.x1, MAX_HEIGHT, area.z1),
  );
  geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
  return geometry;
}

/**
 * A lit, fogged, shadow-receiving standard material with the blade shaping patched in, so
 * the grass answers every time of day exactly like the ground it stands on.
 *
 * Normals point almost straight up, tipped a touch toward the blade's face: the lawn shades
 * as one soft surface instead of thousands of flat cards, each catching the key at its own
 * angle. Double-sided faces keep that normal rather than flipping it, so a blade seen from
 * behind is not dark.
 */
function createMaterial() {
  const uniforms: GrassUniforms = {
    uTime: { value: 0 },
    uWindDir: { value: WIND_DIR },
    uWind: { value: WIND_STRENGTH },
    uFade: { value: new Vector2(FADE_NEAR, FADE_FAR) },
    uRoot: { value: new Color(ROOT_COLOR) },
    uTip: { value: new Color(TIP_COLOR) },
  };
  const material = new MeshStandardMaterial({ roughness: 0.9, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWind;
        uniform vec2 uFade;
        attribute vec4 aBase;  // x, z, yaw, wind phase
        attribute vec4 aShape; // height, width, lean, tint
        varying float vUp;
        varying float vTint;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        float yawC = cos(aBase.z);
        float yawS = sin(aBase.z);
        vec3 across = vec3(yawC, 0.0, -yawS);
        vec3 facing = vec3(yawS, 0.0, yawC);
        vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + facing * 0.12);`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        float t = position.y;
        vec3 root = vec3(aBase.x, 0.0, aBase.y);
        float height = aShape.x * (1.0 - smoothstep(uFade.x, uFade.y, distance(cameraPosition, root)));
        // Resting curve: the tip leans forward, more the higher up the blade.
        vec3 transformed = across * position.x * aShape.y + facing * (aShape.z * height * t * t);
        // A slow swell rolls across the lawn along the wind, with a little per-blade flutter.
        float swell = 0.5 + 0.5 * sin(dot(aBase.xy, uWindDir) * 0.45 - uTime * 1.3);
        float flutter = 0.25 * sin(uTime * 2.7 + aBase.w);
        vec2 bend = uWindDir * uWind * (0.35 + 0.65 * swell + flutter) * t * t;
        transformed.xz += bend * height;
        // Bent tips drop a little so the blade does not stretch.
        transformed.y = t * height * inversesqrt(1.0 + dot(bend, bend));
        transformed += root;
        vUp = t;
        vTint = aShape.w;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 uRoot;
        uniform vec3 uTip;
        varying float vUp;
        varying float vTint;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        diffuseColor.rgb = mix(uRoot, uTip, smoothstep(0.0, 1.0, vUp)) * vTint;`,
      )
      // Includes expand after this hook, so the chunk is swapped whole, minus its back-face flip.
      .replace(
        '#include <normal_fragment_begin>',
        ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
      );
  };
  return { material, uniforms };
}

/** Every lawn in the block: Nobita's densest, then the seven neighbour lots and the sandlot. */
function createLawns() {
  const { lot: sandlot } = layout.sandlot;
  return [
    {
      id: 'hero',
      geometry: createGeometry(placeLawnBlades(heroLot, isHeroLawn, BLADE_SPACING, earthEdgeScale), heroLot),
    },
    ...layout.neighbours.map((n) => ({
      id: n.id,
      geometry: createGeometry(placeLawnBlades(n.lot, neighbourLawn(n), NEIGHBOUR_SPACING), n.lot),
    })),
    {
      id: 'sandlot',
      geometry: createGeometry(placeLawnBlades(sandlot, sandlotLawn(), NEIGHBOUR_SPACING), sandlot),
    },
  ];
}

/**
 * Grass on every lot in the block, one draw call per lot so a lot off screen is culled whole.
 * All of them share one material, so the breeze is one time uniform on the GPU and nothing is
 * uploaded per frame; with reduced motion the blades rest. Blades receive shadows but cast
 * none: a shadow pass over every blade would double their cost for shading the ground
 * texture already provides.
 */
export function LawnGrass() {
  const reduced = useReducedMotionRef();
  const lawns = useMemo(createLawns, []);
  const { material, uniforms } = useMemo(createMaterial, []);

  useFrame((_, delta) => {
    if (!reduced.current) uniforms.uTime.value += delta;
  });

  return (
    <group name="lawn-grass">
      {lawns.map(({ id, geometry }) => (
        <mesh key={id} name={`lawn-${id}`} geometry={geometry} material={material} receiveShadow />
      ))}
    </group>
  );
}

/** Material the Blender builders give every lawn floor, in `environment.glb` and `neighbours.glb`. */
const LAWN_GROUND_MATERIAL = 'env_grass';

/**
 * Mounts a loaded lot model with its lawn floor receiving shadows. The blades on it do, so a
 * floor that did not left every tree shadow as dark blades over a bright ground: a speckled
 * patch instead of shade. Only the floor is switched on; the rest of the model keeps its flags.
 */
export function LawnGroundScene({ scene }: { scene: Object3D }) {
  useMemo(() => {
    scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as Material | Material[];
      if (!Array.isArray(material) && material.name === LAWN_GROUND_MATERIAL) mesh.receiveShadow = true;
    });
  }, [scene]);
  return <primitive object={scene} />;
}
