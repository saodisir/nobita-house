import { CameraControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { config } from '../config';
import { characterById } from '../data/characters';
import { HOUSE_FOOTPRINT } from '../data/house-site';
import { allLots, layout } from '../data/scene';
import { type ControlMode, LOOK_AROUND, ORBIT_MOUSE, ORBIT_TOUCH, ZOOM_RANGE } from '../editor/look-around';
import { characterPoses } from '../state/character-poses';
import { useAppStore } from '../state/store';
import { prefersReducedMotion, useReducedMotionRef } from '../utils/reduced-motion';
import { useInteriorCamera } from './use-interior-camera';

/** Scratch vectors for the target clamp, the eye check and the follow point; no per-frame allocation. */
const scratchTarget = new Vector3();
const scratchEye = new Vector3();
const follow = new Vector3();

/** Time constant, seconds, of the orbit target easing after a walker: close, never jerky. */
const FOLLOW_TIME = 0.2;

/**
 * Where the aerial stands: over the house, looking down at 50°, from the street side.
 *
 * The orbit cannot find this by itself. A drag raises the eye but leaves the target where it was —
 * on the pavement outside the gate — so the visitor ends up staring straight down at the sidewalk,
 * which is what "I lifted the roof and saw nothing" actually was. The aerial has to move the target
 * onto the house as well, and only a scripted move does both.
 *
 * It stands on the same line the default framing does — the gate's axis — and only climbs. The
 * framing is the opened house, not the shut one: it takes in the ground floor where it stands and
 * the upper floor standing beside it, so both storeys are in one shot. `AERIAL_SHIFT` is the
 * westward bias that buys the upper floor its room, not a second basis: the eye stays on the axis.
 */
const AERIAL_EYE_HEIGHT = 17.5;
const AERIAL_BACK = 12.5;
const AERIAL_TARGET_Y = 2.6;
const AERIAL_SHIFT = -1.2;

/** The gate's axis. The gate, the path stones, the front door and both framings stand on it. */
const AXIS_X = layout.wall.gateX;

/**
 * The street: orbit, dolly and truck round the block, never from below the ground.
 *
 * The speeds are set from what a drag actually does rather than by taste: at 0.7 a 150 px drag
 * turned the view 44°, which is a third of the way round the house from a flick of the wrist,
 * and the only way to aim was to drag, overshoot, and drag back. At 0.5 the same drag is 31°.
 * The wheel was worse: at 1 one notch took a quarter off the distance, so a two-finger scroll
 * on a trackpad pinned the eye at `minDistance` and it read as "the camera is stuck". At 0.35
 * a notch takes about a fifth off, fine enough to aim with and still seven notches from the
 * default framing to the gate.
 */
const STREET: ControlMode = {
  minPolarAngle: config.camera.minPolarAngle,
  maxPolarAngle: config.camera.maxPolarAngle,
  azimuthRotateSpeed: 0.5,
  polarRotateSpeed: 0.5,
  mouseButtons: ORBIT_MOUSE,
  touches: ORBIT_TOUCH,
  dollySpeed: 0.35,
};

/** Wraps an angle difference into (−π, π]: the short way round. */
const wrapPi = (a: number) => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

const lots = allLots();
/** True when (x, z) is inside a lot: an eye there sits behind its wall, looking at the wall. */
function inLot(x: number, z: number) {
  for (const r of lots) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
  return false;
}

/**
 * Orbit azimuth that puts the eye over the carriageway nearest (x, z), so a walker is seen
 * from the street and not through a lot wall. Same convention as the characters' yaw: the
 * eye sits toward (sin θ, cos θ) from the target.
 */
function streetward(x: number, z: number) {
  const frontMid = layout.road.startZ + layout.road.depth / 2;
  const sideMid = (layout.streets.side.startX + layout.streets.side.endX) / 2;
  if (Math.abs(z - frontMid) <= Math.abs(x - sideMid)) return z < frontMid ? 0 : Math.PI;
  return x < sideMid ? Math.PI / 2 : -Math.PI / 2;
}

/**
 * Orbit with a block-bounded target; flies to the selected character, follows it while it
 * walks, and flies back on reset.
 */
export function CameraRig() {
  const controls = useRef<CameraControls>(null);
  const reduced = useReducedMotionRef();
  /** Whether last frame tracked a walker; the follow point is re-seeded when tracking starts. */
  const tracking = useRef(false);
  /**
   * The visitor has the camera in hand. A child selected out on a walk is followed, which means
   * the target walks off with it — and a drag that is immediately overruled by the next frame's
   * `moveTo` reads as "the mouse does not work". One touch hands the camera over and it stays
   * handed over until another child is picked.
   */
  const grabbed = useRef(false);
  /** Street the tracked walker was last nearest, and whether a swing to its side is due. */
  const street = useRef<number | null>(null);
  const swingDue = useRef(false);
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const possessedId = useAppStore((s) => s.possessedId);
  const driveView = useAppStore((s) => s.driveView);
  const resetToken = useAppStore((s) => s.resetToken);
  const autoRotate = useAppStore((s) => s.autoRotate);
  const aerial = useAppStore((s) => s.aerialView);
  /** Where the orbit was before the aerial took it, so leaving puts the visitor back there. */
  const beforeAerial = useRef<{ eye: Vector3; target: Vector3 } | null>(null);
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const inRoom = activeRoomId !== null;
  // Free walk owns the camera outright; the orbit must stop writing position and look-at.
  const freeWalk = useAppStore((s) => s.freeWalk);
  useInteriorCamera(controls);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { __cam: unknown }).__cam = { camera, controls, scene, gl };
  }, [camera, scene, gl]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const { position, target, fov, groupHalfWidth } = config.camera;
    // Portrait phones see far less width than the desktop framing assumes: back off along the
    // same line of sight until the whole group fits across the screen.
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);
    const eye = scratchEye.set(...position);
    const look = scratchTarget.set(...target);
    const fitDistance = groupHalfWidth / (Math.tan(((fov / 2) * Math.PI) / 180) * aspect);
    const distance = Math.max(eye.distanceTo(look), fitDistance);
    eye.sub(look).setLength(distance).add(look);
    c.setLookAt(eye.x, eye.y, eye.z, look.x, look.y, look.z, resetToken > 0 && !prefersReducedMotion());
  }, [resetToken]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const animate = !prefersReducedMotion();
    if (aerial) {
      // Saved on the way in, not on every frame: a drag during the aerial is the visitor's own
      // doing, and leaving should still return them where they were before they pressed it.
      if (!beforeAerial.current) {
        beforeAerial.current = { eye: c.getPosition(new Vector3()), target: c.getTarget(new Vector3()) };
      }
      const { z0, z1 } = HOUSE_FOOTPRINT;
      const cx = AXIS_X + AERIAL_SHIFT;
      const cz = (z0 + z1) / 2;
      c.setLookAt(cx, AERIAL_EYE_HEIGHT, cz + AERIAL_BACK, cx, AERIAL_TARGET_Y, cz, animate);
      return;
    }
    const back = beforeAerial.current;
    if (!back) return;
    beforeAerial.current = null;
    c.setLookAt(back.eye.x, back.eye.y, back.eye.z, back.target.x, back.target.y, back.target.z, animate);
  }, [aerial]);

  useEffect(() => {
    const c = controls.current;
    const def = selectedId ? characterById(selectedId) : undefined;
    // A character flight from inside the room would fly the camera out through a wall.
    if (!c || inRoom) return;
    grabbed.current = false;
    if (!def) {
      c.setFocalOffset(0, 0, 0, !prefersReducedMotion());
      return;
    }
    // Frame the character where it is now: out walking, that is not its spot.
    const pose = characterPoses.get(def.id);
    const live = pose?.position;
    // At home a resting pose can lift the body off its sidewalk anchor, onto the wall: frame the
    // body, not the pavement under it.
    const rest = pose?.moving ? undefined : def.rest?.offset;
    const x = (live?.x ?? def.position[0]) + (rest?.[0] ?? 0);
    const z = (live?.z ?? def.position[2]) + (rest?.[2] ?? 0);
    // Frame the whole figure: eye height at 60% of the body, standing back ~2.9 body-heights,
    // a little to the right. Out on the walk that spot can fall inside a lot, behind its
    // wall; then look from the street instead, at the same distance.
    const eye = (rest?.[1] ?? 0) + def.height * 0.6;
    const dist = def.height * 2.9;
    const reach = Math.hypot(dist * 0.28, dist);
    let azimuth = Math.atan2(0.28, 1);
    if (inLot(x + reach * Math.sin(azimuth), z + reach * Math.cos(azimuth))) azimuth = streetward(x, z);
    // On desktop the info card covers the right third, so shift the subject left of centre.
    const offsetX = window.innerWidth >= 1024 ? def.height * 0.55 : 0;
    c.setFocalOffset(offsetX, 0, 0, !prefersReducedMotion());
    c.setLookAt(
      x + reach * Math.sin(azimuth),
      eye + def.height * 0.28,
      z + reach * Math.cos(azimuth),
      x,
      eye,
      z,
      !prefersReducedMotion(),
    );
    // `view` is a real dependency: leaving the room clears the focal offset the street uses.
    // `enterRoom` clears the selection, so coming back never re-fires a character flight.
  }, [selectedId, inRoom]);

  /**
   * Taking hold of a child pulls the lens in on it, once. The bearing is the visitor's own: the
   * eye stays where they were already looking from, and only the distance and the subject change.
   *
   * Swinging round to sit behind the child was the first attempt and it put the camera inside the
   * garden wall — every child at rest faces the street, so "behind" is the house's side of it.
   * Nothing needs forcing anyway: the keys are read against the view, so the child turns to walk
   * away from wherever the camera is.
   */
  useEffect(() => {
    const c = controls.current;
    const def = possessedId ? characterById(possessedId) : undefined;
    // First person owns the eye. Re-running on a view change is what puts the lens behind the
    // child when V is pressed mid-walk; a selected (not driven) child still gets its fly-in.
    if (!c || !def || driveView !== 'third' || !useAppStore.getState().freeWalk) return;
    tracking.current = false;
    grabbed.current = false;
    const pose = characterPoses.get(def.id);
    const x = pose?.position.x ?? def.position[0];
    const y = pose?.position.y ?? def.position[1];
    const z = pose?.position.z ?? def.position[2];
    const dist = def.height * 3.4;
    let azimuth = c.azimuthAngle;
    if (inLot(x + dist * Math.sin(azimuth), z + dist * Math.cos(azimuth))) azimuth = streetward(x, z);
    c.setFocalOffset(0, 0, 0, false);
    c.setLookAt(
      x + dist * Math.sin(azimuth),
      y + def.height * 1.15,
      z + dist * Math.cos(azimuth),
      x,
      y + def.height * 0.62,
      z,
      !prefersReducedMotion(),
    );
  }, [possessedId, driveView]);

  useEffect(() => {
    let raf = 0;
    const spin = () => {
      controls.current?.rotate(0.0025, 0, false);
      raf = requestAnimationFrame(spin);
    };
    if (autoRotate) raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const {
      selectedCharacterId: id,
      autoRotate: spinning,
      possessedId: held,
      freeWalk: driving,
      driveView: view,
    } = useAppStore.getState();

    // First person writes the camera at priority 1. Following here would only drag the orbit's
    // internal target away from the place it will be needed when the lens comes back.
    if (driving && view !== 'third') {
      tracking.current = false;
      return;
    }

    // Driving a child: the target follows it every frame, whatever the visitor is doing with the
    // mouse. `moveTo` shifts target and eye together, so dragging an orbit angle still holds.
    const holding = held ? characterPoses.get(held) : undefined;
    const holdingDef = held ? characterById(held) : undefined;
    if (holding && holdingDef) {
      if (!tracking.current) {
        c.getTarget(follow, false);
        tracking.current = true;
      }
      const k = reduced.current ? 1 : 1 - Math.exp(-delta / FOLLOW_TIME);
      follow.x += (holding.position.x - follow.x) * k;
      follow.y += (holding.position.y + holdingDef.height * 0.7 - follow.y) * k;
      follow.z += (holding.position.z - follow.z) * k;
      c.moveTo(follow.x, follow.y, follow.z, false);
      return;
    }

    const pose = id ? characterPoses.get(id) : undefined;
    const def = id ? characterById(id) : undefined;
    if (grabbed.current || !pose?.moving || !def) {
      tracking.current = false;
      return;
    }

    // Track the selected walker. The follow point eases from wherever the target is drawn
    // now, and `moveTo` without a transition shifts target and eye together: the user's orbit
    // angle and distance survive, dragging keeps working, and the fly-in's orbit animation
    // runs on untouched. (A transitioned `moveTo` would queue a rest listener every frame.)
    if (!tracking.current) {
      c.getTarget(follow, false);
      tracking.current = true;
      street.current = null;
    }
    const k = reduced.current ? 1 : 1 - Math.exp(-delta / FOLLOW_TIME);
    follow.x += (pose.position.x - follow.x) * k;
    follow.y += (def.height * 0.6 - follow.y) * k;
    follow.z += (pose.position.z - follow.z) * k;
    c.moveTo(follow.x, follow.y, follow.z, false);

    // Turning onto another street can leave the eye behind a lot wall; swing it round to the
    // street side once, the first time that happens. A drag in the meantime means the user
    // chose that angle, and Auto-rotate owns the azimuth, so neither gets overridden.
    const side = streetward(pose.position.x, pose.position.z);
    if (side !== street.current) {
      street.current = side;
      swingDue.current = true;
    }
    if (c.currentAction !== 0 || spinning) swingDue.current = false;
    const eye = c.getPosition(scratchEye);
    if (swingDue.current && inLot(eye.x, eye.z)) {
      swingDue.current = false;
      c.rotateAzimuthTo(c.azimuthAngle + wrapPi(side - c.azimuthAngle), !reduced.current);
    }
  });

  return (
    <CameraControls
      ref={controls}
      enabled={!freeWalk || driveView === 'third'}
      minDistance={config.camera.minDistance}
      maxDistance={config.camera.maxDistance}
      // Inside, the eye stands where the visitor chose and only turns: see `LOOK_AROUND`.
      {...(inRoom ? LOOK_AROUND : STREET)}
      {...ZOOM_RANGE}
      // Damping is input latency: at the old 0.35/0.28 the camera took 1.16 s to settle and
      // had covered 6% of a rotation after 50 ms, which reads as lag even at a solid 60 fps.
      // Dragging stays nearly 1:1; the longer smoothTime only shapes the scripted fly-to.
      smoothTime={0.16}
      truckSpeed={0.9}
      draggingSmoothTime={0.07}
      // The wheel dollies toward whatever is under the cursor rather than toward the middle of
      // the frame, so a dolly reads as "come closer to that" instead of "the whole block gets
      // bigger". The canvas is the whole window, so the controls need no viewport setting.
      dollyToCursor
      // Any grab, wheel or drag hands the camera over: see `grabbed`.
      onControlStart={() => {
        grabbed.current = true;
      }}
      onChange={() => {
        // Keep the orbit target inside the block so the user cannot pan away from the diorama.
        // Inside a room the target is a hair in front of the eye, which stands where it was put.
        const c = controls.current;
        if (!c || useAppStore.getState().activeRoomId !== null) return;
        // Reuse one scratch vector: this fires every frame during a drag. The box already
        // takes in the whole walk (`walk-routes.test.ts` holds it to that), so a tracked
        // walker is never clamped.
        const t = c.getTarget(scratchTarget);
        const { x0, x1, z0, z1 } = config.targetBounds;
        const cx = Math.max(x0, Math.min(x1, t.x));
        const cz = Math.max(z0, Math.min(z1, t.z));
        const cy = Math.max(0.3, Math.min(8, t.y));
        if (cx !== t.x || cz !== t.z || cy !== t.y) c.setTarget(cx, cy, cz, false);
      }}
    />
  );
}
