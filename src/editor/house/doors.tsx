import { type ThreeEvent, useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { type Group, type Material, Raycaster } from 'three';
import { playOpenSfx } from '../../audio/sfx';
import { useAppStore } from '../../state/store';
import { prefersReducedMotion } from '../../utils/reduced-motion';
import type { Door, DoorLeafPart } from './build-shell';
import { type MaterialKey, specOf } from './materials';

/** Seconds to swing or slide fully: the diorama's pace, slow enough to read. */
const TRAVEL_SECONDS = 0.45;
/** A press that moved further than this, in pixels, was a drag of the view, not a click. */
const CLICK_SLOP = 4;
/** How often a pointer moving over a door re-checks that the door is what it is over. */
const HOVER_EVERY_MS = 100;
const DEG = Math.PI / 180;
const raycaster = new Raycaster();

/** Mark for meshes a click passes through: glass, water, the section cap. */
export const CLICK_THROUGH = { clickThrough: true } as const;

interface Props {
  doors: Door[];
  materials: Record<MaterialKey, Material>;
  capMaterial: Material;
  /** The whole house, walls and doors alike: what a click has to reach a door through. */
  root: RefObject<Group | null>;
  cutY: number | null;
  /** A door a room view looks in through: it opens when that view is chosen. */
  opened?: string;
}

/** Every door in the house, each opened and shut by a click on any of its leaves. */
export function Doors({ doors, ...rest }: Props) {
  return doors.map((door) => <DoorLeaves key={door.id} door={door} {...rest} />);
}

/**
 * Whether the pointer's ray meets this door before anything else that is actually drawn.
 * The pointer events only test the doors, so a door behind a wall would answer too. And a
 * raycast knows nothing of clipping planes: without skipping what the storey cut removed, the
 * roof would swallow every click on a plan view.
 */
function reaches(
  event: ThreeEvent<MouseEvent | PointerEvent>,
  root: Group | null,
  cutY: number | null,
  id: string,
) {
  if (!root) return false;
  raycaster.ray.copy(event.ray);
  const hit = raycaster
    .intersectObject(root, true)
    .find((h) => !h.object.userData.clickThrough && (cutY === null || h.point.y <= cutY));
  return hit?.object.userData.door === id;
}

/** Shut at 0, open at 1; eased so a leaf starts and settles softly. */
function pose(group: Group | null, leaf: DoorLeafPart, t: number) {
  const { motion } = leaf;
  if (!group || !motion) return;
  const e = t * t * (3 - 2 * t);
  if (motion.kind === 'swing') {
    group.rotation.y = motion.degrees * DEG * e;
    return;
  }
  const [x, y, z] = leaf.pivot;
  const travel = motion.distance * e;
  group.position.set(motion.axis === 'x' ? x + travel : x, y, motion.axis === 'z' ? z + travel : z);
}

function DoorLeaves({
  door,
  materials,
  capMaterial,
  root,
  cutY,
  opened,
}: Omit<Props, 'doors'> & { door: Door }) {
  // The store is the one truth for every leaf. The click on a leaf, a room view, a child coming
  // in from the yard and the walker's collision all read the same map; an absent id is a shut
  // door. A local `useState` here used to mean the collision layer could not tell that a leaf
  // had moved, so a shut door was still a hole in the wall.
  const open = useAppStore((s) => s.openDoors[door.id] ?? false);
  const setDoorOpen = useAppStore((s) => s.setDoorOpen);
  const toggleDoor = useAppStore((s) => s.toggleDoor);
  // A room view looks in through one door; opening it here also frees the way for the walker.
  useEffect(() => {
    if (opened === door.id) setDoorOpen(door.id, true);
  }, [opened, door.id, setDoorOpen]);

  const [hovered, setHovered] = useState(false);
  const groups = useRef<(Group | null)[]>([]);
  const t = useRef(0);
  const clack = useRef(0);
  const lastLook = useRef(Number.NEGATIVE_INFINITY);
  // The sound follows the leaf that moves; a pair's back leaf stays put.
  const motion = door.leaves.find((leaf) => leaf.motion)?.motion;
  const userData = { door: door.id };

  // Watching the state rather than the click means the first-person crosshair ray, which toggles
  // the same store entry from `FreeWalk`, sounds exactly like a click on the leaf.
  const seen = useRef(open);
  useEffect(() => {
    if (seen.current === open) return;
    seen.current = open;
    if (!motion) return;
    playOpenSfx(motion, 'start');
    window.clearTimeout(clack.current);
    clack.current = window.setTimeout(() => playOpenSfx(motion, 'end'), TRAVEL_SECONDS * 1000);
  }, [open, motion]);

  useFrame((_, delta) => {
    const target = open ? 1 : 0;
    if (t.current === target) return;
    const step = prefersReducedMotion() ? 1 : delta / TRAVEL_SECONDS;
    const gap = target - t.current;
    t.current = Math.abs(gap) <= step ? target : t.current + Math.sign(gap) * step;
    for (const [i, leaf] of door.leaves.entries()) pose(groups.current[i] ?? null, leaf, t.current);
  });

  useEffect(() => () => window.clearTimeout(clack.current), []);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  return (
    <group
      name={door.id}
      onClick={(event) => {
        // With the pointer locked, R3F's pointer stays where the lock began, so its ray does not
        // follow the crosshair. `FreeWalk` casts a centre-of-screen ray instead and stops the
        // press before it reaches the canvas; this guard is the second half of that handover.
        if (document.pointerLockElement) return;
        if (event.delta > CLICK_SLOP || !reaches(event, root.current, cutY, door.id)) return;
        event.stopPropagation();
        toggleDoor(door.id);
      }}
      onPointerMove={(event) => {
        // A locked pointer has no usable screen position: its ray is stale, and a hover left
        // over from it would keep the cursor as a pointer long after the lock is released.
        if (document.pointerLockElement) {
          setHovered(false);
          return;
        }
        // Whether the door shows under the pointer changes as it crosses a jamb or a wall in
        // front: look again, but a whole-house raycast is ~6 ms, so not on every move.
        if (event.timeStamp - lastLook.current < HOVER_EVERY_MS) return;
        lastLook.current = event.timeStamp;
        setHovered(reaches(event, root.current, cutY, door.id));
      }}
      onPointerOut={() => {
        lastLook.current = Number.NEGATIVE_INFINITY;
        setHovered(false);
      }}
    >
      {door.leaves.map((leaf, i) => (
        <group
          // biome-ignore lint/suspicious/noArrayIndexKey: a door's leaves are fixed by the plan.
          key={i}
          ref={(group) => {
            groups.current[i] = group;
          }}
          position={leaf.pivot}
        >
          {leaf.parts.map(({ material, geometry }) => (
            <mesh
              key={material}
              geometry={geometry}
              material={materials[material]}
              castShadow={!specOf(material).seeThrough}
              receiveShadow
              userData={userData}
            />
          ))}
          <mesh geometry={leaf.cap} material={capMaterial} userData={userData} />
        </group>
      ))}
    </group>
  );
}
