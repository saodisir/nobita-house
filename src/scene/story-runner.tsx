/**
 * The player. One beat at a time, no branches, no pause, no input.
 *
 * A beat's length is the longest of the things in it: the line on screen, a clip being held,
 * a child walking to a mark, or an explicit hold. That single rule is what keeps the dialogue
 * honest — if Nobita says he is leaving *while* he walks away, the box stays up until he has
 * actually got there, rather than the sentence finishing over a body still crossing the gate.
 *
 * Beats run on wall time, not frame time. A slow renderer must not stretch a minute-long
 * story into several: positions come from `elapsed / leg.seconds`, so a long frame lands the
 * child exactly where they belong instead of undershooting. Only the easing of a turn keeps
 * a small step, so a long frame cannot snap a head round.
 *
 * This component draws nothing. It lives inside the Canvas so its clock is the render clock,
 * and writes the six poses to the plain Map `use-walker.ts` reads on its own frame.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import {
  CLIP_SECONDS,
  LINE_SECONDS,
  MIN_BEAT_SECONDS,
  STORY_WALK_SPEED,
  type StoryCharacterId,
  storyBeats,
  storyPoint,
} from '../data/story';
import { advanceStoryBeat, storyPoseFor, useStoryStore, writeStoryPose } from '../state/story';

/** Same visible turn as the wander walker, so a scripted change of facing is not a snap. */
const TURN_RATE = 8;
/** A single frame may be long, but a background tab waking up should not skip the whole story. */
const MAX_CLOCK_STEP = 2;
const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
const turnToward = (from: number, to: number, dt: number) =>
  wrapPi(from + wrapPi(to - from) * (1 - Math.exp(-TURN_RATE * dt)));

type Point = readonly [number, number, number];

interface Leg {
  who: StoryCharacterId;
  from: Point;
  to: Point;
  seconds: number;
  /** Metres per second along this leg, also the walk clip's playback rate. */
  speed: number;
  faceYaw: number | null;
}

interface Turn {
  who: StoryCharacterId;
  yaw: number;
}

interface BeatRun {
  index: number;
  elapsed: number;
  duration: number;
  legs: Leg[];
  turns: Turn[];
}

function beginBeat(index: number): BeatRun {
  const beat = storyBeats[index];
  const run: BeatRun = { index, elapsed: 0, duration: MIN_BEAT_SECONDS, legs: [], turns: [] };
  if (!beat) return run;
  const pace = beat.pace ?? STORY_WALK_SPEED;

  if (beat.say) run.duration = Math.max(run.duration, beat.say.seconds ?? LINE_SECONDS);
  if (beat.hold) run.duration = Math.max(run.duration, beat.hold);

  for (const action of beat.actions ?? []) {
    // Facing is measured against where the other child stands as the beat opens. When both
    // are walking, that is a near-enough answer for a turn of the head, not a tracking shot.
    const target = action.face ? storyPoseFor(action.face) : undefined;
    if (action.clip) run.duration = Math.max(run.duration, CLIP_SECONDS);

    if (action.go) {
      const own = storyPoseFor(action.who);
      if (!own) continue;
      const from: Point = [own.x, own.y, own.z];
      const to = storyPoint(action.go, action.who);
      const ground = Math.hypot(to[0] - from[0], to[2] - from[2]);
      const seconds = Math.max(0.9, ground / pace);
      run.duration = Math.max(run.duration, seconds);
      run.legs.push({
        who: action.who,
        from,
        to,
        seconds,
        speed: pace,
        // Once at the mark, turn to the person this beat is about.
        faceYaw: target ? Math.atan2(target.x - to[0], target.z - to[2]) : null,
      });
    } else if (target && action.face) {
      const own = storyPoseFor(action.who);
      if (own) run.turns.push({ who: action.who, yaw: Math.atan2(target.x - own.x, target.z - own.z) });
    }
  }
  return run;
}

export function StoryRunner() {
  const run = useRef<BeatRun | null>(null);

  // Dev probe, the same idea as `__walkers` and `__clips`: read a beat's clock from a
  // screenshot script or the console without guessing it from pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__story = () => {
      const state = useStoryStore.getState();
      return {
        status: state.status,
        beatIndex: state.beatIndex,
        line: state.speech?.line.en ?? null,
        camera: state.camera?.look ?? null,
        elapsed: run.current ? Number(run.current.elapsed.toFixed(2)) : null,
        duration: run.current?.duration ?? null,
      };
    };
  }, []);

  useFrame((_, delta) => {
    const story = useStoryStore.getState();
    if (story.status !== 'playing') {
      run.current = null;
      return;
    }
    const clockStep = Math.min(delta, MAX_CLOCK_STEP);
    const turnStep = Math.min(delta, 0.1);
    if (!run.current || run.current.index !== story.beatIndex) run.current = beginBeat(story.beatIndex);
    const active = run.current;
    active.elapsed += clockStep;

    for (const leg of active.legs) {
      const p = Math.min(1, active.elapsed / leg.seconds);
      const x = leg.from[0] + (leg.to[0] - leg.from[0]) * p;
      const z = leg.from[2] + (leg.to[2] - leg.from[2]) * p;
      const heading = storyPoseFor(leg.who)?.heading ?? 0;
      const travelYaw = Math.atan2(leg.to[0] - leg.from[0], leg.to[2] - leg.from[2]);
      const wanted = p < 1 ? travelYaw : (leg.faceYaw ?? travelYaw);
      writeStoryPose(leg.who, {
        x,
        y: leg.to[1],
        z,
        heading: turnToward(heading, wanted, turnStep),
        moving: p < 1,
        speed: p < 1 ? leg.speed : 0,
      });
    }
    for (const turn of active.turns) {
      const pose = storyPoseFor(turn.who);
      if (!pose) continue;
      writeStoryPose(turn.who, { ...pose, heading: turnToward(pose.heading, turn.yaw, turnStep) });
    }

    if (active.elapsed >= active.duration) {
      const next = active.index + 1;
      run.current = null;
      advanceStoryBeat(next);
    }
  });

  return null;
}
