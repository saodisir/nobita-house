import { useEffect, useState } from 'react';
import { type HouseRoom, rooms } from '../data/rooms';
import { useAppStore } from '../state/store';

/** Just outside the pane, so the pick never fights the glass or the frame for the ray. */
const STANDOFF = 0.06;
/** A touch target, not a hit box that matches the glass exactly. */
const PAD = 0.12;

/**
 * The way in: an invisible plate over each room's window in an outside wall that reacts to
 * hover and takes the click. The rooms are already visible through the glass — this only makes
 * it obvious they can be entered.
 *
 * Invisible rather than a tinted highlight: three.js still raycasts an invisible mesh, and
 * R3F only sends pointer events to objects that carry handlers, so this takes the click
 * without adding anything to the facade.
 */
export function WindowPortals() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const freeWalk = useAppStore((s) => s.freeWalk);
  // Nothing to click while already inside, and a stale hover would leave the cursor stuck.
  // On foot the visitor goes through the doors. These plates stand just outside the facade and
  // stop the press on their way to `enterRoom()`, so a click meant for the front door used to
  // teleport into a room instead — and end the walk mid-stride. Leave them out of a drive.
  if (activeRoomId !== null || freeWalk) return null;
  return (
    <>
      {rooms.map((room) => (
        <Portal key={room.id} room={room} />
      ))}
    </>
  );
}

function Portal({ room }: { room: HouseRoom }) {
  const enterRoom = useAppStore((s) => s.enterRoom);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  if (!room.entry) return null;
  const [cx, cy, cz] = room.entry.centre;
  const [ox, oz] = room.entry.outward;
  return (
    <mesh
      name={`window-portal-${room.id}`}
      visible={false}
      position={[cx + ox * STANDOFF, cy, cz + oz * STANDOFF]}
      // A plane faces +z; turned to face out of the wall it sits on, the side a ray arrives from.
      rotation-y={Math.atan2(ox, oz)}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        // Same threshold the ground plane and the characters use: the end of an orbit drag
        // is not a click, and flying indoors mid-gesture is the worst version of that bug.
        if (e.delta <= 2) enterRoom(room.id);
      }}
    >
      <planeGeometry args={[room.entry.width + PAD, room.entry.height + PAD]} />
      <meshBasicMaterial />
    </mesh>
  );
}
