import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, type Group, type Material, type Mesh, type Object3D } from 'three';
import { playOpenSfx } from '../audio/sfx';
import type { Rect } from '../data/scene';
import { SHED, SHED_DOOR_ID, SHED_LEAF_Z, shedWallRects } from '../data/shed';
import type { OpenMotion } from '../editor/house/build-shell';
import { useAppStore } from '../state/store';
import { prefersReducedMotion } from '../utils/reduced-motion';

/** Same pace as the house's leaves, so a click on either sounds and reads alike. */
const TRAVEL_SECONDS = 0.45;
const SWING: OpenMotion = { kind: 'swing', degrees: 90 };
const HALF_LEAF = (SHED.door.x1 - SHED.door.x0) / 2;
const LEAF_Y = SHED.base + SHED.door.height / 2;

/** GLB materials are single `MeshStandardMaterial`s; the helpers never make arrays here. */
function materialOf(mesh: Mesh | undefined): Material | undefined {
  const m = mesh?.material;
  return Array.isArray(m) ? m[0] : m;
}

/** A box standing on the lot, from a plan rectangle and a height span. */
function Slab({ rect, y0, y1, material }: { rect: Rect; y0: number; y1: number; material: Material }) {
  return (
    <mesh
      position={[(rect.x0 + rect.x1) / 2, (y0 + y1) / 2, (rect.z0 + rect.z1) / 2]}
      material={material}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[rect.x1 - rect.x0, y1 - y0, rect.z1 - rect.z0]} />
    </mesh>
  );
}

/**
 * The back-yard shed, rebuilt over the GLB.
 *
 * `environment.glb` has a solid `shed_walls` box with two door panels painted on it. There is
 * no doorway to walk through and no Blender here to re-export the model, so the solid box and
 * its painted panels are hidden and a shell with a real opening is drawn in their place, using
 * the GLB's own materials and the same `shed.ts` numbers the walker collides against. The roof
 * stays exactly where the model put it.
 *
 * The leaves are hinged at the outer jambs and swing out toward the house. `openDoors` is the
 * one truth: a click on a leaf, the first-person crosshair, the collision and this animation
 * all read the same entry, so an open leaf is a hole and a shut one is a wall.
 */
export function ShedDoor({ scene }: { scene: Object3D }) {
  const open = useAppStore((s) => s.openDoors[SHED_DOOR_ID] ?? false);
  const toggleDoor = useAppStore((s) => s.toggleDoor);
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  const t = useRef(0);

  const mats = useMemo(() => {
    const walls = scene.getObjectByName('shed_walls') as Mesh | undefined;
    const panel = scene.getObjectByName('shed_door_0') as Mesh | undefined;
    const handle = scene.getObjectByName('shed_handle') as Mesh | undefined;
    const wall = materialOf(walls);
    const probe = import.meta.env.DEV
      ? (() => {
          const box = walls ? new Box3().setFromObject(walls) : null;
          const p = {
            names: [] as string[],
            boxes: {} as Record<string, { min: number[]; max: number[] }>,
            found: { walls: !!walls, panel: !!panel, handle: !!handle },
            box: box ? { min: box.min.toArray(), max: box.max.toArray() } : null,
            hidden: false,
          };
          scene.traverse((o) => {
            if (!o.name.includes('shed')) return;
            p.names.push(o.name);
            const b = new Box3().setFromObject(o);
            p.boxes[o.name] = { min: b.min.toArray(), max: b.max.toArray() };
          });
          (window as unknown as { __shedProbe: unknown }).__shedProbe = p;
          // Kept off the probe object: a three scene has cycles and cannot be returned by value.
          (window as unknown as { __shedScene: unknown }).__shedScene = scene;
          return p;
        })()
      : null;
    // Hiding is idempotent and has to happen before the first frame, otherwise the solid box
    // would show through the doorway for one frame. A missing name leaves the old model alone
    // rather than drawing a second shed on top of it.
    if (!wall) return null;
    for (const node of [walls, panel, handle]) if (node) node.visible = false;
    if (probe) probe.hidden = true;
    return { wall, wood: materialOf(panel) ?? wall, metal: materialOf(handle) ?? wall };
  }, [scene]);

  useFrame((_, delta) => {
    const target = open ? 1 : 0;
    if (t.current === target) return;
    const step = prefersReducedMotion() ? 1 : delta / TRAVEL_SECONDS;
    const gap = target - t.current;
    t.current = Math.abs(gap) <= step ? target : t.current + Math.sign(gap) * step;
    const eased = t.current * t.current * (3 - 2 * t.current);
    // Three's -90° about Y takes +x to +z; +90° takes -x to +z. Both leaves open outward.
    if (left.current) left.current.rotation.y = -(Math.PI / 2) * eased;
    if (right.current) right.current.rotation.y = (Math.PI / 2) * eased;
  });

  // Watch the state, not the click: the centre-of-screen ray toggles the very same entry.
  const seen = useRef(open);
  useEffect(() => {
    if (seen.current === open) return;
    seen.current = open;
    playOpenSfx(SWING, 'start');
    const clack = window.setTimeout(() => playOpenSfx(SWING, 'end'), TRAVEL_SECONDS * 1000);
    return () => window.clearTimeout(clack);
  }, [open]);

  const onLeaf = (event: ThreeEvent<MouseEvent>) => {
    // In first person `FreeWalk` stops the press before it reaches the canvas and casts its
    // own centre ray; this is the other half of that handover, as in `doors.tsx`.
    if (document.pointerLockElement) return;
    event.stopPropagation();
    toggleDoor(SHED_DOOR_ID);
  };

  if (!mats) return null;
  const w = SHED.walls;
  const d = SHED.door;
  const t0 = SHED.thickness;
  const top = SHED.base + SHED.height;
  const lintel: Rect = { x0: d.x0, x1: d.x1, z0: w.z1 - t0, z1: w.z1 };
  const floor: Rect = { x0: w.x0, x1: w.x1, z0: w.z0, z1: w.z1 };
  const leafX = HALF_LEAF / 2;

  return (
    <group name="shed-door">
      {shedWallRects().map((rect, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the shell is a fixed set of five walls.
        <Slab key={i} rect={rect} y0={SHED.base} y1={top} material={mats.wall} />
      ))}
      <Slab rect={lintel} y0={SHED.base + d.height} y1={top} material={mats.wall} />
      <Slab rect={floor} y0={0} y1={SHED.base} material={mats.wall} />

      <group ref={left} position={[d.x0, LEAF_Y, SHED_LEAF_Z]} onClick={onLeaf}>
        <mesh
          position={[leafX, 0, 0]}
          material={mats.wood}
          castShadow
          receiveShadow
          userData={{ door: SHED_DOOR_ID }}
        >
          <boxGeometry args={[HALF_LEAF - 0.01, d.height - 0.02, 0.04]} />
        </mesh>
        <mesh position={[HALF_LEAF - 0.07, 0, 0.04]} material={mats.metal}>
          <boxGeometry args={[0.05, 0.18, 0.04]} />
        </mesh>
      </group>
      <group ref={right} position={[d.x1, LEAF_Y, SHED_LEAF_Z]} onClick={onLeaf}>
        <mesh
          position={[-leafX, 0, 0]}
          material={mats.wood}
          castShadow
          receiveShadow
          userData={{ door: SHED_DOOR_ID }}
        >
          <boxGeometry args={[HALF_LEAF - 0.01, d.height - 0.02, 0.04]} />
        </mesh>
        <mesh position={[-HALF_LEAF + 0.07, 0, 0.04]} material={mats.metal}>
          <boxGeometry args={[0.05, 0.18, 0.04]} />
        </mesh>
      </group>
    </group>
  );
}
