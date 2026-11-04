import { useFrame } from '@react-three/fiber';
import { type RefObject, useEffect, useRef } from 'react';
import type { Group } from 'three';
import { WALK_SPEED } from '../data/walk-routes';
import { poseFor } from '../state/character-poses';
import { useReducedMotionRef } from '../utils/reduced-motion';

/** One greeting cycle: crouch, hop, settle. */
const GREET_SECONDS = 0.95;
const BREATH_HZ = 1.55;
const SWAY_HZ = 0.62;

interface Options {
  /** Which character this is: the gait reads its ground speed from the live poses. */
  id: string;
  /** Character height in metres; motion amplitudes scale with it. */
  height: number;
  /** One full walking stride in metres; sets the step rate while walking. */
  stride: number;
  /** Offsets the idle cycle so the group never breathes in lockstep. */
  phase: number;
  /** Selected and standing at home: the moment to greet. False while out walking. */
  selected: boolean;
  hovered: boolean;
  /** True when the model carries a skeletal welcome clip; the procedural hop steps aside. */
  hasWelcome?: boolean;
  /** True when the model carries a skeletal walk clip: the bounce halves and the waddle goes. */
  hasWalkClip?: boolean;
  /** Holding an authored resting clip (idle or a sit): the procedural breath and sway step aside. */
  resting?: boolean;
  /** Faster than a walk: more bounce, more lean, no waddle. */
  running?: boolean;
}

/**
 * Procedural motion for the posed sculpts: a breathing bob with a matching squash, a slow
 * sway, a lift on hover, a one-shot hop when the character is selected, and — as walk mode
 * picks up speed — a walking gait of a bounce per step, a waddle per stride and a slight
 * forward lean that takes over from the idle.
 */
export function useCharacterMotion(ref: RefObject<Group | null>, opts: Options) {
  const { id, height, stride, phase, selected, hovered, hasWelcome, hasWalkClip } = opts;
  const greetStart = useRef<number | null>(null);
  // Accumulated gait angle: integrating the step rate keeps the cycle continuous while the
  // walk speeds up and slows down.
  const stepAngle = useRef(0);
  const reduced = useReducedMotionRef();

  // Re-trigger the greeting every time this character becomes the selected one. Models with
  // a skeletal welcome bow keep breathing here but leave the greeting to the armature.
  useEffect(() => {
    greetStart.current = selected && !hasWelcome ? -1 : null;
  }, [selected, hasWelcome]);

  useFrame(({ clock }, delta) => {
    const group = ref.current;
    if (!group) return;

    if (reduced.current) {
      group.position.y = 0;
      group.rotation.set(0, 0, 0);
      group.scale.setScalar(1);
      return;
    }

    const now = clock.elapsedTime;
    if (greetStart.current === -1) greetStart.current = now;

    const speed = poseFor(id).speed;
    // `gait` saturates at a walking pace — a run is not more of the same walk — so the extra
    // bounce and lean of running come from `rush` on top of it.
    const gait = Math.min(1, speed / WALK_SPEED);
    const rush = opts.running ? 1 : 0;
    // An authored resting clip already breathes; the procedural idle would bounce on top of it.
    const idle = opts.resting ? 0 : 1 - gait;
    // Two steps per stride; one |sin| bump per step, one sin swing per stride. The cycle
    // restarts whenever the feet stop, so on models that carry a walk clip the bounce stays in
    // step with the legs instead of drifting against them: lowest at each contact, highest at
    // each passing.
    if (speed === 0) stepAngle.current = 0;
    stepAngle.current += (Math.PI * 2 * speed * Math.min(delta, 0.1)) / stride;
    const step = Math.sin(stepAngle.current);

    const t = now * Math.PI * 2 + phase;
    const breath = Math.sin(t * BREATH_HZ);
    let lift =
      breath * 0.006 * height * idle +
      Math.abs(step) * 0.02 * height * gait * (hasWalkClip ? 0.5 : 1) * (1 + rush * 0.9);
    let squash = 1 - breath * 0.007 * idle;
    let yaw = Math.sin(t * SWAY_HZ) * 0.022 * idle;
    const roll = hasWalkClip ? 0 : step * 0.05 * gait * (1 - rush);
    // Top of the body toward local +Z, the way the character faces.
    const lean = 0.06 * gait + 0.1 * rush;

    const start = greetStart.current;
    if (start !== null) {
      const p = (now - start) / GREET_SECONDS;
      if (p >= 1) {
        greetStart.current = null;
      } else {
        // Anticipation dip, then a hop that lands softly.
        const hop = Math.sin(Math.PI * p) ** 1.4;
        const dip = p < 0.18 ? Math.sin((p / 0.18) * Math.PI) * 0.35 : 0;
        lift += (hop - dip) * 0.075 * height;
        squash *= 1 + dip * 0.06 - hop * 0.035;
        yaw += Math.sin(p * Math.PI * 2) * 0.16;
      }
    }

    const targetScale = hovered ? 1.025 : 1;
    const scale = group.scale.x + (targetScale - group.scale.x) * 0.15;

    group.position.y = lift;
    group.rotation.set(lean, yaw, roll);
    group.scale.set(scale, scale * squash, scale);
  });
}
