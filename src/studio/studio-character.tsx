import { useAnimations } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useRef } from 'react';
import { type Group, LoopOnce, LoopRepeat, Mesh, SkinnedMesh } from 'three';
import { config } from '../config';
import type { CharacterDef } from '../data/characters';
import { type LoadedGltf, ModelOrProxy } from '../scene/model-or-proxy';
import { prefersReducedMotion } from '../utils/reduced-motion';

/** Crossfade between clips, seconds. Long enough to hide a pose jump, short enough to feel direct. */
const FADE = 0.25;
/** Turntable, radians per second: a full turn in about 20 s. */
const SPIN = 0.31;

interface Props {
  def: CharacterDef;
  /** Clip name to play, or null while the model reports none. */
  clipId: string | null;
  /** Repeat the clip for ever, or play it once and hold the last pose. */
  loop: boolean;
  /** Playback rate multiplier from the speed slider. */
  speed: number;
  spin: boolean;
  /** Called once per loaded model with the clips it carries, tagged with whose model it is. */
  onClips: (characterId: string, names: string[]) => void;
}

/**
 * The character on the stage: turntable group, the model (or an empty-state plinth when its
 * GLB has not been built), and the clip player.
 */
export function StudioCharacter({ def, clipId, loop, speed, spin, onClips }: Props) {
  const turntable = useRef<Group>(null);
  const url = `${config.models.characterDir}/${def.id}.glb`;
  // Bound to this character so a report can never be mistaken for the next one's.
  const report = useCallback((names: string[]) => onClips(def.id, names), [def.id, onClips]);

  useFrame((_, delta) => {
    if (spin && turntable.current) turntable.current.rotation.y += delta * SPIN;
  });
  // Stopping the turntable squares the character back up to the camera rather than leaving it
  // frozen mid-turn.
  useEffect(() => {
    if (!spin && turntable.current) turntable.current.rotation.y = 0;
  }, [spin]);

  return (
    <group ref={turntable}>
      <ModelOrProxy url={url} proxy={<MissingModel def={def} />}>
        {(gltf) => (
          <Posed key={def.id} gltf={gltf} clipId={clipId} loop={loop} speed={speed} onClips={report} />
        )}
      </ModelOrProxy>
    </group>
  );
}

/**
 * Shown when `public/models/characters/<id>.glb` is not on the server. Deliberately not the
 * diorama's capsule stand-in: on this page a missing model is the subject, not a silhouette to
 * fill a crowd, and the chrome says so next to it.
 */
function MissingModel({ def }: { def: CharacterDef }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[def.height * 0.22, def.height * 0.24, 0.04, 32]} />
        <meshStandardMaterial color={def.color} roughness={0.8} />
      </mesh>
      <mesh position={[0, def.height / 2, 0]}>
        <boxGeometry args={[def.height * 0.02, def.height, def.height * 0.02]} />
        <meshStandardMaterial color="#9C8F79" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Posed({
  gltf,
  clipId,
  loop,
  speed,
  onClips,
}: {
  gltf: LoadedGltf;
  clipId: string | null;
  loop: boolean;
  speed: number;
  onClips: (names: string[]) => void;
}) {
  const group = useRef<Group>(null);
  const { actions, mixer } = useAnimations(gltf.animations, group);

  // Rodin exports arrive without shadow flags, and skinned bounds move with the clip.
  useEffect(() => {
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.castShadow = true;
      node.receiveShadow = true;
      if (node instanceof SkinnedMesh) node.frustumCulled = false;
    });
  }, [gltf.scene]);

  useEffect(() => {
    onClips(gltf.animations.map((clip) => clip.name));
  }, [gltf.animations, onClips]);

  useEffect(() => {
    mixer.timeScale = speed;
  }, [mixer, speed]);

  useEffect(() => {
    if (!clipId) return;
    const action = actions[clipId];
    if (!action) return;
    action.reset();
    action.fadeIn(FADE).play();
    // Reduced motion: show the clip's first frame and stay there, so the picker still answers
    // "what does this motion look like" without any movement on screen.
    if (prefersReducedMotion()) {
      action.time = 0;
      action.paused = true;
    }
    // The outgoing action fades while the next one fades in — that overlap is the crossfade.
    return () => {
      action.fadeOut(FADE);
    };
  }, [actions, clipId]);

  // Declared after the start effect, so on a new pick it runs second and sets that clip's mode.
  // Toggled mid-clip, it takes effect at the end of the current cycle: a looping clip finishes
  // its pass and holds the last pose, and a one-shot that has already stopped plays again.
  useEffect(() => {
    const action = clipId ? actions[clipId] : null;
    if (!action) return;
    action.setLoop(loop ? LoopRepeat : LoopOnce, Number.POSITIVE_INFINITY);
    // A one-shot holds its last pose instead of snapping back to the rest pose.
    action.clampWhenFinished = !loop;
    // Three pauses a clamped one-shot when it ends; restart it rather than looping a frozen pose.
    if (loop && action.paused && !prefersReducedMotion()) action.reset().play();
  }, [actions, clipId, loop]);

  return (
    <group ref={group}>
      <primitive object={gltf.scene} />
    </group>
  );
}
