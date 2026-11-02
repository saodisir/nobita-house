import { useLayoutEffect } from 'react';
import { Box3, type Group, type Mesh, Vector3 } from 'three';
import { config } from '../config';
import { type Resident, residents, residentsEnabled } from '../data/residents';
import { type LoadedGltf, ModelOrProxy } from './model-or-proxy';

/**
 * A sculpt, fitted to the room: scaled to the height the plan allows and set down on the origin
 * the group already put it on, whatever scale and offset Rodin exported it at. Doing it here
 * rather than in Blender means a new sculpt drops in without a second pipeline step — and a
 * figure that arrives a hundred times too big lands on the floor instead of swallowing the house.
 */
function ResidentModel({ gltf, res }: { gltf: LoadedGltf; res: Resident }) {
  useLayoutEffect(() => {
    const scene = gltf.scene as Group;
    scene.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    if (size.y <= 1e-6) return;
    const k = res.height / size.y;
    scene.scale.setScalar(k);
    scene.position.set(
      (-(box.min.x + box.max.x) / 2) * k,
      -box.min.y * k,
      (-(box.min.z + box.max.z) / 2) * k,
    );
  }, [gltf.scene, res.height]);
  return <primitive object={gltf.scene} />;
}

/**
 * The parents, standing and sitting in the house — once `residentsEnabled` says so and their
 * sculpts are in `public/models/residents/`. There is no stand-in any more: a missing sculpt
 * renders nothing, so the scene shows a house with nobody in it rather than two figures that
 * read as a modelling mistake.
 *
 * They are siblings of the house rather than part of it, so they stay on the ground floor when
 * the roof comes off and the upper floor slides away — and they are rendered here, not in
 * `HouseModel`, so `/editor` stays a plan.
 */
export function Residents() {
  if (!residentsEnabled) return null;
  return (
    <group name="residents">
      {residents.map((res) => (
        <group
          key={res.id}
          name={`resident-${res.id}`}
          position={[res.position[0], res.position[1], res.position[2]]}
          rotation={[0, res.rotationY + (res.modelYaw ?? 0), 0]}
        >
          <ModelOrProxy url={`${config.models.residentDir}/${res.id}.glb`} proxy={null}>
            {(gltf) => <ResidentModel gltf={gltf} res={res} />}
          </ModelOrProxy>
        </group>
      ))}
    </group>
  );
}
