/** Camera, scene and feature tunables. Metres, +Y up, street is at +Z. */
export const config = {
  camera: {
    /**
     * Default hero framing: face-on to the group round the gate (characters span x −0.98–3.70,
     * the wall sitters reach ~2.7 m), from the far sidewalk across the road, a little above
     * eye height. The sandlot is behind it, so a straight dolly-out has nothing to collide with.
     */
    position: [1.37, 2.5, 13.8] as const,
    target: [1.37, 1.35, 6.4] as const,
    /**
     * Half the group's width, metres, round `target.x` (outstretched arms included). On a
     * narrow screen the default view backs off along the same line until this still fits.
     */
    groupHalfWidth: 3.2,
    fov: 38,
    minDistance: 5,
    // Far enough to frame the whole block, sandlot to west lots, from any side. The fog
    // (48–110 m by day) still swallows the road ends; the house takes ~20% haze at the limit.
    maxDistance: 60,
    /** Never look from below ground (max polar) or straight down (min polar). */
    minPolarAngle: Math.PI * 0.12,
    // Slightly higher floor than before: at the far orbit 0.49π grazes the neighbour walls.
    maxPolarAngle: Math.PI * 0.47,
  },
  /**
   * Box the orbit target is clamped inside, metres. Nobita's lot, the front road, the sandlot
   * across it, and west over the crossroads to the corner lots, so the whole near block can be
   * panned to without letting the view wander off it.
   */
  targetBounds: { x0: -24, x1: 9, z0: -12.5, z1: 22 },
  /** Nobita's house is not a model file: `src/scene/house.tsx` builds it from `plan.ts`. */
  models: {
    environment: '/models/environment.glb',
    streets: '/models/streets.glb',
    neighbours: '/models/neighbours.glb',
    characterDir: '/models/characters',
    /** The two parents: one sculpt each, no rig, no clips — see `src/data/residents.ts`. */
    residentDir: '/models/residents',
    tree: '/models/props/tree.glb',
    hedge: '/models/props/hedge.glb',
    sakura: '/models/props/sakura.glb',
  },
  /** Looped background track: auto-plays, and the Music button's on/off choice persists across reloads. */
  music: {
    src: '/audio/background-music.mp3',
    /** Playback volume, 0–1. */
    volume: 0.06,
  },
} as const;
