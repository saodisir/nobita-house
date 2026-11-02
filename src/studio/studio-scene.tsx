import { CameraControls } from '@react-three/drei';
import { useEffect, useState } from 'react';
import type { CharacterDef } from '../data/characters';
import { prefersReducedMotion } from '../utils/reduced-motion';
import { StudioCharacter } from './studio-character';

/** Vertical field of view of the studio camera. The Canvas and the framing maths share it. */
export const STUDIO_FOV = 32;
/**
 * Framing of the subject inside the viewport. The motion bar covers the bottom fifth of the
 * canvas and the title card the top-left corner, so the character is not centred: it fills
 * `FILL` of the frame height with its mid-height `SUBJECT_CENTRE` down from the top.
 */
const FILL = 0.62;
const SUBJECT_CENTRE = 0.4;
/** Three-quarter view: orbit azimuth and elevation of the framing shot, radians. */
const AZIMUTH = 0.35;
const ELEVATION = 0.12;

/**
 * The stage: paper backdrop, a fixed three-point rig, a soft contact shadow and an orbit
 * framed on the character. Nothing here reads the time of day — a studio has its own light.
 */
export function StudioScene({
  def,
  clipId,
  loop,
  speed,
  spin,
  onClips,
}: {
  def: CharacterDef;
  clipId: string | null;
  loop: boolean;
  speed: number;
  spin: boolean;
  onClips: (characterId: string, names: string[]) => void;
}) {
  // A state ref, not a plain one: the framing runs before `CameraControls` has mounted, and a
  // plain ref would silently skip it.
  const [controls, setControls] = useState<CameraControls | null>(null);

  // Frame on the character's canon height — every GLB is normalised to it in Blender
  // (`prep_character.py`), and Gian is 28 cm taller than Doraemon, so one fixed shot would cut
  // one off at the chin and leave the other tiny.
  useEffect(() => {
    if (!controls) return;
    // Distance at which the character fills FILL of the frame, for this vertical fov, and the
    // aim point that lifts it clear of the motion bar.
    const coverage = def.height / FILL;
    const distance = coverage / (2 * Math.tan((STUDIO_FOV * Math.PI) / 360));
    const aimY = def.height * 0.5 - (0.5 - SUBJECT_CENTRE) * coverage;
    const flat = distance * Math.cos(ELEVATION);
    controls.setLookAt(
      Math.sin(AZIMUTH) * flat,
      aimY + distance * Math.sin(ELEVATION),
      Math.cos(AZIMUTH) * flat,
      0,
      aimY,
      0,
      !prefersReducedMotion(),
    );
  }, [controls, def.height]);

  return (
    <>
      <color attach="background" args={['#F1E7D6']} />
      <hemisphereLight args={['#FFF6E6', '#B5A488', 0.6]} />
      {/*
        Key, fill, rim. The key casts a real shadow map rather than drei's `ContactShadows`:
        that helper overrides every material with a depth material, which loses skinning, so a
        skinned character throws its bind-pose silhouette — here a quantised ±1 m box that
        lands nowhere near the feet.
      */}
      <directionalLight
        position={[2.6, 3.4, 2.8]}
        intensity={2.3}
        color="#FFF4E2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-camera-left={-1.6}
        shadow-camera-right={1.6}
        shadow-camera-top={1.6}
        shadow-camera-bottom={-1.6}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
      />
      <directionalLight position={[-3, 1.9, 1.4]} intensity={0.7} color="#DCE9FF" />
      <directionalLight position={[-0.7, 2.4, -3.2]} intensity={1.2} color="#FFE6C6" />

      <StudioCharacter def={def} clipId={clipId} loop={loop} speed={speed} spin={spin} onClips={onClips} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[2.4, 64]} />
        <meshStandardMaterial color="#E7DCC6" roughness={0.95} />
      </mesh>

      <CameraControls
        ref={setControls}
        makeDefault
        minDistance={1.1}
        maxDistance={6}
        minPolarAngle={Math.PI * 0.08}
        // Never from below the stage floor.
        maxPolarAngle={Math.PI * 0.495}
        smoothTime={0.16}
        draggingSmoothTime={0.07}
        azimuthRotateSpeed={0.7}
        polarRotateSpeed={0.7}
        truckSpeed={0.8}
      />
    </>
  );
}
