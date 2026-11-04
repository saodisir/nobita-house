import { useFrame, useThree } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Raycaster, Vector3 } from 'three';
import { roomHotspots } from '../data/room-hotspots';
import { pick } from '../i18n/locale';
import { useLocale } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';

/** Screen position of one pin, and whether the room's own geometry is in the way. */
interface Placed {
  id: string;
  x: number;
  y: number;
  hidden: boolean;
}

const anchorPoint = new Vector3();
const projected = new Vector3();
const toAnchor = new Vector3();
const rayDirection = new Vector3();
const raycaster = new Raycaster();

/**
 * How close to the anchor a hit still counts as "not in the way", metres. The anchor floats a
 * few centimetres off the thing it describes, so the ray reaches that thing's own surface;
 * without the clearance every pin occludes itself.
 */
const MIN_CLEARANCE = 0.12;

/**
 * Pins for one room. Only hotspots with a world anchor get one: a prop-local anchor has no
 * placed object to hang off yet. Scoped to the room the visitor is standing in, so a pin in
 * another room is never projected, never raycast, and never a tab stop through a floor.
 */
const anchoredIn = (roomId: string) => roomHotspots.filter((h) => h.roomId === roomId && h.anchorWorld);

/** The only things that can stand between the eye and a pin. Named groups, so the raycast
 *  never walks the streets, the neighbour lots or the grass. */
const OCCLUDER_NAMES = ['nobita-house'];

/**
 * Projects the room's hotspot anchors to screen space every frame and publishes the result.
 * Lives inside the Canvas because it needs the camera; it renders nothing itself.
 */
export function RoomPinTracker({ onPlace }: { onPlace: (placed: Placed[]) => void }) {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const size = useThree((s) => s.size);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const last = useRef('');
  const frame = useRef(0);
  /** Last occlusion answer per pin, so the raycast can run at a fraction of the frame rate. */
  const occluded = useRef<Record<string, boolean>>({});

  useFrame(() => {
    if (activeRoomId === null) {
      if (last.current !== '') {
        last.current = '';
        onPlace([]);
      }
      return;
    }
    // Raycasting the whole scene five times a frame costs more than the room does to draw:
    // it walks the house, the streets, the neighbours and a quarter-million grass blades.
    // Only the room and the house can stand between the eye and a pin, and a pin that flicks
    // in and out a sixth of a second late is imperceptible.
    frame.current += 1;
    const testOcclusion = frame.current % 6 === 0;
    const blockers = OCCLUDER_NAMES.map((name) => scene.getObjectByName(name)).filter(
      (node) => node !== undefined,
    );

    const placed = anchoredIn(activeRoomId).map((hotspot) => {
      const [ax, ay, az] = hotspot.anchorWorld ?? [0, 0, 0];
      anchorPoint.set(ax, ay, az);
      toAnchor.copy(anchorPoint).sub(camera.position);
      const distance = toAnchor.length();
      projected.copy(anchorPoint).project(camera);
      // Behind the camera, or projected off the edge of the viewport. Off-screen matters as
      // much as occluded: a pin at x = 2229 on a 1440 px screen is invisible and would still
      // be a tab stop, which is how a keyboard user ends up focused on nothing.
      const offScreen = projected.z > 1 || Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1;
      if (testOcclusion && !offScreen && blockers.length > 0 && distance > MIN_CLEARANCE) {
        // Aim the ray at the anchor directly rather than rebuilding it from the pin's screen
        // position. `setFromCamera` was returning a ray pointing behind the camera here —
        // whatever the cause, the screen round trip is a detour: the world-space direction is
        // already known, and `far` turns "is anything in the way" into one bounded query.
        raycaster.set(camera.position, rayDirection.copy(toAnchor).normalize());
        raycaster.near = 0;
        raycaster.far = distance - MIN_CLEARANCE;
        // Glass, water and the section cap are drawn see-through or not at all: a pin behind
        // a window or over the bath water is in plain sight.
        occluded.current[hotspot.id] = raycaster
          .intersectObjects(blockers, true)
          .some((hit) => !hit.object.userData.clickThrough);
      }
      return {
        id: hotspot.id,
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        hidden: offScreen || (occluded.current[hotspot.id] ?? false),
      };
    });
    // Only push when something a human could notice changed: this runs every frame and each
    // push re-renders the DOM layer.
    const key = placed.map((p) => `${p.id}:${Math.round(p.x)}:${Math.round(p.y)}:${p.hidden}`).join('|');
    if (key === last.current) return;
    last.current = key;
    onPlace(placed);
  });

  return null;
}

/**
 * The pins themselves: real buttons in a fixed DOM order, so tabbing through them is stable
 * however the camera moves. A pin behind geometry leaves the tab order and stops taking
 * pointer events — unless it currently holds focus, in which case removing it would strand
 * the keyboard user mid-sentence.
 */
export function RoomPins({ placed }: { placed: Placed[] }) {
  const selected = useAppStore((s) => s.selectedRoomHotspot);
  const selectRoomHotspot = useAppStore((s) => s.selectRoomHotspot);
  const locale = useLocale();
  const [focused, setFocused] = useState<string | null>(null);
  if (placed.length === 0) return null;
  return (
    <div className="room-pins">
      {placed.map((spot) => {
        const hotspot = roomHotspots.find((h) => h.id === spot.id);
        if (!hotspot) return null;
        const ghost = spot.hidden && focused !== hotspot.id;
        return (
          <button
            key={hotspot.id}
            type="button"
            className="room-pin"
            data-id={hotspot.id}
            data-ghost={ghost || undefined}
            aria-hidden={ghost || undefined}
            tabIndex={ghost ? -1 : 0}
            aria-pressed={selected === hotspot.id}
            style={{ transform: `translate(${spot.x}px, ${spot.y}px) translate(-50%, -50%)` }}
            onFocus={() => setFocused(hotspot.id)}
            onBlur={() => setFocused((id) => (id === hotspot.id ? null : id))}
            onClick={() => selectRoomHotspot(selected === hotspot.id ? null : hotspot.id)}
          >
            <span className="room-pin__disc" aria-hidden="true" />
            <span className="sr-only">{pick(hotspot.title, locale)}</span>
          </button>
        );
      })}
    </div>
  );
}

export type { Placed as PlacedPin };
