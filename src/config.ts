/** Camera, scene and feature tunables. Metres, +Y up, street is at +Z. */
export const config = {
  camera: {
    /**
     * Default hero framing: face-on down the gate's axis, from the far sidewalk across the
     * road, a little above eye height. The sandlot is behind it, so a straight dolly-out has
     * nothing to collide with.
     *
     * The axis is the gate's, not the group's. Both used to be worked out separately — the eye
     * from the six children's span, the aerial from the house's footprint — so the two framings
     * disagreed by three metres and "lift the roof" read as a cut to somewhere else. One line,
     * x = `layout.wall.gateX`, is what everything in the yard is built on: the gate, the path
     * stones, the front door. Centring on it costs the group 0.34 m of frame and nothing else.
     */
    position: [1.02, 2.5, 13.8] as const,
    target: [1.02, 1.35, 6.4] as const,
    /**
     * Half the group's width, metres, round `target.x` (outstretched arms included). On a
     * narrow screen the default view backs off along the same line until this still fits.
     */
    groupHalfWidth: 3.2,
    fov: 38,
    /**
     * How close the eye may come, metres. It was 5, which is further than the gate is from the
     * pavement: the visitor could not push in on the door, the mailbox or a child's face, and
     * the orbit swung the whole diorama because the point it turned about was out of arm's
     * reach. 1.6 m is inside the gate and close enough to read a face.
     */
    minDistance: 1.6,
    // Far enough to frame the whole block, sandlot to west lots, from any side. The fog
    // (48–110 m by day) still swallows the road ends; the house takes ~20% haze at the limit.
    maxDistance: 60,
    /** Never look from below ground (max polar) or straight down (min polar). */
    minPolarAngle: Math.PI * 0.1,
    // 0.47π is a hair above level, and it is the ground that sets it: past half a turn the eye
    // drops below the pavement and the camera ends up under the lawn. To look up at the roof,
    // truck the target up — it is allowed to 8 m — rather than swing the eye underground.
    maxPolarAngle: Math.PI * 0.495,
  },
  /**
   * Box the orbit target is clamped inside, metres. Nobita's lot, the front road, the sandlot
   * across it, and west over the crossroads to the corner lots, so the whole near block can be
   * panned to without letting the view wander off it.
   */
  /**
   * The orbit target stays inside the block. `z1` runs to the back of the vacant lot, because
   * that is where half the walk happens now and a followed child must never be clamped short
   * of the camera's reach (`walk-routes.test.ts` holds the two together).
   */
  targetBounds: { x0: -24, x1: 9, z0: -12.5, z1: 34 },
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
