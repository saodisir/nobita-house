import { config } from '../config';
import { layout } from '../data/scene';
import { LawnGroundScene } from './lawn-grass';
import { ModelOrProxy } from './model-or-proxy';
import { ShedDoor } from './shed';

const { lot, wall } = layout;
const CONCRETE = '#C9C2B6';
const GRASS = '#7FB25A';

/** Nobita's lot only: yard, block wall with a gate opening, gate. The sidewalk, road and
 * utility pole belong to `streets.tsx`, which owns every surface outside a lot wall. */
function EnvironmentProxy() {
  const halfW = lot.width / 2;
  const halfD = lot.depth / 2;
  const backZ = wall.frontZ - lot.depth;
  const t = lot.wallThickness;
  const h = lot.wallHeight;
  // Front wall is split around the gate opening.
  const leftLen = wall.gateX - wall.gateWidth / 2 + halfW;
  const rightLen = halfW - (wall.gateX + wall.gateWidth / 2);
  return (
    <group name="environment-proxy">
      {/* yard */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, wall.frontZ - halfD]}>
        <planeGeometry args={[lot.width, lot.depth]} />
        <meshStandardMaterial color={GRASS} />
      </mesh>
      {/* front wall, two segments */}
      <mesh castShadow receiveShadow position={[-halfW + leftLen / 2, h / 2, wall.frontZ]}>
        <boxGeometry args={[leftLen, h, t]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh castShadow receiveShadow position={[halfW - rightLen / 2, h / 2, wall.frontZ]}>
        <boxGeometry args={[rightLen, h, t]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      {/* gate */}
      <mesh position={[wall.gateX, 0.9, wall.frontZ]}>
        <boxGeometry args={[wall.gateWidth, 1.8, 0.06]} />
        <meshStandardMaterial color="#A9763F" />
      </mesh>
      {/* side + back walls */}
      <mesh castShadow receiveShadow position={[-halfW, h / 2, wall.frontZ - halfD]}>
        <boxGeometry args={[t, h, lot.depth]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh castShadow receiveShadow position={[halfW, h / 2, wall.frontZ - halfD]}>
        <boxGeometry args={[t, h, lot.depth]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, h / 2, backZ]}>
        <boxGeometry args={[lot.width, h, t]} />
        <meshStandardMaterial color={CONCRETE} />
      </mesh>
    </group>
  );
}

export function Environment() {
  return (
    <ModelOrProxy url={config.models.environment} proxy={<EnvironmentProxy />}>
      {(gltf) => (
        <>
          <LawnGroundScene scene={gltf.scene} />
          <ShedDoor scene={gltf.scene} />
        </>
      )}
    </ModelOrProxy>
  );
}
