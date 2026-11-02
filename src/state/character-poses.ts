import { Vector3 } from 'three';

/** Where a character is this frame, and whether it is out walking rather than at its spot. */
export interface CharacterPose {
  position: Vector3;
  /** Yaw in radians, the characters' convention: 0 faces +Z. */
  heading: number;
  moving: boolean;
  /**
   * Out on a wander but standing still for a moment. The walk clip stops and a standing idle
   * takes over; the body stays where the pause caught it.
   */
  resting: boolean;
  /** Ground speed, m/s: the walk clip is played at `speed / stride` cycles per second. */
  speed: number;
}

/**
 * Live character poses, written by each walker every frame and read by the camera. Plain
 * module state rather than the store: it changes every frame and must not re-render React.
 */
export const characterPoses = new Map<string, CharacterPose>();

/** The pose object for `id`, created on first use; callers mutate it in place. */
export function poseFor(id: string): CharacterPose {
  let pose = characterPoses.get(id);
  if (!pose) {
    pose = { position: new Vector3(), heading: 0, moving: false, resting: false, speed: 0 };
    characterPoses.set(id, pose);
  }
  return pose;
}
