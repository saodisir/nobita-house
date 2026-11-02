/**
 * Display catalog for the character motion clips.
 *
 * This file never decides what a model can do: availability is always read from the loaded
 * GLB (`gltf.animations`). A clip listed here that a model does not carry simply never shows
 * up, which is what lets the Mixamo motion set land one character at a time
 * (`plans/260912-1356-character-studio-mixamo/`).
 *
 * `welcome` is also the clip `src/scene/character.tsx` plays on selection, and `walk` is the
 * one walk mode will drive — renaming either here without renaming it in Blender breaks both.
 */
export interface MotionDef {
  /** Clip name inside the GLB. */
  id: string;
  label: string;
  description: string;
  /** False = holds its last frame (a bow, a wave); true = repeats for ever. */
  loop: boolean;
  /** Mixamo title the clip is downloaded under — the only link to the manual step. */
  source: string;
}

/** Catalog order is picker order: rest, locomotion, the looping moods, then the one-shots. */
export const motions: MotionDef[] = [
  {
    id: 'idle',
    label: 'Idle',
    description: 'Standing still, breathing. The resting pose everything else returns to.',
    loop: true,
    source: 'Breathing Idle',
  },
  {
    id: 'look-around',
    label: 'Look around',
    description: 'Turning the head and shoulders to take in the street. A curious idle.',
    loop: true,
    source: 'Looking Around',
  },
  {
    id: 'sit',
    label: 'Sit',
    description: 'Sitting on the ground, breathing — the hips sink to the floor and stay there.',
    loop: true,
    source: 'Sitting Idle',
  },
  {
    id: 'walk',
    label: 'Walk',
    description: 'One walking cycle in place. Walk mode plays this in step with ground speed.',
    loop: true,
    source: 'Walking (In Place)',
  },
  {
    id: 'run',
    label: 'Run',
    description: 'Running in place — the hardest test of the shoulder and knee weights.',
    loop: true,
    source: 'Running (In Place)',
  },
  {
    id: 'think',
    label: 'Think',
    description: 'Weight on one leg, hand near the chin. In character for the top of the class.',
    loop: true,
    source: 'Thinking',
  },
  {
    id: 'talk',
    label: 'Talk',
    description: 'Chatting with small hand gestures, as if explaining the homework.',
    loop: true,
    source: 'Talking',
  },
  {
    id: 'clap',
    label: 'Clap',
    description: 'Clapping in front of the chest.',
    loop: true,
    source: 'Clapping',
  },
  {
    id: 'dance',
    label: 'Dance',
    description: 'A silly dance — the longest clip, and the loosest the top of the class ever gets.',
    loop: true,
    source: 'Silly Dancing',
  },
  {
    id: 'house-dancing',
    label: 'House dance',
    description: 'Bouncy house footwork with loose arms.',
    loop: true,
    source: 'House Dancing',
  },
  {
    id: 'swing-dancing',
    label: 'Swing dance',
    description: 'A swing dance: kicks, swings and a lot of hip.',
    loop: true,
    source: 'Swing Dancing',
  },
  // Resting poses, one per character, held at home to match `assets/home.jpg`.
  {
    id: 'sit-wall-laugh',
    label: 'Sit and laugh',
    description: 'Sitting on a ledge with the shins hanging, laughing. Gian on the front wall.',
    loop: true,
    source: 'Sitting Laughing',
  },
  {
    id: 'sit-wall-talk',
    label: 'Sit and talk',
    description: 'Sitting on a ledge with the shins hanging, talking. Suneo on the front wall.',
    loop: true,
    source: 'Sitting Talking',
  },
  {
    id: 'sit-ground-happy',
    label: 'Sit happy',
    description: 'Sitting cross-legged on the ground, holding a foot.',
    loop: true,
    source: 'Sitting (floor, cheerful)',
  },
  {
    id: 'sitting-pose',
    label: 'Sitting pose',
    description:
      'A still pose on the ground, knees up, feet forward, hands down by the feet. Nobita at the gate.',
    loop: true,
    source: 'Sitting Pose',
  },
  {
    id: 'stand-happy',
    label: 'Stand happy',
    description: 'A happy standing idle. Shizuka on the sidewalk.',
    loop: true,
    source: 'Happy Idle',
  },
  {
    id: 'stand-calm',
    label: 'Stand calm',
    description: 'A calm, composed standing idle. Dekisugi by the gate pier.',
    loop: true,
    source: 'Standing idle (calm)',
  },
  {
    id: 'stand-cheerful',
    label: 'Stand cheerful',
    description: 'An excited standing loop. Doraemon beside Nobita.',
    loop: true,
    source: 'Standing idle (cheerful)',
  },
  {
    id: 'wave',
    label: 'Wave',
    description: 'A raised hand and a greeting toward the camera.',
    loop: false,
    source: 'Waving',
  },
  {
    id: 'welcome',
    label: 'Bow',
    description: 'The welcome bow the diorama plays when a character is selected at home.',
    loop: false,
    source: 'Standing Bow',
  },
  {
    id: 'nod',
    label: 'Nod',
    description: 'A nod yes.',
    loop: false,
    source: 'Head Nod Yes',
  },
  {
    id: 'jump',
    label: 'Jump',
    description: 'A standing jump: take-off, air, landing.',
    loop: false,
    source: 'Jumping',
  },
  {
    id: 'laugh',
    label: 'Laugh',
    description: 'Laughing out loud, the whole body shaking with it.',
    loop: false,
    source: 'Laughing',
  },
  {
    id: 'victory',
    label: 'Victory',
    description: 'A fist raised in triumph, like a perfect score coming back.',
    loop: false,
    source: 'Victory',
  },
  {
    id: 'cheer',
    label: 'Cheer',
    description: 'Both arms above the head.',
    loop: false,
    source: 'Cheering',
  },
];

export const motionById = (id: string) => motions.find((m) => m.id === id);

export interface MotionEntry extends MotionDef {
  /** False for a clip the GLB carries that this catalog has never heard of. */
  known: boolean;
}

/**
 * The clips a loaded model actually carries, in catalog order, with anything unknown appended
 * under its own name rather than hidden — a model is allowed to ship more than this file knows.
 */
export function listMotions(clipNames: readonly string[]): MotionEntry[] {
  const present = new Set(clipNames);
  const known = motions.filter((m) => present.has(m.id)).map((m) => ({ ...m, known: true }));
  const extra = clipNames
    .filter((name) => !motionById(name))
    .sort()
    .map((name) => ({
      id: name,
      label: name.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      description: 'Shipped in the model, not in the motion catalog.',
      loop: true,
      source: 'unknown',
      known: false,
    }));
  return [...known, ...extra];
}
