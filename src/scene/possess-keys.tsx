import { useEffect } from 'react';
import { characterById } from '../data/characters';
import { useAppStore } from '../state/store';
import { beginHold, heldKeys, heldPose } from './possession';

/** Keys the diorama uses for driving; the browser must not scroll or tab on any of them. */
const MOVE_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
]);

/**
 * The keyboard for the child under the hand.
 *
 * A component of its own because listening is a React lifetime question and moving is not: the
 * listeners exist exactly as long as somebody is held, and the integration in `possession.ts`
 * cannot see them — it reads the same `heldKeys` set. Same split `free-walk.tsx` makes, except
 * that the eye there is the visitor's and here it belongs to a child.
 */
export function PossessKeys() {
  const held = useAppStore((s) => s.possessedId);

  // Seeded before the first frame that reads it: the child is taken hold of where it stands,
  // which for one that has been walking is not the spot in `characters.ts`.
  useEffect(() => {
    const def = held ? characterById(held) : undefined;
    if (def) beginHold(def);
  }, [held]);

  useEffect(() => {
    if (!held) return;
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        // Let go, and put the lens back on the house: left nose-to-nose with a child that has
        // just gone back to its lap, the camera reads as stuck rather than as released.
        // `resetView` releases the child as part of going home, so one call does both.
        useAppStore.getState().resetView();
        return;
      }
      heldKeys.add(e.code);
      if (MOVE_KEYS.has(e.code)) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => heldKeys.delete(e.code);
    // A key released while the window is not focused never reports: without this the child
    // walks off on its own until the next press.
    const clear = () => heldKeys.clear();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      heldKeys.clear();
    };
  }, [held]);

  // Dev hook, the same idea as `__walkers` and `__walker`: what is held, and where it is, so a
  // probe can tell a driven child from one on its route without reading pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __held: unknown }).__held = {
      pose: heldPose,
      keys: heldKeys,
      read: () => ({ ...heldPose, keys: [...heldKeys] }),
    };
  }, []);

  return null;
}
