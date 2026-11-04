import { useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { type AnimationAction, type AnimationClip, type Group, LoopOnce, LoopRepeat, type Mesh } from 'three';
import { config } from '../config';
import type { CharacterDef } from '../data/characters';
import { poseFor } from '../state/character-poses';
import { useAppStore } from '../state/store';
import { prefersReducedMotion } from '../utils/reduced-motion';
import { type LoadedGltf, ModelOrProxy } from './model-or-proxy';
import { useCharacterMotion } from './use-character-motion';
import { useWalker, type WalkerPose } from './use-walker';
import { clipStride, moveClipFor, pauseClipFor } from './walk-clips';

const NO_OFFSET: [number, number, number] = [0, 0, 0];

/**
 * The clip a character holds at home: its `rest` clip (a sit) when the GLB carries it,
 * otherwise `idle`, otherwise none — the posed sculpts and the proxy just stand.
 */
function restFor(def: CharacterDef, animations: AnimationClip[]) {
  const has = (name: string) => animations.some((clip) => clip.name === name);
  const seated = !!def.rest && has(def.rest.clip);
  const clip = seated && def.rest ? def.rest.clip : has('idle') ? 'idle' : null;
  return { clip, seated };
}

/**
 * The clip a child holds standing still under the visitor's hand. Not its `rest` clip: that one
 * is the pose it was composed into, and for Yusuke and Nobita it is a sit on the wall — fine on
 * their own coping, a child hovering over the pavement anywhere else.
 */
function standClipFor(animations: AnimationClip[]) {
  const has = (name: string) => animations.some((clip) => clip.name === name);
  for (const name of ['idle', 'stand-calm', 'stand-happy', 'look-around']) if (has(name)) return name;
  return animations[0]?.name ?? null;
}

/** Capsule body + sphere head, scaled to canon height, shown until the real GLB exists. */
function CharacterProxy({ def, hovered }: { def: CharacterDef; hovered: boolean }) {
  const bodyH = def.height * 0.62;
  const headR = def.height * 0.19;
  return (
    <group>
      <mesh castShadow position={[0, bodyH / 2, 0]}>
        <capsuleGeometry args={[def.height * 0.16, bodyH - def.height * 0.32, 6, 12]} />
        <meshStandardMaterial color={def.color} emissive={def.color} emissiveIntensity={hovered ? 0.35 : 0} />
      </mesh>
      <mesh castShadow position={[0, bodyH + headR * 0.9, 0]}>
        <sphereGeometry args={[headR, 16, 12]} />
        <meshStandardMaterial color="#F7D9B8" emissive="#F7D9B8" emissiveIntensity={hovered ? 0.35 : 0} />
      </mesh>
    </group>
  );
}

interface ClipPresence {
  welcome: boolean;
  walk: boolean;
  /** The GLB carries the character's `rest` clip, so at home it sits rather than stands. */
  seated: boolean;
  /** The GLB carries a clip to hold at home (`rest` or `idle`). */
  resting: boolean;
}

/** Rodin exports arrive without shadow flags; set them once per loaded scene. */
function LoadedCharacter({
  gltf,
  def,
  index,
  greet,
  moving,
  resting,
  running,
  outside,
  game,
  possessed,
  forced,
}: {
  gltf: LoadedGltf;
  def: CharacterDef;
  index: number;
  greet: boolean;
  moving: boolean;
  resting: boolean;
  running: boolean;
  outside: boolean;
  game: string | null;
  /** The visitor has hold of this child: it stands on the ground, not on its authored seat. */
  possessed: boolean;
  /** A clip chosen from the motion bar, or null to let movement decide. */
  forced: string | null;
}) {
  const group = useRef<Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, group);
  // Read straight off the clips during render, so the very first frame already has the pose.
  const rest = restFor(def, gltf.animations);
  // Paused out on a route, the child does whatever the place allows: a game with the others,
  // a play loop where there is room, a standing loop at the kerb. At home it holds its own
  // rest clip instead, which for a wall sitter is a sit and carries the offset onto the
  // coping — an offset that would hang a child in mid-air if it were applied out in the yard.
  const paused = resting && !moving;
  const own = possessed ? standClipFor(gltf.animations) : rest.clip;
  const held = paused ? (pauseClipFor(index, gltf.animations, outside, game) ?? own) : own;
  // A clip picked in the motion bar wins over everything while the child stands still; the
  // moment it is asked to walk, the walk takes over — a dance played over a travelling body
  // reads as a child sliding along the pavement.
  const restClip = forced ?? (moving ? null : held);
  // Running and walking are different clips at different speeds; the pace decides which, and
  // `clipStride` keeps one cycle of either matched to the ground it covers.
  const moveClip = forced ? null : moving ? moveClipFor(running, gltf.animations) : null;
  // Never while held: the offset is what sits a sitter on the wall, and a driven child is
  // standing on the ground its own two feet are measured against.
  const offset = !possessed && !moving && !paused && rest.seated && def.rest ? def.rest.offset : NO_OFFSET;
  /** The resting action currently holding the pose, for the bow to hand back to. */
  const activeRest = useRef<AnimationAction | null>(null);
  const firstRest = useRef(true);

  useEffect(() => {
    gltf.scene.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Skinned bounds move with the bow; skip frustum culling so the mesh never blinks out.
        if ((mesh as unknown as { isSkinnedMesh?: boolean }).isSkinnedMesh) mesh.frustumCulled = false;
      }
    });
  }, [gltf.scene]);

  // The resting clip loops for as long as the character is home. On load it starts at full
  // weight: fading in from the bind pose would flash a Mixamo T-pose. Reduced motion holds its
  // first frame rather than dropping it, since without it a sitter stands and a stander T-poses.
  useLayoutEffect(() => {
    const action = restClip ? actions[restClip] : undefined;
    if (!action) return;
    action.reset();
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    if (firstRest.current) action.play();
    else action.fadeIn(0.2).play();
    firstRest.current = false;
    if (prefersReducedMotion()) {
      action.time = 0;
      action.paused = true;
    }
    activeRest.current = action;
    return () => {
      activeRest.current = null;
      action.fadeOut(0.2);
    };
  }, [restClip, actions]);

  // The welcome bow plays once each time the character is selected at home, crossfading out of
  // the resting clip and, once it ends, back into it. Setting off on a walk mid-bow fades it out.
  useEffect(() => {
    const welcome = actions.welcome;
    if (!greet || !welcome) return;
    if (prefersReducedMotion()) return;
    const held = activeRest.current;
    let done = false;
    welcome.reset();
    welcome.setLoop(LoopOnce, 1);
    // With a clip to return to, hold the last frame so the crossfade back starts from it.
    welcome.clampWhenFinished = !!held;
    welcome.play();
    held?.crossFadeTo(welcome, 0.2, false);
    const returnToRest = (e: { action: AnimationAction }) => {
      if (e.action !== welcome || !held || activeRest.current !== held) return;
      done = true;
      held.reset().play();
      welcome.crossFadeTo(held, 0.3, false);
    };
    mixer.addEventListener('finished', returnToRest);
    return () => {
      mixer.removeEventListener('finished', returnToRest);
      if (done) {
        welcome.stop();
        return;
      }
      welcome.fadeOut(0.15);
      // Cut short while still home (deselected mid-bow): bring the resting clip back.
      if (held && activeRest.current === held) held.fadeIn(0.15);
    };
  }, [greet, actions, mixer]);

  // The walk or run cycle loops for as long as the character is out there. Reduced motion keeps
  // it: the character is travelling either way, and frozen legs would just slide.
  useEffect(() => {
    if (!moveClip) return;
    const move = actions[moveClip];
    if (!move) return;
    move.reset();
    move.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    move.fadeIn(0.2).play();
    return () => {
      move.fadeOut(0.2);
    };
  }, [moveClip, actions]);

  // One clip cycle per stride of ground covered, so the feet stay planted at any speed. A run
  // covers more ground per cycle than a walk, hence its own stride.
  useFrame(() => {
    if (!moveClip) return;
    const move = actions[moveClip];
    if (move) move.timeScale = poseFor(def.id).speed / clipStride(moveClip, def.stride);
  });

  // Dev hook, the same idea as `__walkers` in `use-walker.ts`: which clip is up right now, so a
  // probe can tell a run from a walk and a game from a pause without reading pixels.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as { __clips?: Record<string, string | null> };
    w.__clips ??= {};
    w.__clips[def.id] = moveClip ?? restClip;
  }, [def.id, moveClip, restClip]);

  return (
    <group position={offset}>
      <group ref={group}>
        <primitive object={gltf.scene} />
      </group>
    </group>
  );
}

/** Reports which authored clips the loaded GLB carries, then renders it. */
function ClipProbe({
  gltf,
  def,
  index,
  greet,
  pose,
  possessed,
  forced,
  onClips,
}: {
  gltf: LoadedGltf;
  def: CharacterDef;
  index: number;
  greet: boolean;
  pose: WalkerPose;
  possessed: boolean;
  forced: string | null;
  onClips: (clips: ClipPresence) => void;
}) {
  const setModelClips = useAppStore((s) => s.setModelClips);
  useEffect(() => {
    const has = (name: string) => gltf.animations.some((clip) => clip.name === name);
    const rest = restFor(def, gltf.animations);
    onClips({ welcome: has('welcome'), walk: has('walk'), seated: rest.seated, resting: rest.clip !== null });
    // The motion bar lists what this model actually carries, so the list is read off the GLB the
    // moment it lands rather than guessed from the catalog: a bar full of clips nobody has is
    // worse than an empty one.
    setModelClips(
      def.id,
      gltf.animations.map((clip) => clip.name),
    );
  }, [gltf.animations, def, onClips, setModelClips]);
  return (
    <LoadedCharacter
      gltf={gltf}
      def={def}
      index={index}
      greet={greet}
      possessed={possessed}
      forced={forced}
      {...pose}
    />
  );
}

export function Character({ def, index }: { def: CharacterDef; index: number }) {
  const select = useAppStore((s) => s.select);
  const selected = useAppStore((s) => s.selectedCharacterId === def.id);
  const [hovered, setHovered] = useState(false);
  const root = useRef<Group>(null);
  const motion = useRef<Group>(null);
  const url = `${config.models.characterDir}/${def.id}.glb`;

  // The walker owns the outer group's transform, so it carries no position/rotation props: a
  // re-render (hover, selection) must never snap a walking character back to its spot.
  const pose = useWalker(root, index, def);
  const { moving } = pose;
  /** Taken off its route and driven by the visitor, and which motion it was told to hold. */
  const possessed = useAppStore((s) => s.possessedId === def.id);
  const poseClip = useAppStore((s) => s.poseClip);
  // Only while it stands still: asked to walk, the walk clip is the honest one and a dance played
  // over a travelling body reads as the child sliding along the pavement.
  const forced = possessed && !moving ? poseClip : null;
  const [clips, setClips] = useState<ClipPresence>({
    welcome: false,
    walk: false,
    seated: false,
    resting: false,
  });
  // A walker keeps walking when clicked: the card opens, but the greeting waits until home.
  // A sitter never greets: the bow and the hop are standing motions that would lift it off
  // its seat.
  const greet = selected && !moving && !clips.seated;
  useCharacterMotion(motion, {
    id: def.id,
    height: def.height,
    stride: def.stride,
    phase: index * 1.27,
    selected: greet,
    hovered,
    hasWelcome: clips.welcome,
    hasWalkClip: clips.walk,
    resting: (!moving && clips.resting) || forced !== null,
    running: pose.running,
  });

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = 'pointer';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);

  return (
    <group
      ref={root}
      name={`character-${def.id}`}
      onClick={(e) => {
        e.stopPropagation();
        // Same threshold the ground plane deselects on: releasing an orbit drag over a
        // character is not a click on it, and flying the camera mid-gesture yanks the view.
        if (e.delta <= 2) select(def.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <group ref={motion}>
        <ModelOrProxy url={url} proxy={<CharacterProxy def={def} hovered={hovered} />}>
          {(gltf) => (
            <ClipProbe
              gltf={gltf}
              def={def}
              index={index}
              greet={greet}
              pose={pose}
              possessed={possessed}
              forced={forced}
              onClips={setClips}
            />
          )}
        </ModelOrProxy>
      </group>
    </group>
  );
}
