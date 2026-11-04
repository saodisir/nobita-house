import { beforeEach, describe, expect, it } from 'vitest';
import { clearOccupiedDoors, markDoorOccupied } from './door-occupancy';
import { useAppStore } from './store';

/**
 * The rules around a drive, which are the store's business rather than the scene's: which other
 * views let go of the camera, what a click means mid-drive, and that turning the lens round
 * never lets go of the subject.
 */

const reset = () => {
  clearOccupiedDoors();
  useAppStore.setState({
    selectedCharacterId: null,
    activeRoomId: null,
    selectedRoomHotspot: null,
    tourIndex: null,
    aerialView: false,
    stage: 0,
    freeWalk: false,
    driveView: 'first',
    autoRotate: false,
    possessedId: null,
    poseClip: null,
    modelClips: {},
    openDoors: {},
  });
};

beforeEach(reset);

describe('one drive, two views', () => {
  it('starts third person and releases everything else that wants the camera', () => {
    useAppStore.setState({
      selectedCharacterId: 'shizuka',
      activeRoomId: 'genkan',
      tourIndex: 2,
      aerialView: true,
      stage: 2,
      freeWalk: true,
      autoRotate: true,
    });

    useAppStore.getState().driveAs('nobita', 'third');

    const s = useAppStore.getState();
    expect(s.possessedId).toBe('nobita');
    expect(s.driveView).toBe('third');
    expect(s.freeWalk).toBe(true);
    expect(s.poseClip).toBeNull();
    // A card over the shoulder and a chase camera cannot both have the same view.
    expect(s.selectedCharacterId).toBeNull();
    expect(s.activeRoomId).toBeNull();
    expect(s.tourIndex).toBeNull();
    expect(s.aerialView).toBe(false);
    expect(s.stage).toBe(0);
    expect(s.autoRotate).toBe(false);
  });

  it('starts first person at a child’s eyes', () => {
    useAppStore.getState().driveAs('doraemon', 'first');

    const s = useAppStore.getState();
    expect(s.freeWalk).toBe(true);
    expect(s.possessedId).toBe('doraemon');
    expect(s.driveView).toBe('first');
  });

  it('swaps the lens without letting go of the subject', () => {
    const { driveAs, setDriveView } = useAppStore.getState();
    driveAs('nobita', 'first');
    setDriveView('third');

    let s = useAppStore.getState();
    expect(s.driveView).toBe('third');
    expect(s.possessedId).toBe('nobita');
    expect(s.freeWalk).toBe(true);
    expect(s.poseClip).toBeNull();

    setDriveView('first');
    s = useAppStore.getState();
    expect(s.driveView).toBe('first');
    expect(s.possessedId).toBe('nobita');
  });

  it('will not put a lens behind a visitor with no body', () => {
    const { toggleFreeWalk, setDriveView } = useAppStore.getState();
    toggleFreeWalk();
    setDriveView('third');

    const s = useAppStore.getState();
    expect(s.freeWalk).toBe(true);
    expect(s.possessedId).toBeNull();
    expect(s.driveView).toBe('first');
  });

  it('holds the chosen motion until the hand is lifted', () => {
    const { driveAs, setPoseClip, releaseCharacter } = useAppStore.getState();
    driveAs('nobita', 'third');
    setPoseClip('dance');
    expect(useAppStore.getState().poseClip).toBe('dance');
    releaseCharacter();
    expect(useAppStore.getState().possessedId).toBeNull();
    expect(useAppStore.getState().freeWalk).toBe(false);
    // The motion belonged to the session of driving, not to the child: it goes with the hand.
    expect(useAppStore.getState().poseClip).toBeNull();
  });

  it('does not treat a click as a selection while driving', () => {
    const { driveAs, select } = useAppStore.getState();
    driveAs('nobita', 'third');

    // A drag that ends on the ground: not a dismissal.
    select(null);
    expect(useAppStore.getState().possessedId).toBe('nobita');

    // A click on the child under the hand: not a card either.
    select('nobita');
    expect(useAppStore.getState().possessedId).toBe('nobita');
    expect(useAppStore.getState().selectedCharacterId).toBeNull();

    // Anybody else: the drive changes whose feet it uses, keeping the same view.
    select('gian');
    expect(useAppStore.getState().possessedId).toBe('gian');
    expect(useAppStore.getState().driveView).toBe('third');
    expect(useAppStore.getState().freeWalk).toBe(true);
    expect(useAppStore.getState().selectedCharacterId).toBeNull();
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
      useAppStore.getState().driveAs('nobita', 'first');
      act();
      expect(useAppStore.getState().possessedId, name).toBeNull();
      expect(useAppStore.getState().freeWalk, name).toBe(false);
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

describe('doors', () => {
  it('starts shut, and a click toggles the one leaf that was hit', () => {
    const { toggleDoor } = useAppStore.getState();
    expect(useAppStore.getState().openDoors['door-front']).toBeUndefined();
    toggleDoor('door-front');
    expect(useAppStore.getState().openDoors['door-front']).toBe(true);
    expect(useAppStore.getState().openDoors['door-living']).toBeUndefined();
    toggleDoor('door-front');
    expect(useAppStore.getState().openDoors['door-front']).toBe(false);
  });

  it('does not make a new map when nothing changed', () => {
    const { setDoorOpen } = useAppStore.getState();
    setDoorOpen('door-front', true);
    const map = useAppStore.getState().openDoors;
    setDoorOpen('door-front', true);
    expect(useAppStore.getState().openDoors).toBe(map);
    setDoorOpen('door-front', false);
    expect(useAppStore.getState().openDoors['door-front']).toBe(false);
  });
});

describe('the aerial and the lid are independent', () => {
  it('looks down without taking the house apart', () => {
    useAppStore.getState().toggleAerial();
    expect(useAppStore.getState().aerialView).toBe(true);
    expect(useAppStore.getState().stage).toBe(0);
  });

  it('leaves a chosen stage alone on the way in and on the way out', () => {
    useAppStore.getState().setStage(2);
    useAppStore.getState().toggleAerial();
    expect(useAppStore.getState().stage).toBe(2);
    useAppStore.getState().toggleAerial();
    expect(useAppStore.getState().aerialView).toBe(false);
    expect(useAppStore.getState().stage).toBe(2);
  });

  it('lets the visitor lift a floor while looking down, and keeps it after leaving', () => {
    useAppStore.getState().toggleAerial();
    useAppStore.getState().setStage(1);
    expect(useAppStore.getState().aerialView).toBe(true);
    expect(useAppStore.getState().stage).toBe(1);
    useAppStore.getState().toggleAerial();
    expect(useAppStore.getState().stage).toBe(1);
  });
});

describe('a leaf cannot shut through a body', () => {
  it('keeps an open door open while the walker stands in its doorway', () => {
    useAppStore.getState().setDoorOpen('door-front', true);
    markDoorOccupied('door-front');

    useAppStore.getState().toggleDoor('door-front');

    expect(useAppStore.getState().openDoors['door-front']).toBe(true);
  });

  it('shuts it once the doorway is clear', () => {
    useAppStore.getState().setDoorOpen('door-front', true);
    markDoorOccupied('door-front');
    useAppStore.getState().toggleDoor('door-front');
    clearOccupiedDoors();

    useAppStore.getState().toggleDoor('door-front');

    expect(useAppStore.getState().openDoors['door-front']).toBe(false);
  });

  it('still opens a shut door with somebody in its way', () => {
    markDoorOccupied('door-front');

    useAppStore.getState().toggleDoor('door-front');

    expect(useAppStore.getState().openDoors['door-front']).toBe(true);
  });

  it('refuses a forced close too, and only for the occupied leaf', () => {
    useAppStore.getState().setDoorOpen('door-front', true);
    useAppStore.getState().setDoorOpen('door-back', true);
    markDoorOccupied('door-front');

    const { setDoorOpen } = useAppStore.getState();
    setDoorOpen('door-front', false);
    setDoorOpen('door-back', false);

    expect(useAppStore.getState().openDoors['door-front']).toBe(true);
    expect(useAppStore.getState().openDoors['door-back']).toBe(false);
  });

  it('does not make a new map when the close is refused', () => {
    useAppStore.getState().setDoorOpen('door-front', true);
    const map = useAppStore.getState().openDoors;
    markDoorOccupied('door-front');

    useAppStore.getState().toggleDoor('door-front');

    expect(useAppStore.getState().openDoors).toBe(map);
  });
});
