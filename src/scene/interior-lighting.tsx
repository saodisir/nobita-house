import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { type PointLight, Vector3 } from 'three';
import { type HouseRoom, roomById } from '../data/rooms';
import { useAppStore } from '../state/store';
import { walkerPose } from './free-walk';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * The light inside whichever room the visitor is in.
 *
 * One or two windows do not light a room: the sun reaches the sill and stops, and every
 * surface facing inward reads as a flat grey slab. Two point lights fix that.
 *
 * **One pair, moved, not a pair per room.** In three.js every light costs something in every
 * material's shader, whether or not it reaches them: a pair per room was already 51 fps with
 * two rooms and would be unusable at fifteen. The rooms nobody is standing in need no light —
 * from the street they are seen through glass, and `NightLights` already lights the windows
 * themselves after dark.
 *
 * - **Daylight bounce**, a metre in from the room's window, tied to the key intensity: the
 *   brighter the day outside, the more of it spills in.
 * - **The ceiling fitting**, warm, and the opposite: it comes up as the day goes down.
 *
 * On foot the pair follows the walker instead of standing in an authored room, because there is
 * no `activeRoomId` to place it in: it rides at chest height and rides along.
 */
const BOUNCE_MAX = 2.8;
/** A windowless room's fill: the hall and the closets have no glass to bounce from. */
const BOUNCE_WINDOWLESS = 1.1;
const LAMP_MAX = 4.0;
/** Metres. Past the far corner of a six-mat room and no further. */
const REACH = 5;
/** On foot the bounce is a follow light, not a window one: a third of the room light reads as air. */
const WALK_BOUNCE = 0.9;

/** Where the pair stands in a room: the bounce a metre in from its window, the lamp under the ceiling. */
function placeInRoom(room: HouseRoom) {
  const cx = (room.bounds.x0 + room.bounds.x1) / 2;
  const cz = (room.bounds.z0 + room.bounds.z1) / 2;
  const lamp = new Vector3(cx, room.ceilingY - 0.4, cz);
  if (!room.entry) return { bounce: new Vector3(cx, room.floorY + 1.4, cz), lamp, hasWindow: false };
  // Any closer and the light burns a visible hotspot into the wall beside it instead of
  // filling the room.
  const inset = 1.0;
  const [wx, wy, wz] = room.entry.centre;
  const [ox, oz] = room.entry.outward;
  return { bounce: new Vector3(wx - ox * inset, wy + 0.2, wz - oz * inset), lamp, hasWindow: true };
}

export function InteriorLighting({ tod }: { tod: TimeOfDayState }) {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const freeWalk = useAppStore((s) => s.freeWalk);
  const bounce = useRef<PointLight>(null);
  const lamp = useRef<PointLight>(null);
  const room = activeRoomId ? roomById(activeRoomId) : undefined;
  const home = useMemo(() => (room ? placeInRoom(room) : undefined), [room]);

  useFrame(() => {
    const b = bounce.current;
    const l = lamp.current;
    if (!b || !l) return;

    if (freeWalk) {
      // Chest height, a step ahead of the eye, so the falloff comes from in front of the visitor
      // rather than from inside their head.
      b.position.set(walkerPose.x, walkerPose.y - 0.35, walkerPose.z);
      // Below the ceiling, not above it: a storey is 2.4 m and the eye is 1.62, so +0.85 puts the
      // fitting inside the slab above, and everything looking up the hall reads as a black band.
      l.position.set(walkerPose.x, walkerPose.y + 0.55, walkerPose.z);
      const day = Math.min(1, tod.keyIntensity / 2.2);
      b.intensity = walkerPose.inside ? WALK_BOUNCE * (0.45 + day * 0.55) : 0;
      b.color.copy(tod.keyColor);
      l.intensity = walkerPose.inside ? LAMP_MAX * 0.6 * tod.lampLevel : 0;
      // `distance` is only a cutoff, not a gain: a room-sized 5 m keeps the halo tight when the
      // pair is pinned to an authored room, but on foot the far end of the hall falls off a cliff
      // and the ceiling reads as a black slot. The walker lights a corridor, so reach down it.
      b.distance = 9;
      l.distance = 9;
      return;
    }

    if (!home) return;
    b.position.copy(home.bounce);
    l.position.copy(home.lamp);
    // `keyIntensity` runs about 0 at night to 2.2 at midday; normalise against that.
    b.intensity = home.hasWindow ? BOUNCE_MAX * Math.min(1, tod.keyIntensity / 2.2) : BOUNCE_WINDOWLESS;
    b.color.copy(tod.keyColor);
    l.intensity = LAMP_MAX * tod.lampLevel;
  });

  if (!home && !freeWalk) return null;
  return (
    <>
      <pointLight
        ref={bounce}
        position={home?.bounce ?? [0, 2, 0]}
        distance={REACH}
        decay={1.7}
        color="#FFF3DF"
      />
      <pointLight
        ref={lamp}
        position={home?.lamp ?? [0, 3, 0]}
        intensity={0}
        distance={REACH}
        decay={1.7}
        color="#FFE1AC"
      />
    </>
  );
}
