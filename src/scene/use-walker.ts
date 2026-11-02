import { useFrame } from '@react-three/fiber';
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import type { CharacterDef } from '../data/characters';
import type { WalkSample } from '../data/walk-routes';
import { poseFor } from '../state/character-poses';
import { useAppStore } from '../state/store';
import { advanceWander, createWander, sampleWander, type WanderState, wanderSpeed } from './wander';

/** How fast a walker's yaw closes on the route heading, per second: a visible turn, not a snap. */
const TURN_RATE = 8;
/** Below this ground speed a walker is standing, whatever its clock still holds. */
const MOVING_EPSILON = 0.08;

const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/** What a walker is doing this frame, at the coarse grain React needs to know about. */
export interface WalkerPose {
  /** Feet moving along the route. */
  moving: boolean;
  /** Out on a route but stopped for a moment: standing about, not at home. */
  resting: boolean;
}

const STILL: WalkerPose = { moving: false, resting: false };

/**
 * Drives the character's outer group: position from its own wander, yaw turning toward the
 * route heading, and the live pose the camera follows.
 *
 * Each child carries its own `WanderState`, so nothing here is shared with its neighbours —
 * six children on two loops, each setting off and stopping when it likes. At home with walk
 * mode off this reproduces the spot and yaw in `characters.ts` exactly.
 *
 * Returns the coarse state; it flips a handful of times a minute, not per frame.
 */
export function useWalker(ref: RefObject<Group | null>, index: number, def: CharacterDef): WalkerPose {
  const [coarse, setCoarse] = useState<WalkerPose>(STILL);
  const seen = useRef<WalkerPose>(STILL);
  const wander = useRef<WanderState | null>(null);
  if (!wander.current) wander.current = createWander(index, def);
  const sample = useRef<WalkSample>({ x: 0, y: 0, z: 0, heading: 0 });
  const body = poseFor(def.id);

  // Place the group before its first paint, straight onto the route with no turn.
  useLayoutEffect(() => {
    const group = ref.current;
    const state = wander.current;
    if (!group || !state) return;
    const s = sampleWander(state, index, sample.current);
    group.position.set(s.x, s.y, s.z);
    group.rotation.set(0, s.heading, 0);
    body.position.copy(group.position);
    body.heading = s.heading;
    body.speed = wanderSpeed(state);
  }, [ref, index, body]);

  useFrame((_state, delta) => {
    const group = ref.current;
    const state = wander.current;
    if (!group || !state) return;

    const step = Math.min(delta, 0.1);
    advanceWander(state, step, useAppStore.getState().walkMode);
    const s = sampleWander(state, index, sample.current);
    group.position.set(s.x, s.y, s.z);
    const turn = wrapPi(s.heading - group.rotation.y);
    group.rotation.y = wrapPi(group.rotation.y + turn * (1 - Math.exp(-TURN_RATE * step)));

    body.position.copy(group.position);
    body.heading = group.rotation.y;
    const speed = wanderSpeed(state);
    // Two ways of standing still, because the two loops stop differently. A street walker's
    // clock holds its speed through a pause (the pause simply stops advancing it), so the pause
    // has to end the walk clip itself. A yard walker eases to a stop, and stays in the walk clip
    // until it has actually arrived — the clip slowing into the pause instead of cutting at
    // full stride.
    const settling = state.kind === 'street' && state.paused;
    const moving = speed > MOVING_EPSILON && !settling;
    const resting = state.paused && !moving;
    body.speed = speed;
    body.moving = moving;
    body.resting = resting;

    if (moving !== seen.current.moving || resting !== seen.current.resting) {
      seen.current = { moving, resting };
      setCoarse(seen.current);
    }
  });

  return coarse;
}
