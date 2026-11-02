import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  DataTexture,
  DoubleSide,
  type Material,
  type Mesh,
  NearestFilter,
  type Object3D,
  OrthographicCamera,
  ShaderMaterial,
  type Texture,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * What the rain lands on: the height of the highest surface over every point of the block,
 * seen from straight above. Rain streaks stop at it, splashes sit on it, and a surface lower
 * than it is under cover and stays dry — roofs, eaves, porches and tree canopies all shelter
 * whatever is beneath them, with no hand-kept list of shelters to drift from the models.
 */

/** The block and its streets, 84 m across, with room to spare; x0, z0 and the side, metres. */
const REGION = { x0: -48, z0: -48, size: 96 } as const;
/** 9.4 cm texels: finer than any eave overhang, 4 MB of RGBA8. */
const RESOLUTION = 1024;
/** Heights are packed into 16 bits over this range: half-millimetre steps. */
const MAX_HEIGHT = 32;
/** The scene is static but models stream in and doors swing; while it rains, refresh this often. */
const RECAPTURE_SECONDS = 4;

// A 1x1 black texel until the first capture: every surface reads as open ground at height 0.
const blank = new DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
blank.needsUpdate = true;

/**
 * Shared by every shader that reads the cover. The region vector maps world x/z to texture
 * u/v: the capture camera looks down with -z up the frame, so v runs from the far (+z) edge.
 */
export const rainCover = {
  uCoverMap: { value: blank as Texture },
  uCoverRegion: {
    value: new Vector4(REGION.x0, REGION.z0 + REGION.size, 1 / REGION.size, -1 / REGION.size),
  },
};

/** GLSL: `rainCoverAt(xz)`, the height rain reaches at a world point; 0 outside the region. */
export const RAIN_COVER_GLSL = /* glsl */ `
  uniform sampler2D uCoverMap;
  uniform vec4 uCoverRegion;
  float rainCoverAt(vec2 xz) {
    vec2 uv = (xz - uCoverRegion.xy) * uCoverRegion.zw;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
    vec2 packed = texture2D(uCoverMap, uv).rg * 255.0;
    return (packed.r * 256.0 + packed.g) / 65535.0 * ${MAX_HEIGHT.toFixed(1)};
  }
`;

/** Writes each fragment's world height, packed high byte / low byte into red and green. */
function createCaptureMaterial() {
  return new ShaderMaterial({
    // Single-sided planes seen from behind still keep the rain off what is under them.
    side: DoubleSide,
    vertexShader: /* glsl */ `
      varying float vHeight;
      void main() {
        vec4 local = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          local = instanceMatrix * local;
        #endif
        vec4 world = modelMatrix * local;
        vHeight = world.y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vHeight;
      void main() {
        float level = floor(clamp(vHeight / ${MAX_HEIGHT.toFixed(1)}, 0.0, 1.0) * 65535.0 + 0.5);
        float high = floor(level / 256.0);
        gl_FragColor = vec4(high / 255.0, (level - high * 256.0) / 255.0, 0.0, 1.0);
      }
    `,
  });
}

/**
 * Hides everything that is not solid, still scenery: sky, clouds, stars, the moon, glass and
 * haze (shader or transparent materials), the rain itself (lines and points), and the
 * characters, who walk about and would leave dry ghosts where they last stood.
 */
function hideNonSurfaces(root: Object3D, hidden: Object3D[]) {
  if (!root.visible) return;
  const hide = () => {
    root.visible = false;
    hidden.push(root);
  };
  if (root.name.startsWith('character-')) return hide();
  const mesh = root as Mesh;
  if (mesh.isMesh) {
    const material: Material | undefined = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!material || (material as ShaderMaterial).isShaderMaterial || material.transparent) return hide();
  } else if ('isPoints' in root || 'isLine' in root || 'isSprite' in root) {
    return hide();
  }
  for (const child of root.children) hideNonSurfaces(child, hidden);
}

const scratchClear = new Color();

/**
 * Renders the cover map from a camera high over the block whenever it rains, and again every
 * few seconds while it does. One extra top-down pass at 1024² every four seconds; nothing at
 * all in dry weather.
 */
export function RainCover({ tod }: { tod: TimeOfDayState }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const since = useRef(Number.POSITIVE_INFINITY);
  const { target, camera, material } = useMemo(() => {
    const renderTarget = new WebGLRenderTarget(RESOLUTION, RESOLUTION, {
      // Packed values must never be blended with their neighbours.
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
    });
    const half = REGION.size / 2;
    const top = MAX_HEIGHT + 2;
    const eye = new OrthographicCamera(-half, half, half, -half, 0.5, top + 2);
    eye.position.set(REGION.x0 + half, top, REGION.z0 + half);
    eye.up.set(0, 0, -1);
    eye.lookAt(REGION.x0 + half, 0, REGION.z0 + half);
    eye.updateMatrixWorld();
    return { target: renderTarget, camera: eye, material: createCaptureMaterial() };
  }, []);

  useEffect(
    () => () => {
      if (rainCover.uCoverMap.value === target.texture) rainCover.uCoverMap.value = blank;
      target.dispose();
      material.dispose();
    },
    [target, material],
  );

  useFrame((_, delta) => {
    since.current += delta;
    if (tod.rain <= 0.01 || since.current < RECAPTURE_SECONDS) return;
    since.current = 0;

    const hidden: Object3D[] = [];
    hideNonSurfaces(scene, hidden);
    const previous = {
      target: gl.getRenderTarget(),
      override: scene.overrideMaterial,
      background: scene.background,
      shadows: gl.shadowMap.autoUpdate,
      clear: gl.getClearColor(scratchClear).getHex(),
      alpha: gl.getClearAlpha(),
    };
    scene.overrideMaterial = material;
    scene.background = null;
    // The shadow map belongs to the view camera's frame; this pass must not re-render it.
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(target);
    gl.setClearColor(0x000000, 1);
    gl.clear();
    gl.render(scene, camera);

    gl.setRenderTarget(previous.target);
    gl.setClearColor(previous.clear, previous.alpha);
    gl.shadowMap.autoUpdate = previous.shadows;
    scene.background = previous.background;
    scene.overrideMaterial = previous.override;
    for (const object of hidden) object.visible = true;
    rainCover.uCoverMap.value = target.texture;
  });

  return null;
}
