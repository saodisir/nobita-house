import { beforeEach, describe, expect, it } from 'vitest';
import { STORY_CAST, storyBeats } from '../data/story';
import { advanceStoryBeat, useStoryStore } from './story';

describe('the story clip state', () => {
  beforeEach(() => {
    useStoryStore.setState({
      status: 'idle',
      beatIndex: 0,
      speech: null,
      clips: {},
      camera: null,
    });
  });

  it('holds every standing child at idle so no ambient dance bleeds into the scene', () => {
    useStoryStore.getState().startStory();
    for (const [index, beat] of storyBeats.entries()) {
      if (index > 0) advanceStoryBeat(index);
      const clips = useStoryStore.getState().clips;
      const walking = new Set((beat.actions ?? []).filter((action) => action.go).map((action) => action.who));
      for (const action of beat.actions ?? []) {
        if (action.clip && !action.go) {
          expect(clips[action.who], `beat ${index}: ${action.who} keeps its scripted clip`).toBe(action.clip);
        }
      }
      for (const who of STORY_CAST) {
        if (walking.has(who)) {
          expect(clips[who], `beat ${index}: ${who} keeps the walk clip`).toBeUndefined();
        } else {
          expect(clips[who], `beat ${index}: ${who} stands quietly`).toBeDefined();
        }
      }
    }
  });
});
