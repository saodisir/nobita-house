import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from './store';

/**
 * The rules around driving a child, which are the store's business rather than the scene's:
 * who else has to let go of the camera, what a click means while somebody is under the hand, and
 * what happens to a chosen motion when the hand is lifted.
 */

const reset = () =>
  useAppStore.setState({
    selectedCharacterId: null,
    activeRoomId: null,
    selectedRoomHotspot: null,
    tourIndex: null,
    aerialView: false,
    stage: 0,
    freeWalk: false,
    autoRotate: false,
    possessedId: null,
    poseClip: null,
    modelClips: {},
  });

beforeEach(reset);

describe('taking a child by the hand', () => {
  it('releases everything else that wants the camera', () => {
    useAppStore.setState({
      selectedCharacterId: 'shizuka',
      activeRoomId: 'genkan',
      tourIndex: 2,
      aerialView: true,
      stage: 2,
      freeWalk: true,
      autoRotate: true,
    });

    useAppStore.getState().possess('nobita');

    const s = useAppStore.getState();
    expect(s.possessedId).toBe('nobita');
    expect(s.poseClip).toBeNull();
    // A card over the shoulder and a chase camera cannot both have the same view.
    expect(s.selectedCharacterId).toBeNull();
    expect(s.activeRoomId).toBeNull();
    expect(s.tourIndex).toBeNull();
    expect(s.aerialView).toBe(false);
    expect(s.stage).toBe(0);
    expect(s.freeWalk).toBe(false);
    expect(s.autoRotate).toBe(false);
  });

  it('holds the chosen motion until the hand is lifted', () => {
    const { possess, setPoseClip, releaseCharacter } = useAppStore.getState();
    possess('nobita');
    setPoseClip('dance');
    expect(useAppStore.getState().poseClip).toBe('dance');
    releaseCharacter();
    expect(useAppStore.getState().possessedId).toBeNull();
    // The motion belonged to the session of driving, not to the child: it goes with the hand.
    expect(useAppStore.getState().poseClip).toBeNull();
  });

  it('does not treat a click as a selection while driving', () => {
    const { possess, select } = useAppStore.getState();
    possess('nobita');

    // A drag that ends on the ground: not a dismissal.
    select(null);
    expect(useAppStore.getState().possessedId).toBe('nobita');

    // A click on the child under the hand: not a card either.
    select('nobita');
    expect(useAppStore.getState().possessedId).toBe('nobita');
    expect(useAppStore.getState().selectedCharacterId).toBeNull();

    // Anybody else: the hand moves to them.
    select('gian');
    expect(useAppStore.getState().possessedId).toBeNull();
    expect(useAppStore.getState().selectedCharacterId).toBe('gian');
  });

  it('lets go for anything that moves the visitor elsewhere', () => {
    const elsewhere: [string, () => void][] = [
      ['enterRoom', () => useAppStore.getState().enterRoom('genkan')],
      ['toggleFreeWalk', () => useAppStore.getState().toggleFreeWalk()],
      ['toggleAerial', () => useAppStore.getState().toggleAerial()],
      ['resetView', () => useAppStore.getState().resetView()],
    ];
    for (const [name, act] of elsewhere) {
      reset();
      useAppStore.getState().possess('nobita');
      act();
      expect(useAppStore.getState().possessedId, name).toBeNull();
    }
  });

  it('does not rebuild the clip list when the same model reports again', () => {
    const { setModelClips } = useAppStore.getState();
    setModelClips('nobita', ['idle', 'walk']);
    const first = useAppStore.getState().modelClips;
    // The reporting effect can run twice for one GLB; a new array of the same names would be a
    // new object, a new bar and a new render for nothing.
    setModelClips('nobita', ['idle', 'walk']);
    expect(useAppStore.getState().modelClips).toBe(first);

    setModelClips('nobita', ['idle']);
    expect(useAppStore.getState().modelClips.nobita).toEqual(['idle']);
  });
});
