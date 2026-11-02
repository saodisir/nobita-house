import { config } from '../config';
import { layout } from '../data/scene';
import { ModelOrProxy } from './model-or-proxy';

const { lot, wall, sidewalk, road, streets } = layout;

const PAVING = '#BDB8AE';
const KERB = '#A29C92';
const ASPHALT = '#4C4F55';
const POLE = '#8E8A82';

const HALF = streets.length / 2;
const FRONT_Z0 = road.startZ;
const FRONT_Z1 = road.startZ + road.depth;
const SIDE_X0 = streets.side.startX;
const SIDE_X1 = streets.side.endX;
/** Sidewalk bands, near and far, on each road. */
const NEAR_FRONT: [number, number] = [wall.frontZ, wall.frontZ + sidewalk.depth];
const FAR_FRONT: [number, number] = [FRONT_Z1, FRONT_Z1 + sidewalk.depth];
const NEAR_SIDE: [number, number] = [SIDE_X1, -lot.width / 2];
const FAR_SIDE: [number, number] = [SIDE_X0 - sidewalk.depth, SIDE_X0];
const KERB_W = 0.16;
const KERB_R = streets.kerbRadius;

/**
 * Slab spanning [x0, x1] × [z0, z1] with its top face at `top`. Every street surface is one
 * of these, and exactly one of them owns any given square metre — the strips are cut where a
 * crossing road interrupts them rather than overlapping, which is what keeps the junction free
 * of z-fighting.
 */
function Slab({
  x0,
  x1,
  z0,
  z1,
  top,
  thickness,
  color,
}: {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  thickness: number;
  color: string;
}) {
  return (
    <mesh receiveShadow position={[(x0 + x1) / 2, top - thickness / 2, (z0 + z1) / 2]}>
      <boxGeometry args={[x1 - x0, thickness, z1 - z0]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * Placeholder public realm: the crossroads, its four sidewalk strips and the utility poles.
 * This is what renders whenever `streets.glb` is missing, so the geometry tracks
 * `scripts/blender/streets_build.py` closely enough that the swap to the GLB is invisible.
 */
function StreetsProxy() {
  const kerbTop = sidewalk.height + 0.06;
  return (
    <group name="streets-proxy">
      {/* carriageways: the front road owns the junction, the side road stops at its kerbs */}
      <Slab x0={-HALF} x1={HALF} z0={FRONT_Z0} z1={FRONT_Z1} top={0.06} thickness={0.06} color={ASPHALT} />
      <Slab x0={SIDE_X0} x1={SIDE_X1} z0={-HALF} z1={FRONT_Z0} top={0.06} thickness={0.06} color={ASPHALT} />
      <Slab x0={SIDE_X0} x1={SIDE_X1} z0={FRONT_Z1} z1={HALF} top={0.06} thickness={0.06} color={ASPHALT} />

      {/* front sidewalks, broken where the side road crosses them */}
      {[NEAR_FRONT, FAR_FRONT].map(([z0, z1]) => (
        <group key={z0}>
          <Slab
            x0={-HALF}
            x1={SIDE_X0}
            z0={z0}
            z1={z1}
            top={sidewalk.height}
            thickness={sidewalk.height}
            color={PAVING}
          />
          <Slab
            x0={SIDE_X1}
            x1={HALF}
            z0={z0}
            z1={z1}
            top={sidewalk.height}
            thickness={sidewalk.height}
            color={PAVING}
          />
        </group>
      ))}
      {/* side sidewalks, broken across the whole front road including its own sidewalks */}
      {[NEAR_SIDE, FAR_SIDE].map(([x0, x1]) => (
        <group key={x0}>
          <Slab
            x0={x0}
            x1={x1}
            z0={-HALF}
            z1={NEAR_FRONT[0]}
            top={sidewalk.height}
            thickness={sidewalk.height}
            color={PAVING}
          />
          <Slab
            x0={x0}
            x1={x1}
            z0={FAR_FRONT[1]}
            z1={HALF}
            top={sidewalk.height}
            thickness={sidewalk.height}
            color={PAVING}
          />
        </group>
      ))}

      {/* Kerbs sit on the pavement side of each carriageway edge and stop a corner radius
          short of the junction, the same as streets_build.py. The arcs that carry the kerb
          line round the corner exist only in the GLB. */}
      {[NEAR_FRONT[1] - KERB_W, FAR_FRONT[0]].map((z0) => (
        <group key={z0}>
          <Slab
            x0={-HALF}
            x1={SIDE_X0 - KERB_R}
            z0={z0}
            z1={z0 + KERB_W}
            top={kerbTop}
            thickness={kerbTop}
            color={KERB}
          />
          <Slab
            x0={SIDE_X1 + KERB_R}
            x1={HALF}
            z0={z0}
            z1={z0 + KERB_W}
            top={kerbTop}
            thickness={kerbTop}
            color={KERB}
          />
        </group>
      ))}
      {[NEAR_SIDE[0], FAR_SIDE[1] - KERB_W].map((x0) => (
        <group key={x0}>
          <Slab
            x0={x0}
            x1={x0 + KERB_W}
            z0={-HALF}
            z1={FRONT_Z0 - KERB_R}
            top={kerbTop}
            thickness={kerbTop}
            color={KERB}
          />
          <Slab
            x0={x0}
            x1={x0 + KERB_W}
            z0={FRONT_Z1 + KERB_R}
            z1={HALF}
            top={kerbTop}
            thickness={kerbTop}
            color={KERB}
          />
        </group>
      ))}

      {/* centre dashes, front road only; the side road markings arrive with the GLB */}
      {Array.from({ length: 21 }, (_, i) => (i - 10) * 3).map((x) => (
        <mesh key={x} position={[x, 0.07, (FRONT_Z0 + FRONT_Z1) / 2]}>
          <boxGeometry args={[1.6, 0.02, 0.12]} />
          <meshStandardMaterial color="#E6E4DC" />
        </mesh>
      ))}

      {streets.poles.map(([x, z]) => (
        <mesh key={`${x}-${z}`} castShadow position={[x, streets.poleHeight / 2, z]}>
          <cylinderGeometry args={[0.14, 0.18, streets.poleHeight, 10]} />
          <meshStandardMaterial color={POLE} />
        </mesh>
      ))}
    </group>
  );
}

/** Roads, sidewalks, kerbs, markings and poles — everything outside a lot wall. */
export function Streets() {
  return (
    // Named for the same reason as `neighbours-root`: `NightLights` lights the lamp lenses
    // inside this subtree only.
    <group name="streets-root">
      <ModelOrProxy url={config.models.streets} proxy={<StreetsProxy />}>
        {(gltf) => <primitive object={gltf.scene} />}
      </ModelOrProxy>
    </group>
  );
}
