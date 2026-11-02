import type { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { type RefObject, useEffect, useRef } from 'react';
import { PerspectiveCamera, Vector3 } from 'three';
import { config } from '../config';
import { roomHotspots } from '../data/room-hotspots';
import { type HouseRoom, roomById } from '../data/rooms';
import { lookTarget, ROOM_FOV } from '../editor/look-around';
import { useAppStore } from '../state/store';
import { prefersReducedMotion } from '../utils/reduced-motion';

/** Scratch for reading the live pose on a view change; no per-frame work here. */
const scratchEye = new Vector3();
const scratchTarget = new Vector3();

/**
 * How far outside its window the flight from the street stops, metres: close enough to see in,
 * and inside the garden. The front windows are 1.8 m from the boundary wall, and anything
 * further out stops on the wall, among the characters sitting on it.
 */
const APPROACH = 1.4;
/**
 * How far past a hotspot the head turns on a wide screen, radians. The card sits on the right
 * there, so the subject is kept left of centre where the card never covers it.
 */
const CARD_TURN = (12 * Math.PI) / 180;

/**
 * The street pose to come back to. Captured when the visitor first goes inside, so leaving
 * returns the view they left rather than the default framing. Moving from room to room does
 * not touch it: the street is one place, however many rooms are between you and it.
 */
interface SavedPose {
  eye: [number, number, number];
  target: [number, number, number];
}

/** Just outside the room's window, looking in through it. */
function windowApproach(room: HouseRoom): SavedPose | undefined {
  if (!room.entry) return undefined;
  const [cx, cy, cz] = room.entry.centre;
  const [ox, oz] = room.entry.outward;
  return { eye: [cx + ox * APPROACH, cy, cz + oz * APPROACH], target: [cx - ox, cy, cz - oz] };
}

/**
 * Drives the camera between the street and the rooms: it stands where the visitor chose in
 * the room they are in (`HouseRoom.views`, the same places `/editor` stands in) and looks
 * round from there — `CameraRig` switches the controls to `LOOK_AROUND` while inside.
 *
 * Nothing flies through a wall. From the street the camera flies up to the room's window, sees
 * in through the glass, and cuts inside; room to room is a cut; within one room it walks from
 * one place to the next across the floor between them. Leaving flies back to the street pose
 * the visitor went in from.
 */
export function useInteriorCamera(controls: RefObject<CameraControls | null>) {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const roomViewIndex = useAppStore((s) => s.roomViewIndex);
  const hotspotId = useAppStore((s) => s.selectedRoomHotspot);
  const camera = useThree((s) => s.camera);
  const saved = useRef<SavedPose | null>(null);
  /** The room the camera stands in: from place to place in it is a walk, into it a cut. */
  const standing = useRef<string | null>(null);
  const room = activeRoomId ? roomById(activeRoomId) : undefined;
  const view = room?.views[roomViewIndex] ?? room?.views[0];

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return;
    camera.fov = room ? ROOM_FOV : config.camera.fov;
    camera.updateProjectionMatrix();
  }, [room, camera]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const smooth = !prefersReducedMotion();

    if (room && view) {
      if (saved.current === null) {
        const eye = c.getPosition(scratchEye);
        const target = c.getTarget(scratchTarget);
        saved.current = { eye: [eye.x, eye.y, eye.z], target: [target.x, target.y, target.z] };
      }
      c.setFocalOffset(0, 0, 0, false);
      const target = lookTarget(view.eye, view.aim);
      const walk = smooth && standing.current === room.id;
      const approach = smooth && standing.current === null ? windowApproach(room) : undefined;
      standing.current = room.id;
      void c.zoomTo(1, walk);
      if (!approach) {
        void c.setLookAt(...view.eye, ...target, walk).catch(() => {});
        return;
      }
      /** Still where this flight was meant to land: a later choice owns the camera. */
      const current = () => {
        const s = useAppStore.getState();
        return s.activeRoomId === room.id && s.roomViewIndex === roomViewIndex;
      };
      void c
        .setLookAt(...approach.eye, ...approach.target, true)
        .then(() => {
          if (current()) void c.setLookAt(...view.eye, ...target, false);
        })
        .catch(() => {
          // `camera-controls` rejects a transition the next one interrupts. Never strand the
          // camera outside the window: snap in.
          if (current()) void c.setLookAt(...view.eye, ...target, false);
        });
      return;
    }

    standing.current = null;
    void c.zoomTo(1, smooth);
    const back = saved.current;
    saved.current = null;
    if (!back) return;
    void c.setLookAt(...back.eye, ...back.target, smooth).catch(() => {});
  }, [room, view, roomViewIndex, controls]);

  // A hotspot: turn the head to it where the visitor stands.
  useEffect(() => {
    const c = controls.current;
    if (!c || !room || !hotspotId) return;
    const anchor = roomHotspots.find((h) => h.id === hotspotId)?.anchorWorld;
    if (!anchor) return;
    const eye = c.getPosition(scratchEye);
    let dx = anchor[0] - eye.x;
    let dz = anchor[2] - eye.z;
    if (window.innerWidth >= 1024) {
      // Right of the line of sight is (−dz, dx): turning toward it moves the subject left.
      const cos = Math.cos(CARD_TURN);
      const sin = Math.sin(CARD_TURN);
      [dx, dz] = [dx * cos - dz * sin, dz * cos + dx * sin];
    }
    const at: [number, number, number] = [eye.x, eye.y, eye.z];
    void c
      .setLookAt(...at, ...lookTarget(at, [eye.x + dx, anchor[1], eye.z + dz]), !prefersReducedMotion())
      .catch(() => {});
  }, [hotspotId, room, controls]);
}
