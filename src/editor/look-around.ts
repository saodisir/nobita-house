import { CameraControlsImpl } from '@react-three/drei';

/**
 * How the camera behaves standing in a room, on `/editor` and in the diorama alike: the eye
 * stays where the visitor stands, a drag turns the head, the wheel and a pinch zoom the lens.
 * Nothing moves the eye, so nothing can carry it through a wall — the reason the house's
 * rooms are seen this way and not orbited.
 */

/** Standing in a room: about 90° across a landscape window, an interior photographer's lens. */
export const ROOM_FOV = 62;
/**
 * In a room the controls orbit a point this close in front of the eye, so a drag turns the
 * head where it stands instead of swinging the camera round through the walls.
 */
const LOOK_AHEAD = 1e-4;
/** A full-height drag turns the head half round; the orbit's full turn is too quick up close. */
const LOOK_SPEED = 0.5;

const { ACTION } = CameraControlsImpl;
/** Outside: the controls' own orbit, dolly and truck. */
export const ORBIT_MOUSE = {
  left: ACTION.ROTATE,
  middle: ACTION.DOLLY,
  right: ACTION.TRUCK,
  wheel: ACTION.DOLLY,
};
export const ORBIT_TOUCH = {
  one: ACTION.TOUCH_ROTATE,
  two: ACTION.TOUCH_DOLLY_TRUCK,
  three: ACTION.TOUCH_TRUCK,
};

/**
 * `CameraControls` settings that differ between standing in a room and orbiting outside. Each
 * page pairs `LOOK_AROUND` with an orbit mode setting the same keys: R3F skips a prop that turns
 * `undefined`, so a key set only in one mode would stay set after the visitor switches.
 */
export interface ControlMode {
  minPolarAngle: number;
  maxPolarAngle: number;
  azimuthRotateSpeed: number;
  polarRotateSpeed: number;
  mouseButtons: CameraControlsImpl['mouseButtons'];
  touches: CameraControlsImpl['touches'];
  dollySpeed: number;
}

export const LOOK_AROUND: ControlMode = {
  // From the floor to the ceiling, never over the top.
  minPolarAngle: Math.PI * 0.1,
  maxPolarAngle: Math.PI * 0.9,
  azimuthRotateSpeed: LOOK_SPEED,
  polarRotateSpeed: LOOK_SPEED,
  mouseButtons: { left: ACTION.ROTATE, middle: ACTION.NONE, right: ACTION.NONE, wheel: ACTION.ZOOM },
  touches: { one: ACTION.TOUCH_ROTATE, two: ACTION.TOUCH_ZOOM, three: ACTION.NONE },
  // One wheel notch zooms ×1.5 at the controls' own speed: three notches from wide to tight.
  // A third of it steps ×1.15.
  dollySpeed: 0.35,
};

/** The lens zoom a room allows; outside nothing zooms, the wheel dollies. */
export const ZOOM_RANGE = { minZoom: 0.75, maxZoom: 3 };

/** The point the controls orbit for an eye at `eye` looking toward `toward`. */
export const lookTarget = (
  eye: readonly [number, number, number],
  toward: readonly [number, number, number],
): [number, number, number] => [
  eye[0] + (toward[0] - eye[0]) * LOOK_AHEAD,
  eye[1] + (toward[1] - eye[1]) * LOOK_AHEAD,
  eye[2] + (toward[2] - eye[2]) * LOOK_AHEAD,
];
