import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry, DoubleSide } from 'three';
import { config } from '../config';
import {
  houseTransform,
  houseVariants,
  layout,
  NEIGHBOUR_GATE_WIDTH,
  type NeighbourLot,
  neighbourEntry,
  SANDLOT_EDGES,
  sandlotEdge,
} from '../data/scene';
import { LawnGroundScene } from './lawn-grass';
import { ModelOrProxy } from './model-or-proxy';

const YARD = '#8FA86A';
const CONCRETE = '#C9C2B6';
const COPING = '#ADA79C';
const GATE = '#8E9AA6';
const WALK = '#B9B3A8';
const DIRT = '#B08D66';
const BOARD = '#C9A55C';
const BAMBOO = '#CDB36A';

const WALL_H = 1.4;
const WALL_T = 0.2;

const neighbours = layout.neighbours as readonly NeighbourLot[];

/**
 * Hip or gable roof as one buffer geometry: four eave corners plus a ridge line of length
 * `ridge`. A ridge as long as the roof degenerates the two hip triangles into vertical gable
 * ends, so the same six vertices cover every variant. Built with the ridge along X and
 * rotated a quarter turn when the variant runs it along Z.
 */
function roofGeometry(width: number, depth: number, height: number, ridge: number) {
  const hw = width / 2;
  const hd = depth / 2;
  const hr = Math.min(ridge, width) / 2;
  // 0..3 eaves anticlockwise from the back-left corner, 4..5 the ridge ends.
  const v = [
    [-hw, 0, -hd],
    [hw, 0, -hd],
    [hw, 0, hd],
    [-hw, 0, hd],
    [-hr, height, 0],
    [hr, height, 0],
  ];
  const faces = [
    [3, 2, 5],
    [3, 5, 4], // front slope
    [1, 0, 4],
    [1, 4, 5], // back slope
    [0, 3, 4], // left end
    [2, 1, 5], // right end
  ];
  const positions = new Float32Array(faces.length * 9);
  faces.forEach((face, f) => {
    face.forEach((index, k) => {
      const p = v[index] as number[];
      positions.set(p, f * 9 + k * 3);
    });
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function Roof({
  width,
  depth,
  height,
  ridge,
  ridgeAxis,
  y,
  color,
}: {
  width: number;
  depth: number;
  height: number;
  ridge: number;
  ridgeAxis: 'x' | 'z';
  y: number;
  color: string;
}) {
  const geometry = useMemo(
    () =>
      ridgeAxis === 'x'
        ? roofGeometry(width, depth, height, ridge)
        : roofGeometry(depth, width, height, ridge),
    [width, depth, height, ridge, ridgeAxis],
  );
  return (
    <mesh
      castShadow
      receiveShadow
      geometry={geometry}
      position={[0, y, 0]}
      rotation={[0, ridgeAxis === 'x' ? 0 : Math.PI / 2, 0]}
    >
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  );
}

/** Block wall around a lot, opened for a gate in line with the front door. */
function LotWall({ n }: { n: NeighbourLot }) {
  const { lot: r, facing } = n;
  const { gate } = neighbourEntry(n);
  const runs: { key: string; x: number; z: number; w: number; d: number }[] = [];
  const push = (key: string, x0: number, x1: number, z0: number, z1: number) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    runs.push({ key, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
  };
  // Sides that are not the facing side run solid from corner to corner.
  const gapAlongX = facing === '+z' || facing === '-z';
  const gapCentre = gapAlongX ? gate[0] : gate[1];
  const g0 = gapCentre - NEIGHBOUR_GATE_WIDTH / 2;
  const g1 = gapCentre + NEIGHBOUR_GATE_WIDTH / 2;
  const openZ = facing === '+z' ? r.z1 : facing === '-z' ? r.z0 : undefined;
  const openX = facing === '+x' ? r.x1 : undefined;

  for (const z of [r.z0, r.z1]) {
    if (z === openZ) {
      push(`x-${z}-a`, r.x0, Math.min(g0, r.x1), z - WALL_T / 2, z + WALL_T / 2);
      push(`x-${z}-b`, Math.max(g1, r.x0), r.x1, z - WALL_T / 2, z + WALL_T / 2);
    } else {
      push(`x-${z}`, r.x0, r.x1, z - WALL_T / 2, z + WALL_T / 2);
    }
  }
  for (const x of [r.x0, r.x1]) {
    if (x === openX) {
      push(`z-${x}-a`, x - WALL_T / 2, x + WALL_T / 2, r.z0, Math.min(g0, r.z1));
      push(`z-${x}-b`, x - WALL_T / 2, x + WALL_T / 2, Math.max(g1, r.z0), r.z1);
    } else {
      push(`z-${x}`, x - WALL_T / 2, x + WALL_T / 2, r.z0, r.z1);
    }
  }
  return (
    <group>
      {runs.map((run) => (
        <group key={run.key}>
          <mesh castShadow receiveShadow position={[run.x, WALL_H / 2, run.z]}>
            <boxGeometry args={[run.w, WALL_H, run.d]} />
            <meshStandardMaterial color={CONCRETE} />
          </mesh>
          <mesh position={[run.x, WALL_H + 0.03, run.z]}>
            <boxGeometry args={[run.w + 0.04, 0.06, run.d + 0.04]} />
            <meshStandardMaterial color={COPING} />
          </mesh>
        </group>
      ))}
      {/* gate leaf across the opening */}
      <mesh
        position={
          gapAlongX
            ? [gapCentre, 0.7, (openZ ?? r.z0) as number]
            : [(openX ?? r.x0) as number, 0.7, gapCentre]
        }
      >
        <boxGeometry
          args={gapAlongX ? [NEIGHBOUR_GATE_WIDTH, 1.3, 0.06] : [0.06, 1.3, NEIGHBOUR_GATE_WIDTH]}
        />
        <meshStandardMaterial color={GATE} />
      </mesh>
    </group>
  );
}

/** One neighbour lot: yard, wall with a gate, and a massing block under its roof. */
function NeighbourProxy({ n }: { n: NeighbourLot }) {
  const v = houseVariants[n.variant];
  const { centre, yaw } = houseTransform(n);
  const upperW = v.width - 2 * v.upperInset;
  const upperD = v.depth - 2 * v.upperInset;
  const upperH = v.eaveHeight - v.groundHeight;
  const { path } = neighbourEntry(n);
  return (
    <group name={`lot-${n.id}`}>
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(n.lot.x0 + n.lot.x1) / 2, 0.005, (n.lot.z0 + n.lot.z1) / 2]}
      >
        <planeGeometry args={[n.lot.x1 - n.lot.x0, n.lot.z1 - n.lot.z0]} />
        <meshStandardMaterial color={YARD} />
      </mesh>
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(path.x0 + path.x1) / 2, 0.012, (path.z0 + path.z1) / 2]}
      >
        <planeGeometry args={[path.x1 - path.x0, path.z1 - path.z0]} />
        <meshStandardMaterial color={WALK} />
      </mesh>
      <LotWall n={n} />
      <group position={[centre[0], 0, centre[1]]} rotation={[0, yaw, 0]}>
        <mesh castShadow receiveShadow position={[0, v.groundHeight / 2, 0]}>
          <boxGeometry args={[v.width, v.groundHeight, v.depth]} />
          <meshStandardMaterial color={n.wall} />
        </mesh>
        {v.storeys === 2 && (
          <mesh castShadow receiveShadow position={[0, v.groundHeight + upperH / 2, 0]}>
            <boxGeometry args={[upperW, upperH, upperD]} />
            <meshStandardMaterial color={n.wall} />
          </mesh>
        )}
        <Roof
          width={v.roof.width}
          depth={v.roof.depth}
          height={v.roof.height}
          ridge={v.roof.ridge}
          ridgeAxis={v.roof.ridgeAxis}
          y={v.eaveHeight}
          color={n.roof}
        />
      </group>
    </group>
  );
}

/**
 * The vacant lot: grass worn bare in the middle, block walls and a board fence on the closed
 * edges, open to the sidewalk, the three concrete pipes, the ring pyramid and the bamboo
 * bundle. The bare patches are plain ellipses here; the GLB cuts their wobbled edge.
 */
function SandlotProxy() {
  const { lot: r, bare, pipes, rings, poles, fenceHeight } = layout.sandlot;
  const edges = SANDLOT_EDGES.map((edge) => {
    const alongX = edge === '-z' || edge === '+z';
    const at = edge === '-x' ? r.x0 : edge === '+x' ? r.x1 : edge === '-z' ? r.z0 : r.z1;
    const kind = sandlotEdge(edge);
    const h = kind === 'fence' ? fenceHeight : WALL_H;
    const t = kind === 'fence' ? 0.04 : WALL_T;
    return {
      edge,
      kind,
      position: alongX
        ? ([(r.x0 + r.x1) / 2, h / 2, at] as const)
        : ([at, h / 2, (r.z0 + r.z1) / 2] as const),
      size: alongX ? ([r.x1 - r.x0 + t, h, t] as const) : ([t, h, r.z1 - r.z0 + t] as const),
    };
  });
  const gap = 0.03;
  const stack: [number, number][] = [
    [pipes.radius, -pipes.radius - gap],
    [pipes.radius, pipes.radius + gap],
    [pipes.radius + Math.sqrt(3) * (pipes.radius + gap), 0],
  ];
  const ringRow = rings.radius * 2 + 0.02;
  const ringRise = Math.sqrt(3) * (rings.radius + 0.01);
  const pyramid: [number, number][] = [
    [-ringRow, rings.radius],
    [0, rings.radius],
    [ringRow, rings.radius],
    [-ringRow / 2, rings.radius + ringRise],
    [ringRow / 2, rings.radius + ringRise],
    [0, rings.radius + 2 * ringRise],
  ];
  return (
    <group name="sandlot-proxy">
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[(r.x0 + r.x1) / 2, 0.005, (r.z0 + r.z1) / 2]}
      >
        <planeGeometry args={[r.x1 - r.x0, r.z1 - r.z0]} />
        <meshStandardMaterial color={YARD} />
      </mesh>
      {bare.map(({ centre, rx, rz }) => (
        <mesh
          key={centre[0]}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
          position={[centre[0], 0.012, centre[1]]}
          scale={[rx, rz, 1]}
        >
          <circleGeometry args={[1, 32]} />
          <meshStandardMaterial color={DIRT} />
        </mesh>
      ))}
      {edges.map(
        (e) =>
          e.kind !== 'open' && (
            <mesh key={e.edge} castShadow receiveShadow position={e.position}>
              <boxGeometry args={e.size} />
              <meshStandardMaterial color={e.kind === 'fence' ? BOARD : CONCRETE} />
            </mesh>
          ),
      )}
      {stack.map(([y, dz]) => (
        <mesh
          key={dz + y}
          castShadow
          receiveShadow
          position={[pipes.centre[0], y, pipes.centre[1] + dz]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[pipes.radius, pipes.radius, pipes.length, 16, 1, true]} />
          <meshStandardMaterial color={CONCRETE} side={DoubleSide} />
        </mesh>
      ))}
      {pyramid.map(([dx, y]) => (
        <mesh
          key={dx + y}
          castShadow
          position={[rings.centre[0] + dx, y, rings.centre[1]]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[rings.radius, rings.radius, rings.length, 12, 1, true]} />
          <meshStandardMaterial color={CONCRETE} side={DoubleSide} />
        </mesh>
      ))}
      <mesh castShadow position={[poles.centre[0], poles.radius, poles.centre[1]]}>
        <boxGeometry args={[poles.radius * 2, poles.radius * 2, poles.length]} />
        <meshStandardMaterial color={BAMBOO} />
      </mesh>
    </group>
  );
}

function NeighboursProxy() {
  return (
    <group name="neighbours-proxy">
      {neighbours.map((n) => (
        <NeighbourProxy key={n.id} n={n} />
      ))}
      <SandlotProxy />
    </group>
  );
}

/** The neighbour lots and the sandlot straight across the road from Nobita's gate. */
export function Neighbours() {
  return (
    <>
      {/* Named so `NightLights` can scope its material search here; material names repeat
          across the GLBs, so a scene-wide match lights the wrong objects. */}
      <group name="neighbours-root">
        <ModelOrProxy url={config.models.neighbours} proxy={<NeighboursProxy />}>
          {(gltf) => <LawnGroundScene scene={gltf.scene} />}
        </ModelOrProxy>
      </group>
    </>
  );
}
