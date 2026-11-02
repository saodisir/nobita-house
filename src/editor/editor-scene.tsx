import { CameraControls, Grid } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { type DirectionalLight, PerspectiveCamera } from 'three';
import { prefersReducedMotion } from '../utils/reduced-motion';
import { HouseModel, RoomLabels } from './house/house-model';
import { FOOTPRINT, H } from './house/plan';
import type { EditorLevel } from './levels';
import {
  type ControlMode,
  LOOK_AROUND,
  lookTarget,
  ORBIT_MOUSE,
  ORBIT_TOUCH,
  ROOM_FOV,
  ZOOM_RANGE,
} from './look-around';
import type { RoomView } from './room-views';

/** Vertical field of view of the editor camera, shared with the Canvas. */
export const EDITOR_FOV = 38;

/** Outside the house: the controls' own orbit, never from below the ground. */
const ORBIT: ControlMode = {
  minPolarAngle: 0,
  maxPolarAngle: Math.PI * 0.495,
  azimuthRotateSpeed: 1,
  polarRotateSpeed: 1,
  mouseButtons: ORBIT_MOUSE,
  touches: ORBIT_TOUCH,
  dollySpeed: 1,
};

const CENTRE_X = (FOOTPRINT.x0 + FOOTPRINT.x1) / 2;
const CENTRE_Z = (FOOTPRINT.z0 + FOOTPRINT.z1) / 2;

/**
 * The whole house, roofed, from the front-left at 17°: the street gables of home.jpg, and down
 * the garden side the 居間's glass doors on their wooden step. The eye aims at mid-height of the
 * ground storey's roofs, so the upper storey and its ridge stay in frame.
 */
const HOUSE_OFFSET = [-11, 6, 15] as const;
const HOUSE_AIM_Y = 2.6;
/** A plan view looks down at 68°, so the 1.4 m cut walls hide almost nothing behind them. */
const PLAN_OFFSET = [4, 24, 9.8] as const;
export const EDITOR_EYE: [number, number, number] = [
  CENTRE_X + HOUSE_OFFSET[0],
  HOUSE_AIM_Y + HOUSE_OFFSET[1],
  CENTRE_Z + HOUSE_OFFSET[2],
];

/**
 * The sun by bearing and height: from the front-right at 50°. Three.js lights are physical
 * (a face receives albedo × intensity × N·L / π), and at 62° a street-facing wall got 0.26 of
 * the sun against 0.88 on the floors — cream stucco rendered taupe. Lower, and with more sky,
 * walls and floors land within a stop of each other.
 */
const SUN_AZIMUTH = (35 * Math.PI) / 180;
const SUN_ELEVATION = (50 * Math.PI) / 180;
const SUN_DISTANCE = 30;
const SUN: [number, number, number] = [
  CENTRE_X + Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION) * SUN_DISTANCE,
  Math.sin(SUN_ELEVATION) * SUN_DISTANCE,
  CENTRE_Z + Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION) * SUN_DISTANCE,
];
/** Shadow camera half-size: the footprint's half-diagonal and a margin for the eaves to come. */
const SHADOW_HALF = Math.ceil(Math.hypot(FOOTPRINT.x1 - FOOTPRINT.x0, FOOTPRINT.z1 - FOOTPRINT.z0) / 2) + 1;

/**
 * The house alone on a grid of tatami modules: no street, no sky, no time of day. The grid is
 * the one the plan is drawn on, so every wall centre line lands on a line of it. A storey
 * level cuts the house at plan height and swings the camera up over it; a room view stands
 * the camera in a corner of one room, the house whole round it.
 */
export function EditorScene({
  level,
  view,
  labels,
}: {
  level: EditorLevel;
  view: RoomView | null;
  labels: boolean;
}) {
  // A state ref: the framing has to wait until `CameraControls` has mounted.
  const [controls, setControls] = useState<CameraControls | null>(null);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const sun = useRef<DirectionalLight>(null);
  /** The first framing lands at once; every later level change is a move the eye can follow. */
  const framed = useRef(false);
  /** The room the camera stands in: from corner to corner of it is a walk; into it, a cut. */
  const standing = useRef<RoomView['room'] | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // The diorama's camera rig publishes the same probe, so a browser session can read the view.
    const devWindow = window as unknown as { __cam?: unknown };
    devWindow.__cam = { camera, controls, scene, gl };
  }, [camera, controls, scene, gl]);

  useEffect(() => {
    // A light's target is not in the scene graph, so its world matrix never updates on its
    // own: without this the shadow frustum stays centred on the origin, 7 m off the house.
    const light = sun.current;
    if (!light) return;
    light.target.position.set(CENTRE_X, 0, CENTRE_Z);
    light.target.updateMatrixWorld();
  }, []);

  useEffect(() => {
    if (!controls) return;
    const animate = framed.current && !prefersReducedMotion();
    framed.current = true;
    const fov = view ? ROOM_FOV : EDITOR_FOV;
    if (camera instanceof PerspectiveCamera && camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    controls.zoomTo(1, animate);
    if (view) {
      // Flying in from outside would pass through the walls: a room is entered by a cut.
      const walk = animate && standing.current === view.room;
      controls.setLookAt(...view.eye, ...lookTarget(view.eye, view.aim), walk);
      standing.current = view.room;
      return;
    }
    standing.current = null;
    const [ox, oy, oz] = level.cutY === null ? HOUSE_OFFSET : PLAN_OFFSET;
    const aimY = level.cutY === null ? HOUSE_AIM_Y : level.floorY;
    controls.setLookAt(CENTRE_X + ox, aimY + oy, CENTRE_Z + oz, CENTRE_X, aimY, CENTRE_Z, animate);
  }, [camera, controls, level, view]);

  return (
    <>
      <color attach="background" args={['#F1E7D6']} />
      {/* The ground colour is a warm grey, not the tan of the floor plane: walls down a narrow
          hall see mostly this bounce, and tan turned the hallway's mint plaster olive. */}
      <hemisphereLight args={['#FFF6E6', '#D6D0C6', 1.9]} />
      <directionalLight
        ref={sun}
        position={SUN}
        intensity={2.4}
        color="#FFF4E2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-SHADOW_HALF}
        shadow-camera-right={SHADOW_HALF}
        shadow-camera-top={SHADOW_HALF}
        shadow-camera-bottom={-SHADOW_HALF}
        shadow-camera-near={SUN_DISTANCE - 15}
        shadow-camera-far={SUN_DISTANCE + 15}
      />
      <directionalLight position={[CENTRE_X - 12, 9, CENTRE_Z - 8]} intensity={0.7} color="#DCE9FF" />

      <Suspense fallback={null}>
        <HouseModel cutY={view ? null : level.cutY} openDoor={view?.door} paving />
      </Suspense>
      {/* The whole house is roofed now: its rooms are named only where a cut opens them. */}
      {labels && !view && level.cutY !== null && <RoomLabels level={level} />}

      <mesh rotation-x={-Math.PI / 2} position={[CENTRE_X, -0.01, CENTRE_Z]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color="#CFC3AA" roughness={0.95} />
      </mesh>
      <Grid
        position-y={0.002}
        args={[40, 40]}
        cellSize={2 * H}
        cellThickness={0.6}
        cellColor="#C9BCA4"
        sectionSize={10 * H}
        sectionThickness={1.1}
        sectionColor="#A08E72"
        fadeDistance={70}
        infiniteGrid
      />

      <CameraControls
        ref={setControls}
        makeDefault
        minDistance={1}
        maxDistance={70}
        {...(view ? LOOK_AROUND : ORBIT)}
        {...ZOOM_RANGE}
        smoothTime={0.16}
        draggingSmoothTime={0.07}
      />
    </>
  );
}
