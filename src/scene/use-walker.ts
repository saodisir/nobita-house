import { useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Group } from 'three';
import type { CharacterDef } from '../data/characters';
import { housePathDoors } from '../data/house-path';
import { RUN_SPEED, type WalkSample } from '../data/walk-routes';
import { poseFor } from '../state/character-poses';
import { useAppStore } from '../state/store';
import { walkerPose } from './free-walk';
import { RUN_AT } from './walk-clips';
import { createWander, isPlaying, sampleWander, type WanderState, wanderSpeed } from './wander';
import { advancePack, joinPack, planSeed } from './wander-pack';

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
  /** Moving faster than a walk: the run clip fits, the walk clip does not. */
  running: boolean;
  /** Out where there is room to play — the vacant lot or the garden — rather than at the kerb. */
  outside: boolean;
  /** The game the group is in the middle of, if any. */
  game: string | null;
}

const STILL: WalkerPose = { moving: false, resting: false, running: false, outside: false, game: null };

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
  const [coarse, applyCoarse] = useState<WalkerPose>(STILL);
  const seen = useRef<WalkerPose>(STILL);
  const indoorsSeen = useRef(false);
  /** The door state this child is still asking for, until the store actually agrees. */
  const doorDesired = useRef<boolean | null>(null);
  const wander = useRef<WanderState | null>(null);
  if (!wander.current) wander.current = createWander(index, def);
  const sample = useRef<WalkSample>({ x: 0, y: 0, z: 0, heading: 0 });
  const body = poseFor(def.id);

  /**
   * Publish the coarse state, but only when it has actually changed. The flags flip a handful
   * of times a minute; this is called from `useFrame`, and re-rendering six characters sixty
   * times a second to say the same thing is the one thing the split into coarse and live state
   * was for.
   */
  const publish = (next: WalkerPose) => {
    const was = seen.current;
    if (
      next.moving === was.moving &&
      next.resting === was.resting &&
      next.running === was.running &&
      next.outside === was.outside &&
      next.game === was.game
    ) {
      return;
    }
    seen.current = next;
    applyCoarse(next);
  };

  // Advance with the rest of the pack, not alone: the street is one lane and a child that
  // pauses blocks it. See `wander-pack.ts`.
  useEffect(() => {
    const state = wander.current;
    if (!state) return;
    return joinPack(def.id, index, state);
  }, [def.id, index]);

  // Dev hook, same idea as `__walker` in `free-walk.tsx`: enough to read a child's state from a
  // screenshot script or the console without guessing from pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __walkers?: Record<string, unknown> };
    w.__walkers = {
      ...w.__walkers,
      [def.id]: {
        state: wander,
        sample,
        pose: body,
        // The rendered group, so a probe can tell the place the sampler names from the place
        // the mesh actually ended up: they should be the same, and one glance says whether.
        group: ref,
        read: () => {
          const s = wander.current;
          if (!s) return null;
          return {
            kind: s.kind,
            leg: s.leg,
            exit: Number(s.exit.toFixed(2)),
            doorLock: s.doorLock,
            u: Number(s.u.toFixed(2)),
            d: Number(s.clock.d.toFixed(2)),
            houseD: Number(s.houseD.toFixed(2)),
            doorU: Number(s.doorU.toFixed(2)),
            paused: s.paused,
            speed: Number((s.kind === 'street' ? s.clock.speed : s.speed).toFixed(2)),
            // This afternoon's plan: the seed to replay a bug, the lane and the party.
            seed: planSeed(),
            party: s.party,
            partyLeader: s.partyLeader,
            lane: Number(s.lateral.toFixed(2)),
            pace: Number(s.pace.toFixed(2)),
            game: s.game,
          };
        },
      },
    };
  }, [def.id, body, ref]);

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

  useFrame((frame, delta) => {
    const group = ref.current;
    const state = wander.current;
    if (!group || !state) return;

    const step = Math.min(delta, 0.1);
    const store = useAppStore.getState();
    // The whole pack steps once per frame; the first walker to be visited does it for all six.
    // The child under the hand is left out of that pass — see `advancePack`.
    advancePack(frame.clock.elapsedTime, store.walkMode, store.possessedId);

    // Held: the lap stops mattering and `FreeWalk`'s one walker takes over. This frame only
    // copies its answer onto the group and onto `characterPoses`, which is what the camera
    // follows in third person. There is no second integrator here: both views read the same
    // pose, so turning the lens round mid-stride cannot move the child.
    if (store.possessedId === def.id && store.freeWalk) {
      group.position.set(walkerPose.x, walkerPose.ground, walkerPose.z);
      group.rotation.set(0, walkerPose.heading, 0);
      body.position.copy(group.position);
      body.heading = walkerPose.heading;
      body.speed = walkerPose.speed;
      body.moving = walkerPose.moving;
      body.resting = !walkerPose.moving;
      publish({
        moving: walkerPose.moving,
        resting: !walkerPose.moving,
        running: walkerPose.running,
        outside: false,
        game: null,
      });
      return;
    }

    // Doors open before the child reaches them and shut once it is back out. Held on the store
    // rather than reached into `doors.tsx`, which knows nothing about who is walking.
    //
    // This used to fire only on the edge, which meant a refusal was permanent: `setDoorOpen`
    // will not move a leaf while somebody stands on its travel, so one busy doorway left the
    // house open for the rest of the afternoon. Keep asking until the store agrees, then stop —
    // after that the visitor is free to open and shut the doors by hand again.
    const indoors = state.leg !== 'yard';
    if (indoors !== indoorsSeen.current) {
      indoorsSeen.current = indoors;
      doorDesired.current = indoors;
    }
    const want = doorDesired.current;
    if (want !== null) {
      const before = useAppStore.getState().openDoors;
      const { setDoorOpen } = useAppStore.getState();
      for (const door of housePathDoors) {
        if ((before[door] ?? false) !== want) setDoorOpen(door, want);
      }
      const after = useAppStore.getState().openDoors;
      if (housePathDoors.every((door) => (after[door] ?? false) === want)) doorDesired.current = null;
    }
    const s = sampleWander(state, index, sample.current);
    group.position.set(s.x, s.y, s.z);
    const turn = wrapPi(s.heading - group.rotation.y);
    group.rotation.y = wrapPi(group.rotation.y + turn * (1 - Math.exp(-TURN_RATE * step)));

    body.position.copy(group.position);
    body.heading = group.rotation.y;
    const speed = wanderSpeed(state);
    // Standing still is one state now that both loops brake rather than freeze: the walk clip
    // runs down to nothing and the child's standing pose takes over. What changes is which
    // standing pose — on its own spot it sits the way it was composed to, and anywhere else it
    // is a child who has stopped for a moment.
    const atHome = state.kind === 'yard' ? state.exit <= 0 : state.clock.phase === 'home';
    const outside = isPlaying(state);
    const moving = speed > MOVING_EPSILON;
    const resting = !moving && !atHome;
    body.speed = speed;
    body.moving = moving;
    body.resting = resting;

    publish({
      moving,
      resting,
      running: speed >= RUN_AT * RUN_SPEED,
      outside,
      game: state.game,
    });
  });

  return coarse;
}
