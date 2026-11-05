/**
 * The story's share of the app's state, and the poses its walker reads.
 *
 * Two kinds of state here, deliberately kept apart. The zustand store changes once per beat:
 * which line is on screen, which clip each child is holding, and whether the lens should cut.
 * Those are React state, because the dialogue box, the six characters and the camera rig need
 * to re-render when they change. The six poses change every frame and live in a plain Map:
 * publishing sixty positions a second through React would re-render the whole scene for
 * nothing. `use-walker.ts` reads the Map straight from its frame loop.
 */
import { create } from 'zustand';
import { characters } from '../data/characters';
import { type StoryCamera, type StoryCharacterId, type StoryClip, storyBeats } from '../data/story';
import type { Localized } from '../i18n/locale';
import { useAppStore } from './store';

export type StoryStatus = 'idle' | 'playing' | 'done';

export interface StoryPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  moving: boolean;
  /** Ground speed, read by the walk clip to set its playback rate. */
  speed: number;
}

const poses = new Map<StoryCharacterId, StoryPose>();

export function storyPoseFor(id: string): StoryPose | undefined {
  return poses.get(id as StoryCharacterId);
}

export function writeStoryPose(id: StoryCharacterId, pose: StoryPose): void {
  poses.set(id, pose);
}

interface Speech {
  who: StoryCharacterId;
  line: Localized;
  /** The beat number, used as the dialogue box's key so each line fades in on its own. */
  token: number;
}

interface StoryState {
  status: StoryStatus;
  beatIndex: number;
  speech: Speech | null;
  /** A forced clip per child, only for children standing still during this beat. */
  clips: Record<string, StoryClip>;
  /** A cut requested by this beat. Null means hold the lens where the last cut left it. */
  camera: StoryCamera | null;
  startStory: () => void;
  finishStory: () => void;
}

function speechFor(index: number): Speech | null {
  const say = storyBeats[index]?.say;
  return say ? { who: say.who, line: say.line, token: index } : null;
}

function clipsFor(index: number): Record<string, StoryClip> {
  const beat = storyBeats[index];
  const out: Record<string, StoryClip> = {};
  if (!beat) return out;
  // A child with no scripted clip falls back to the diorama's ambient pause clips, which are
  // games, dances and cheers. That is exactly what must not happen while a story is being
  // told, so hold every standing child at a plain idle before layering this beat's directions
  // on top. Children who are walking are left out: `forced` in character.tsx wins over the
  // walk clip, so forcing one onto a travelling body would make it slide along the pavement.
  const walking = new Set(beat.actions?.filter((action) => action.go).map((action) => action.who));
  for (const def of characters) {
    if (!walking.has(def.id as StoryCharacterId)) out[def.id] = 'idle';
  }
  for (const action of beat.actions ?? []) {
    if (action.clip && !action.go) out[action.who] = action.clip;
  }
  return out;
}

function cameraFor(index: number): StoryCamera | null {
  return storyBeats[index]?.camera ?? null;
}

export const useStoryStore = create<StoryState>((set) => ({
  status: 'idle',
  beatIndex: 0,
  speech: null,
  clips: {},
  camera: null,

  startStory: () => {
    // The random afternoon and the visitor's own feet both own the children's transforms.
    // Let them go before the script takes over, and put the lens back on the street so the
    // gate is in frame. `resetView` does most of it; it deliberately leaves walkMode alone.
    useAppStore.setState({ walkMode: false, autoRotate: false });
    useAppStore.getState().resetView();

    // Every child starts on their own spot, standing. The sitters' authored rest offset is
    // dropped while the story plays, so nobody is left hanging over the coping they sat on.
    poses.clear();
    for (const def of characters) {
      poses.set(def.id as StoryCharacterId, {
        x: def.position[0],
        y: def.position[1],
        z: def.position[2],
        heading: def.rotationY,
        moving: false,
        speed: 0,
      });
    }
    set({
      status: 'playing',
      beatIndex: 0,
      speech: speechFor(0),
      clips: clipsFor(0),
      camera: cameraFor(0),
    });
  },

  finishStory: () => {
    // The last beat has already walked everybody home and cut the lens back to the gate.
    // Handing the walkers back now is a change of owner, not a change of place. The reset
    // is a safeguard for a visitor who moved the camera by hand during the performance.
    poses.clear();
    useAppStore.getState().resetView();
    set({ status: 'done', beatIndex: 0, speech: null, clips: {}, camera: null });
  },
}));

/** Called by the player once a beat's time is up. Beyond the last beat the story ends. */
export function advanceStoryBeat(next: number): void {
  if (next >= storyBeats.length) {
    useStoryStore.getState().finishStory();
    return;
  }
  useStoryStore.setState({
    beatIndex: next,
    speech: speechFor(next),
    clips: clipsFor(next),
    camera: cameraFor(next),
  });
}
