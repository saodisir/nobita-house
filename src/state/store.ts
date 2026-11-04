import { create } from 'zustand';
import { DEFAULT_TIME_OF_DAY, type TimeOfDayId } from '../data/time-of-day';
import { tourStops } from '../data/tour';
import { DEFAULT_WEATHER, type WeatherId } from '../data/weather';
import { detectLocale, type Locale, storeLocale, syncDocumentLang } from '../i18n/locale';
import { doorOccupied } from './door-occupancy';

/**
 * How far the diorama is taken apart. `0` the house as built; `1` the roof off, upstairs open to
 * the sky; `2` the upper floor slid out sideways as well, which is the only way to see the ground
 * floor — its ceiling is that floor's slab, and no amount of lifting the lid gets under it.
 */
export type DioramaStage = 0 | 1 | 2;

/**
 * Where the lens sits during a drive. It is a property of the camera, not of the walking: the
 * same feet, the same collision and the same position feed both, so switching mid-walk cannot
 * move the subject. First person has no body to look at and is the only view a visitor without
 * a character can use; third person needs somebody to stand behind.
 */
export type DriveView = 'first' | 'third';

/**
 * Which room the visitor is standing in, or `null` for the street. It replaced a boolean
 * view: the house has more than one room, and "inside" was never one place.
 */
interface AppState {
  selectedCharacterId: string | null;
  activeRoomId: string | null;
  /** Which of the room's places to stand (`HouseRoom.views`) the visitor is at. */
  roomViewIndex: number;
  /** `RoomHotspot.id` whose card is open, or null. Only meaningful inside a room. */
  selectedRoomHotspot: string | null;
  /** Which model URLs actually exist on the server; missing → proxy geometry. */
  availableModels: Record<string, boolean>;
  preflightDone: boolean;
  autoRotate: boolean;
  /** Render stats are a developer tool: off until someone asks for them in the settings. */
  showPerf: boolean;
  /** The six characters stroll round the block; off, they walk back to their spots. */
  walkMode: boolean;
  /**
   * A drive is in progress. The visitor's own feet and a child's are the same session now: this
   * flag says the session is on, `possessedId` says whose feet, and `driveView` says where the
   * lens sits. Keeping the old name avoids rewriting every camera consumer for a rename.
   */
  freeWalk: boolean;
  /** Whose feet the drive uses: `null` is the visitor, with no body in the scene. */
  possessedId: string | null;
  /** Which end of the drive the camera looks from. Switchable without leaving the session. */
  driveView: DriveView;
  /**
   * How far the diorama is taken apart: shut, roof off, or roof off and the upper floor slid out
   * of the way. Detents rather than a percentage, because the useful positions are not a
   * continuum — half a house is not a view, it is half a house.
   */
  stage: DioramaStage;
  /**
   * The aerial: the camera over the house, looking down. Only a camera move. How far the house
   * is taken apart is `stage`, and the two are independent — looking down at a shut house is a
   * perfectly good view, and lifting one floor does not need the lens to leave the street.
   */
  aerialView: boolean;
  /** Incremented to request a camera reset; camera rig subscribes. */
  resetToken: number;
  /**
   * Index into `tourStops`, or null when no tour is running. Independent of
   * `activeRoomId`: wandering off the route never cancels the tour — Next re-syncs.
   */
  tourIndex: number | null;
  /** Which lighting/sky preset the scene eases toward. */
  timeOfDay: TimeOfDayId;
  /** Laid over the time of day: rain greys whichever light is selected. */
  weather: WeatherId;
  /**
   * Every door's open/shut state, by id. The click on a leaf, a room view, a child walking in
   * from the yard and the walker's collision all read this one map: an absent id is a shut door.
   * Keeping it here is what makes a closed leaf a wall you cannot walk through.
   */
  openDoors: Record<string, boolean>;
  /**
   * Which language the chrome speaks. Not a view preference like `autoRotate` — it is remembered
   * across visits, because a visitor who reads only Chinese should not have to say so twice.
   */
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /**
   * A clip forced on the held child, by name, or null to let movement choose between idle, walk
   * and run. Forcing one is how the studio's motion list reaches the diorama: the same clips,
   * played on a child that is out in the street instead of on a turntable.
   */
  poseClip: string | null;
  /** Clip names each loaded model carries, reported once its GLB arrives; read by the bar. */
  modelClips: Record<string, string[]>;
  /** Begin (or restart) a drive on `id`, or on the visitor's own feet with `null`. */
  driveAs: (id: string | null, view: DriveView) => void;
  /** Turn the camera round without touching the subject's position, speed or keys. */
  setDriveView: (view: DriveView) => void;
  /** Legacy name for the third-person entry point, kept for the store's callers and tests. */
  possess: (id: string) => void;
  releaseCharacter: () => void;
  setPoseClip: (clip: string | null) => void;
  setModelClips: (id: string, clips: string[]) => void;
  setDoorOpen: (id: string, open: boolean) => void;
  /** A click on a leaf, from the pointer or from the first-person crosshair ray. */
  toggleDoor: (id: string) => void;
  select: (id: string | null) => void;
  enterRoom: (roomId: string) => void;
  leaveRoom: () => void;
  /** Step to another place to stand in the same room. */
  setRoomView: (index: number) => void;
  selectRoomHotspot: (id: string | null) => void;
  setAvailable: (map: Record<string, boolean>) => void;
  setTimeOfDay: (id: TimeOfDayId) => void;
  setWeather: (id: WeatherId) => void;
  toggleAutoRotate: () => void;
  togglePerf: () => void;
  toggleWalkMode: () => void;
  toggleFreeWalk: () => void;
  setStage: (stage: DioramaStage) => void;
  toggleAerial: () => void;
  resetView: () => void;
  startTour: () => void;
  /** +1 next, −1 prev. No-op outside a tour or past either end. */
  tourGo: (dir: 1 | -1) => void;
  exitTour: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  selectedCharacterId: null,
  activeRoomId: null,
  roomViewIndex: 0,
  selectedRoomHotspot: null,
  availableModels: {},
  preflightDone: false,
  autoRotate: false,
  showPerf: false,
  walkMode: false,
  freeWalk: false,
  driveView: 'first',
  stage: 0,
  aerialView: false,
  resetToken: 0,
  tourIndex: null,
  timeOfDay: DEFAULT_TIME_OF_DAY,
  weather: DEFAULT_WEATHER,
  openDoors: {},
  locale: detectLocale(),
  setLocale: (locale) => {
    if (get().locale === locale) return;
    storeLocale(locale);
    syncDocumentLang(locale);
    set({ locale });
  },
  possessedId: null,
  poseClip: null,
  modelClips: {},
  // One drive, three questions: is it on, whose feet, where is the lens. Everything else that
  // wants the camera — a room, a tour, the aerial — lets go first. The card goes with it: it
  // covers the view the driving needs.
  driveAs: (id, view) =>
    set({
      freeWalk: true,
      // A visitor with no body has nobody to stand behind: third person is only for a child.
      possessedId: id,
      driveView: id === null ? 'first' : view,
      poseClip: null,
      selectedCharacterId: null,
      activeRoomId: null,
      selectedRoomHotspot: null,
      tourIndex: null,
      aerialView: false,
      stage: 0,
      autoRotate: false,
    }),
  setDriveView: (view) =>
    set((s) =>
      // No child, no over-the-shoulder shot. The visitor's own feet are first person only.
      s.possessedId === null || !s.freeWalk || s.driveView === view ? s : { driveView: view },
    ),
  possess: (id) => get().driveAs(id, 'third'),
  releaseCharacter: () => set({ freeWalk: false, possessedId: null, poseClip: null, driveView: 'first' }),
  setPoseClip: (clip) => set({ poseClip: clip }),
  setModelClips: (id, clips) =>
    set((s) => {
      const had = s.modelClips[id];
      // By content: this is written from an effect that may run again for the same GLB, and a
      // new array of the same names would be a new state object and a new bar.
      if (had?.length === clips.length && had.every((name, k) => name === clips[k])) return s;
      return { modelClips: { ...s.modelClips, [id]: clips } };
    }),
  setDoorOpen: (id, open) =>
    set((s) => {
      if (s.openDoors[id] === open) return s;
      // A leaf travels the same ground whichever way it is going. Somebody on that ground
      // blocks both a shut leaf being pushed open and an open one being pulled shut, whether
      // the request came from a click, a room view or a child on its way back outside.
      if (doorOccupied(id)) return s;
      return { openDoors: { ...s.openDoors, [id]: open } };
    }),
  toggleDoor: (id) =>
    set((s) =>
      // `blocked()` drops a doorway's box as soon as the leaf opens, so the walker can stand in
      // the very space that leaf returns to; a hinged leaf also sweeps a quarter-disc beyond
      // the frame. The store stays open until that whole path is clear.
      doorOccupied(id) ? s : { openDoors: { ...s.openDoors, [id]: !s.openDoors[id] } },
    ),
  // A drive is a session, not a selection. Clicking about while walking must not let go of the
  // camera; clicking another child changes whose feet the session uses, keeping the same view.
  select: (id) =>
    set((s) => {
      if (s.freeWalk) {
        if (id === null || id === s.possessedId) return s;
        return { possessedId: id, poseClip: null, selectedCharacterId: null };
      }
      if (s.possessedId === null) return { selectedCharacterId: id };
      if (id === null || id === s.possessedId) return s;
      return { selectedCharacterId: id, possessedId: null, poseClip: null };
    }),
  // Going in closes whatever the street had open: a character card behind a wall is noise.
  // Moving between rooms closes the card too — it describes something now out of sight.
  enterRoom: (roomId) =>
    set({
      activeRoomId: roomId,
      roomViewIndex: 0,
      selectedCharacterId: null,
      selectedRoomHotspot: null,
      autoRotate: false,
      freeWalk: false,
      possessedId: null,
      poseClip: null,
      // Going in puts the lid back: a roof floating over a room you are standing in is a hole.
      aerialView: false,
      stage: 0,
    }),
  leaveRoom: () => set({ activeRoomId: null, selectedRoomHotspot: null }),
  // A card describes what the visitor was looking at; from another corner it may be behind them.
  setRoomView: (index) => set({ roomViewIndex: index, selectedRoomHotspot: null }),
  selectRoomHotspot: (id) => set({ selectedRoomHotspot: id }),
  setAvailable: (map) => set({ availableModels: map, preflightDone: true }),
  setTimeOfDay: (id) => set({ timeOfDay: id }),
  setWeather: (id) => set({ weather: id }),
  toggleAutoRotate: () => set((s) => ({ autoRotate: !s.autoRotate })),
  togglePerf: () => set((s) => ({ showPerf: !s.showPerf })),
  toggleWalkMode: () => set((s) => ({ walkMode: !s.walkMode })),
  // The visitor's own feet: the same drive as a child's, with nobody to stand behind. Leaving a
  // drive hands the lens back to the street rather than to wherever the walk stopped.
  toggleFreeWalk: () => {
    if (get().freeWalk) {
      get().resetView();
      return;
    }
    set((s) => ({
      freeWalk: true,
      possessedId: null,
      driveView: 'first',
      activeRoomId: null,
      selectedRoomHotspot: null,
      selectedCharacterId: null,
      autoRotate: false,
      tourIndex: s.tourIndex,
      aerialView: false,
      stage: 0,
      poseClip: null,
    }));
  },
  // The three detents, clamped: nothing downstream should have to wonder what 7 means.
  setStage: (value) => set({ stage: Math.min(2, Math.max(0, Math.round(value))) as DioramaStage }),
  // The aerial only moves the lens. It used to force `stage: 2` and put it back on the way out,
  // which made "look down at the house with its roof still on" impossible and silently undid a
  // stage the visitor had chosen. Lifting the lid is its own control now, and either state
  // survives the aerial. Anything that moves the visitor elsewhere still lets go of the lens.
  toggleAerial: () =>
    set((s) =>
      s.aerialView
        ? { aerialView: false }
        : {
            aerialView: true,
            activeRoomId: null,
            selectedCharacterId: null,
            selectedRoomHotspot: null,
            tourIndex: null,
            autoRotate: false,
            freeWalk: false,
            possessedId: null,
            poseClip: null,
          },
    ),
  // Reset always lands on the street: it is the "I am lost" button. It also ends a drive —
  // driving and a reset framing cannot both own the camera at once.
  resetView: () =>
    set((s) => ({
      resetToken: s.resetToken + 1,
      selectedCharacterId: null,
      activeRoomId: null,
      selectedRoomHotspot: null,
      tourIndex: null,
      aerialView: false,
      stage: 0,
      freeWalk: false,
      possessedId: null,
      driveView: 'first',
      poseClip: null,
    })),
  // The tour drives the same enter/leave the place menu does; the camera hook
  // cannot tell a tour leg from a menu jump, which is the point.
  startTour: () => {
    // The first stop is the street, which is a `leaveRoom` and would leave an aerial running.
    set({ tourIndex: 0, aerialView: false, stage: 0 });
    const stop = tourStops[0];
    if (stop?.roomId) get().enterRoom(stop.roomId);
    else get().leaveRoom();
  },
  tourGo: (dir) => {
    const { tourIndex } = get();
    if (tourIndex === null) return;
    const next = tourIndex + dir;
    const stop = tourStops[next];
    if (!stop) return;
    set({ tourIndex: next });
    if (stop.roomId) get().enterRoom(stop.roomId);
    else get().leaveRoom();
  },
  exitTour: () => set({ tourIndex: null }),
}));

/** HEAD-check every model once so Suspense never hits a 404 and proxies render instead. */
export async function preflightModels(urls: string[]) {
  const entries = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { method: 'HEAD' });
        const type = res.headers.get('content-type') ?? '';
        // Vite dev serves index.html for unknown paths → treat html as missing.
        return [url, res.ok && !type.includes('text/html')] as const;
      } catch {
        return [url, false] as const;
      }
    }),
  );
  useAppStore.getState().setAvailable(Object.fromEntries(entries));
}

// `lang` on `<html>` is what a screen reader picks its voice from, and CJK wants different line
// breaking: it has to be right before the first paint, not after the first interaction.
syncDocumentLang(useAppStore.getState().locale);
