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
import { useWalker } from './use-walker';

const NO_OFFSET: [number, number, number] = [0, 0, 0];

/**
 * Standing clips a child falls into when its wander pauses, picked by index so two children
 * who stop together do not stop doing the same thing. These are all authored standing loops:
 * a wall sit would put a child who paused in the middle of the yard back up on the coping.
 */
const PAUSE_CLIPS = ['look-around', 'idle', 'think', 'talk'] as const;

/** The clip a paused walker stands in, or null when the model carries no standing loop at all. */
function pauseClipFor(index: number, animations: AnimationClip[]): string | null {
  const has = (name: string) => animations.some((clip) => clip.name === name);
  const pick = PAUSE_CLIPS[index % PAUSE_CLIPS.length];
  if (pick && has(pick)) return pick;
  return has('idle') ? 'idle' : null;
}

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
}: {
  gltf: LoadedGltf;
  def: CharacterDef;
  index: number;
  greet: boolean;
  moving: boolean;
  resting: boolean;
}) {
  const group = useRef<Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, group);
  // Read straight off the clips during render, so the very first frame already has the pose.
  const rest = restFor(def, gltf.animations);
  // Paused out on a route, the child stands in a standing loop. At home it holds its own rest
  // clip instead, which for a wall sitter is a sit and carries the offset onto the coping —
  // an offset that would hang a child in mid-air if it were applied out in the middle of the yard.
  const paused = resting && !moving;
  const held = paused ? (pauseClipFor(index, gltf.animations) ?? rest.clip) : rest.clip;
  const restClip = moving ? null : held;
  const offset = !moving && !paused && rest.seated && def.rest ? def.rest.offset : NO_OFFSET;
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

  // The walk cycle loops for as long as the character is out walking. Reduced motion keeps
  // it: the character is travelling either way, and frozen legs would just slide.
  useEffect(() => {
    const walk = actions.walk;
    if (!moving || !walk) return;
    walk.reset();
    walk.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    walk.fadeIn(0.2).play();
    return () => {
      walk.fadeOut(0.2);
    };
  }, [moving, actions]);

  // One clip cycle per stride of ground covered, so the feet stay planted at any speed.
  useFrame(() => {
    const walk = actions.walk;
    if (walk) walk.timeScale = poseFor(def.id).speed / def.stride;
  });

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
  moving,
  resting,
  onClips,
}: {
  gltf: LoadedGltf;
  def: CharacterDef;
  index: number;
  greet: boolean;
  moving: boolean;
  resting: boolean;
  onClips: (clips: ClipPresence) => void;
}) {
  useEffect(() => {
    const has = (name: string) => gltf.animations.some((clip) => clip.name === name);
    const rest = restFor(def, gltf.animations);
    onClips({ welcome: has('welcome'), walk: has('walk'), seated: rest.seated, resting: rest.clip !== null });
  }, [gltf.animations, def, onClips]);
  return (
    <LoadedCharacter gltf={gltf} def={def} index={index} greet={greet} moving={moving} resting={resting} />
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
  const { moving, resting } = useWalker(root, index, def);
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
    resting: !moving && clips.resting,
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
              moving={moving}
              resting={resting}
              onClips={setClips}
            />
          )}
        </ModelOrProxy>
      </group>
    </group>
  );
}
