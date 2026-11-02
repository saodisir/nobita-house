import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  type Group,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { useReducedMotionRef } from '../utils/reduced-motion';
import { RAIN_COVER_GLSL, rainCover } from './rain-cover';
import type { TimeOfDayState } from './use-time-of-day';

const DROP_COUNT = 14000;
/**
 * The volume the drops fill, metres: 64 m square round the view and 26 m of air above the
 * ground, well over the tallest roof. The drops live in world space and wrap inside it, so
 * the box can follow the camera without dragging the rain along with it.
 */
const BOX = new Vector3(64, 26, 64);
/** Terminal velocity of an ordinary raindrop, m/s; each drop varies ±15%. */
const FALL_SPEED = 9;
/** Length of one streak, metres: a drop's motion blur over a frame and a half at 60 fps. */
const STREAK = 0.55;
/** Horizontal drift per metre fallen, x and z: a light breeze leans the rain ~7°. */
const WIND: readonly [number, number] = [0.12, 0.05];
/** Opacity at full rain: a light shower that leaves the garden readable through it. */
const RAIN_OPACITY = 0.6;
/** How far ahead of the eye the box may be pushed while still keeping air round the camera. */
const MAX_LEAD = BOX.x / 2 - 6;

/**
 * Splashes alive at once over the box. Each lives `SPLASH_LIFE` and is reborn somewhere new,
 * so this is ~6,900 impacts a second: ~1.7 per square metre, a light shower.
 */
const SPLASH_COUNT = 2400;
const SPLASH_LIFE = 0.35;
/** World width of a splash sprite, metres; its ring spreads to about this wide. */
const SPLASH_SIZE = 0.22;

/** Written every frame and shared by the streaks and the splashes. */
interface RainUniforms {
  uTime: { value: number };
  uCenter: { value: Vector3 };
  uEye: { value: Vector3 };
  uColor: { value: Color };
  uOpacity: { value: number };
  uHalfHeight: { value: number };
}

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function rand(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/** Two vertices per drop, head and tail, sharing one seed so they always wrap together. */
function createStreakGeometry() {
  const seeds: number[] = [];
  const ends: number[] = [];
  const speeds: number[] = [];
  for (let i = 0; i < DROP_COUNT; i++) {
    const seed = [rand(i + 1), rand(i + 20001), rand(i + 40001)];
    const speed = 0.85 + 0.3 * rand(i + 60001);
    for (const end of [0, 1]) {
      seeds.push(...seed);
      ends.push(end);
      speeds.push(speed);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(seeds, 3));
  geometry.setAttribute('aEnd', new Float32BufferAttribute(ends, 1));
  geometry.setAttribute('aSpeed', new Float32BufferAttribute(speeds, 1));
  return geometry;
}

/** One point per splash: a seed for where it lands each time round, and where in its life it starts. */
function createSplashGeometry() {
  const positions = new Float32Array(SPLASH_COUNT * 3);
  const seeds: number[] = [];
  const phases: number[] = [];
  for (let i = 0; i < SPLASH_COUNT; i++) {
    seeds.push(rand(i + 80001) * 97, rand(i + 90001) * 89);
    phases.push(rand(i + 100001));
  }
  const geometry = new BufferGeometry();
  // three wants a position attribute to size the draw; the shader places every splash itself.
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 2));
  geometry.setAttribute('aPhase', new Float32BufferAttribute(phases, 1));
  return geometry;
}

/**
 * The fall runs in the vertex shader from one time uniform: one draw call, no buffer upload.
 * Each drop's seed is a point in the unit box, scaled to `BOX`, moved down and downwind by how
 * far it has fallen, then wrapped into the box round `uCenter`. Drops fade out near the box's
 * sides and top so the wrap never shows, far away so the edge of the box never shows, and
 * right at the lens where one would streak across the screen. A drop below the rain cover —
 * under a roof, an eave or a tree — is not drawn, so none falls indoors.
 */
function createStreakMaterial(uniforms: RainUniforms) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...(uniforms as unknown as Record<string, { value: unknown }>),
      ...rainCover,
      uBox: { value: BOX },
      uFall: { value: FALL_SPEED },
      uStreak: { value: STREAK },
      uWind: { value: WIND },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCenter;
      uniform vec3 uEye;
      uniform vec3 uBox;
      uniform float uFall;
      uniform float uStreak;
      uniform vec2 uWind;
      attribute float aEnd;   // 0 = head, 1 = tail
      attribute float aSpeed;
      varying float vAlpha;
      ${RAIN_COVER_GLSL}

      void main() {
        float fallen = uTime * uFall * aSpeed;
        vec3 p = position * uBox + vec3(uWind.x, -1.0, uWind.y) * fallen;
        vec3 local = mod(p - uCenter + 0.5 * uBox, uBox) - 0.5 * uBox;
        vec3 head = uCenter + local;
        vec3 tail = head - normalize(vec3(uWind.x, -1.0, uWind.y)) * uStreak * aSpeed;
        vec3 world = mix(head, tail, aEnd);

        vec3 edge = abs(local) / (0.5 * uBox);
        float fade = 1.0 - smoothstep(0.75, 1.0, max(edge.x, edge.z));
        fade *= 1.0 - smoothstep(0.6, 1.0, local.y / (0.5 * uBox.y));
        float dist = distance(head, uEye);
        fade *= smoothstep(0.3, 1.2, dist) * (1.0 - smoothstep(25.0, 55.0, dist));
        // Tested at the head for both ends, so a streak is kept or dropped whole.
        if (head.y < rainCoverAt(head.xz)) fade = 0.0;
        // The tail thins out: a streak tapers behind the drop that makes it.
        vAlpha = fade * (1.0 - 0.7 * aEnd);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        float alpha = vAlpha * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

/**
 * Where drops land. Every splash comes back each `SPLASH_LIFE` at a fresh hashed spot in the
 * box and sits on the rain cover there — the road, a sidewalk, the lawn's blade tips or a
 * roof. It draws as a ring flattened by the angle it is seen at, spreading and fading, with a
 * bright fleck of the impact at its start. Only near ones are drawn; farther out they would
 * be sub-pixel noise.
 */
function createSplashMaterial(uniforms: RainUniforms) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      ...(uniforms as unknown as Record<string, { value: unknown }>),
      ...rainCover,
      uBox: { value: BOX },
      uLife: { value: SPLASH_LIFE },
      uSize: { value: SPLASH_SIZE },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uCenter;
      uniform vec3 uEye;
      uniform vec3 uBox;
      uniform float uLife;
      uniform float uSize;
      uniform float uHalfHeight;
      attribute vec2 aSeed;
      attribute float aPhase;
      varying float vLife;
      varying float vSquash;
      varying float vFade;
      ${RAIN_COVER_GLSL}

      float splashHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float cycle = uTime / uLife + aPhase;
        float turn = floor(cycle);
        vLife = cycle - turn;
        // Wrapped so the hash's sine never sees an argument too large for float precision.
        float hashTurn = mod(turn, 997.0);
        vec2 spot = vec2(splashHash(aSeed + hashTurn * 0.173), splashHash(aSeed.yx - hashTurn * 0.291));
        vec2 xz = uCenter.xz + (spot - 0.5) * uBox.xz;
        vec3 world = vec3(xz.x, rainCoverAt(xz) + 0.02, xz.y);
        vec3 toSplash = world - uEye;
        float dist = length(toSplash);
        vFade = smoothstep(0.6, 1.5, dist) * (1.0 - smoothstep(10.0, 20.0, dist));
        // A ring on the ground is an ellipse whose height is the sine of the view's elevation.
        vSquash = clamp(abs(toSplash.y) / max(dist, 1e-3), 0.18, 1.0);
        vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = vFade > 0.0 ? clamp(uSize * projectionMatrix[1][1] * uHalfHeight / -mvPosition.z, 1.0, 64.0) : 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vLife;
      varying float vSquash;
      varying float vFade;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = length(vec2(c.x, c.y / vSquash));
        if (r > 1.0) discard;
        float ring = smoothstep(0.16, 0.0, abs(r - (0.2 + 0.75 * vLife))) * (1.0 - vLife);
        float fleck = smoothstep(0.3, 0.0, r) * (1.0 - smoothstep(0.0, 0.2, vLife));
        float alpha = (ring * 0.45 + fleck * 0.8) * vFade * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  });
}

const WHITE = new Color('#FFFFFF');
const scratchDirection = new Vector3();
const scratchSize = new Vector2();

/**
 * Rain falling over the block and splashing where it lands, faded in and out with the
 * weather. The drop volume follows the view: it is pushed ahead of the camera toward where it
 * looks at the ground, so the shower fills the frame both at street level and from the far
 * orbit. Streaks and splashes take the sky's haze colour lifted toward white, so they read
 * pale by day and grey-blue at night. With reduced motion the drops hang still.
 */
export function Rain({ tod }: { tod: TimeOfDayState }) {
  const shower = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const reduced = useReducedMotionRef();
  const { uniforms, streakGeometry, streakMaterial, splashGeometry, splashMaterial } = useMemo(() => {
    const shared: RainUniforms = {
      uTime: { value: 0 },
      uCenter: { value: new Vector3(0, BOX.y / 2, 0) },
      uEye: { value: new Vector3() },
      uColor: { value: new Color() },
      uOpacity: { value: 0 },
      uHalfHeight: { value: 1 },
    };
    return {
      uniforms: shared,
      streakGeometry: createStreakGeometry(),
      streakMaterial: createStreakMaterial(shared),
      splashGeometry: createSplashGeometry(),
      splashMaterial: createSplashMaterial(shared),
    };
  }, []);

  useFrame((state, delta) => {
    const group = shower.current;
    if (!group) return;
    group.visible = tod.rain > 0.01;
    if (!group.visible) return;
    if (!reduced.current) uniforms.uTime.value += delta;

    const eye = camera.position;
    const look = camera.getWorldDirection(scratchDirection);
    // Distance along the view to the ground, or the full lead when looking at the horizon.
    const toGround = look.y < -1e-3 ? eye.y / -look.y : Number.POSITIVE_INFINITY;
    const horizontal = Math.hypot(look.x, look.z);
    const lead = horizontal > 1e-3 ? Math.min((toGround * horizontal) / 2, MAX_LEAD) / horizontal : 0;
    uniforms.uCenter.value.set(eye.x + look.x * lead, BOX.y / 2, eye.z + look.z * lead);
    uniforms.uEye.value.copy(eye);
    uniforms.uColor.value.copy(tod.fogColor).lerp(WHITE, 0.55);
    uniforms.uOpacity.value = tod.rain * RAIN_OPACITY;
    uniforms.uHalfHeight.value = state.gl.getDrawingBufferSize(scratchSize).y / 2;
  });

  // Every vertex is moved in the shader; the seed positions say nothing about where drops are.
  return (
    <group ref={shower} name="rain">
      <lineSegments geometry={streakGeometry} material={streakMaterial} frustumCulled={false} />
      <points geometry={splashGeometry} material={splashMaterial} frustumCulled={false} />
    </group>
  );
}
