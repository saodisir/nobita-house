import { create } from 'zustand';
import { DEFAULT_TIME_OF_DAY, type TimeOfDayId } from '../data/time-of-day';
import { tourStops } from '../data/tour';
import { DEFAULT_WEATHER, type WeatherId } from '../data/weather';

/**
 * How far the diorama is taken apart. `0` the house as built; `1` the roof off, upstairs open to
 * the sky; `2` the upper floor slid out sideways as well, which is the only way to see the ground
 * floor — its ceiling is that floor's slab, and no amount of lifting the lid gets under it.
 */
export type DioramaStage = 0 | 1 | 2;

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
   * The visitor walks the lot and the house on their own feet, WASD and mouse, instead of orbiting.
   * Separate from `walkMode`, which is about the characters' stroll along the street.
   */
  freeWalk: boolean;
  /**
   * How far the diorama is taken apart: shut, roof off, or roof off and the upper floor slid out
   * of the way. Detents rather than a percentage, because the useful positions are not a
   * continuum — half a house is not a view, it is half a house.
   */
  stage: DioramaStage;
  /**
   * The aerial: house opened, camera over it looking down. A mode rather than two separate
   * controls, because either half alone is useless — the house opened with the camera still on
   * the street shows nothing, and the camera overhead with the lid on shows a roof.
   */
  aerialView: boolean;
  /** Where the stage was before the aerial took it, so leaving puts it back. */
  stageBeforeAerial: DioramaStage;
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
  stage: 0,
  aerialView: false,
  stageBeforeAerial: 0,
  resetToken: 0,
  tourIndex: null,
  timeOfDay: DEFAULT_TIME_OF_DAY,
  weather: DEFAULT_WEATHER,
  select: (id) => set({ selectedCharacterId: id }),
  // Going in closes whatever the street had open: a character card behind a wall is noise.
  // Moving between rooms closes the card too — it describes something now out of sight.
  enterRoom: (roomId) =>
    set({
      activeRoomId: roomId,
      roomViewIndex: 0,
      selectedCharacterId: null,
      selectedRoomHotspot: null,
      autoRotate: false,
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
  // Walking and standing in a room are two ways of holding the camera; switching to one releases
  // the other, or the room's fixed eye fights the walker for the same position every frame.
  toggleFreeWalk: () =>
    set((s) => ({
      freeWalk: !s.freeWalk,
      activeRoomId: s.freeWalk ? s.activeRoomId : null,
      selectedRoomHotspot: null,
      selectedCharacterId: null,
      autoRotate: false,
      tourIndex: s.freeWalk ? s.tourIndex : null,
      aerialView: false,
      stage: 0,
    })),
  // The three detents, clamped: nothing downstream should have to wonder what 7 means.
  setStage: (value) => set({ stage: Math.min(2, Math.max(0, Math.round(value))) as DioramaStage }),
  // Both halves at once: the detent remembers where it was, the lens goes up. Anything that moves
  // the visitor elsewhere — a room, a walk, a reset — shuts the house again on its way out.
  toggleAerial: () =>
    set((s) =>
      s.aerialView
        ? { aerialView: false, stage: s.stageBeforeAerial }
        : {
            aerialView: true,
            stageBeforeAerial: s.stage,
            stage: 2,
            activeRoomId: null,
            selectedCharacterId: null,
            selectedRoomHotspot: null,
            tourIndex: null,
            autoRotate: false,
          },
    ),
  // Reset always lands on the street: it is the "I am lost" button.
  resetView: () =>
    set((s) => ({
      resetToken: s.resetToken + 1,
      selectedCharacterId: null,
      activeRoomId: null,
      selectedRoomHotspot: null,
      tourIndex: null,
      aerialView: false,
      stage: 0,
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
