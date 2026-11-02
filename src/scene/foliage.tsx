import { useMemo } from 'react';
import { Box3, type Group, type Material } from 'three';
import { config } from '../config';
import { inHeroLot, layout } from '../data/scene';
import { type LoadedGltf, ModelOrProxy } from './model-or-proxy';

/**
 * Trees and shrubs, placed per instance rather than baked into the environment mesh, so a
 * Hyper3D Rodin model can replace the placeholder without re-exporting the whole yard.
 * Each instance gets a deterministic yaw and scale jitter; identical copies read as clones.
 */

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function jitter(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

type TreeKind = 'tree' | 'sakura';

const CANOPY: Record<TreeKind, string> = { tree: '#4E9A3B', sakura: '#F0A9BF' };

function TreeProxy({
  height,
  radius,
  kind,
  shadows,
}: {
  height: number;
  radius: number;
  kind: TreeKind;
  shadows: boolean;
}) {
  return (
    <group>
      <mesh castShadow={shadows} position={[0, height * 0.25, 0]}>
        <cylinderGeometry args={[0.16, 0.24, height * 0.5, 8]} />
        <meshStandardMaterial color="#6B4A2B" />
      </mesh>
      <mesh castShadow={shadows} position={[0, height * 0.5 + radius * 0.8, 0]}>
        <sphereGeometry args={[radius, 12, 10]} />
        <meshStandardMaterial color={CANOPY[kind]} flatShading />
      </mesh>
    </group>
  );
}

function ShrubProxy({ height, shadows }: { height: number; shadows: boolean }) {
  return (
    <mesh castShadow={shadows} position={[0, height * 0.5, 0]}>
      <sphereGeometry args={[height * 0.62, 10, 8]} />
      <meshStandardMaterial color="#4F8F3C" flatShading />
    </mesh>
  );
}

/**
 * How much more skylight foliage takes than an opaque surface: the canopy bodies and the leaf
 * and blossom cards on them alike, so the two stay in step on both sides. Real foliage passes
 * light through itself; a solid clay puff lit only by N·L goes a flat maroon on the side away
 * from the key, which from the street is the side you see all morning. Scaling the indirect
 * (hemisphere) term instead of adding emission keeps the lift tied to the sky, so the
 * canopies still darken with it at dusk and night.
 */
const CANOPY_SKYLIGHT = 3.2;
const skylit = new WeakSet<Material>();

function liftSkylight(material: Material) {
  if (skylit.has(material)) return;
  skylit.add(material);
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse *= ${CANOPY_SKYLIGHT.toFixed(2)};`,
    );
  };
  material.customProgramCacheKey = () => `canopy-skylight-${CANOPY_SKYLIGHT}`;
  material.needsUpdate = true;
}

/**
 * Clones the loaded scene so several instances of one GLB can coexist.
 *
 * `shadows` is off for everything planted outside Nobita's lot. Each tree is three draw
 * calls (bark, canopy, cards) and 44–54k triangles, and the shadow map now spans the whole
 * block, so the neighbours' planting would double its own cost to darken yards nobody
 * orbits into.
 */
function Instance({ gltf, scale, shadows }: { gltf: LoadedGltf; scale: number; shadows: boolean }) {
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true) as Group;
    clone.traverse((node) => {
      const mesh = node as {
        isMesh?: boolean;
        castShadow?: boolean;
        receiveShadow?: boolean;
        material?: Material;
      };
      if (!mesh.isMesh || !mesh.material) return;
      const name = mesh.material.name;
      // Leaf and blossom cards neither cast nor receive shadows. Every canopy has a solid
      // body under its cards that casts for it; cards casting too speckle that body with
      // hundreds of little shadows, and receiving them self-shadows into a muddy dark mass.
      const card = name.includes('card');
      mesh.castShadow = shadows && !card;
      mesh.receiveShadow = !card;
      if (card || name.endsWith('_canopy')) liftSkylight(mesh.material);
    });
    return clone;
  }, [gltf.scene, shadows]);
  return <primitive object={scene} scale={scale} />;
}

/** Scales a loaded model so its own height matches the placement's target height. */
function useUnitScale(gltf: LoadedGltf, target: number) {
  return useMemo(() => {
    // Measure in world space: meshopt quantisation stores positions in integer units and
    // puts the real scale on the node, so geometry-space bounds are meaningless here.
    const box = new Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    return height > 0.01 ? target / height : 1;
  }, [gltf.scene, target]);
}

function Tree({
  index,
  position,
  height,
  radius,
  kind,
}: {
  index: number;
  position: readonly [number, number, number];
  height: number;
  radius: number;
  kind: TreeKind;
}) {
  const yaw = jitter(index + 1) * Math.PI * 2;
  const size = 1 + (jitter(index + 7) - 0.5) * 0.16;
  const url = kind === 'sakura' ? config.models.sakura : config.models.tree;
  const shadows = inHeroLot(position[0], position[2]);
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <ModelOrProxy
        url={url}
        proxy={<TreeProxy height={height} radius={radius} kind={kind} shadows={shadows} />}
      >
        {(gltf) => <ScaledInstance gltf={gltf} target={height * size} shadows={shadows} />}
      </ModelOrProxy>
    </group>
  );
}

function ScaledInstance({ gltf, target, shadows }: { gltf: LoadedGltf; target: number; shadows: boolean }) {
  const scale = useUnitScale(gltf, target);
  return <Instance gltf={gltf} scale={scale} shadows={shadows} />;
}

export function Foliage() {
  const shrubs = layout.hedges.flatMap((row, rowIndex) =>
    Array.from({ length: row.count }, (_, i) => ({
      key: `${rowIndex}-${i}`,
      seed: rowIndex * 31 + i,
      position: [
        row.start[0] + (row.axis === 'z' ? 0 : i * row.spacing),
        row.start[1],
        row.start[2] + (row.axis === 'z' ? i * row.spacing : 0),
      ] as const,
      height: row.height,
    })),
  );

  return (
    <group name="foliage">
      {layout.trees.map((tree, index) => (
        <Tree
          key={`${tree.position[0]}-${tree.position[2]}`}
          index={index}
          position={tree.position}
          height={tree.height}
          radius={tree.radius}
          kind={tree.kind}
        />
      ))}
      {shrubs.map((shrub) => {
        const shadows = inHeroLot(shrub.position[0], shrub.position[2]);
        return (
          <group
            key={shrub.key}
            position={shrub.position}
            rotation={[0, jitter(shrub.seed + 3) * Math.PI * 2, 0]}
          >
            <ModelOrProxy
              url={config.models.hedge}
              proxy={<ShrubProxy height={shrub.height} shadows={shadows} />}
            >
              {(gltf) => (
                <ScaledInstance
                  gltf={gltf}
                  target={shrub.height * (1 + (jitter(shrub.seed + 11) - 0.5) * 0.18)}
                  shadows={shadows}
                />
              )}
            </ModelOrProxy>
          </group>
        );
      })}
    </group>
  );
}
