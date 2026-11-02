import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { config } from '../config';
import { rectToWorld } from '../data/house-site';
import { layout } from '../data/scene';
import { LEVEL, type Rect, ROOMS, STAIR_WALL, STAIRS, STOREYS, WALLS } from '../editor/house/plan';
import { useAppStore } from '../state/store';

/**
 * Walking the lot on your own feet.
 *
 * Everything else in the app looks at the house: the orbit swings round it from the street, and
 * standing in a room pins the eye to one of a dozen authored places. Neither lets you walk up the
 * path, through the front door and down the hall, which is the one thing a house you can go into
 * is for. This adds that, and nothing else.
 *
 * It is deliberately a separate controller rather than a mode on the orbit: `CameraRig` disables
 * its `CameraControls` while this is on, and this writes the camera at frame priority 1, so the
 * orbit's easing can never pull the eye out of a wall.
 *
 * Collision is axis-aligned boxes read from the same `plan.ts` that builds the walls, so a wall
 * that moves in the plan moves here too. Openings whose sill sits at floor level are passable;
 * windows are not. The lot's boundary wall comes from `layout`, split around the gate.
 *
 * Height is a single field rather than two storeys with a teleport between them: the flight is
 * part of it, read from `STAIRS`, so walking to the back of the hall and up twelve treads lands
 * you on the landing with nothing switching underneath. Storey is then a consequence of the
 * height under your feet, not a mode — which is also what makes the stairwell void a wall: on the
 * upper storey there is no floor over the well, and no floor is not a place you can stand.
 */

const EYE = 1.62;
/**
 * Half the walker's shoulders: enough that you stop at a wall instead of clipping through it.
 *
 * 0.19 rather than a real 0.26, because the flight is only 0.78 m between its wall and its knee
 * wall and a wider body would not fit up its own staircase. It also keeps the lens, at 0.1 m near,
 * clear of a 0.15 m wall's face when the visitor puts their nose against the plaster.
 */
const RADIUS = 0.19;
const WALK_SPEED = 2.1;
const RUN_SPEED = 4.0;
const LOOK_SPEED = 0.0022;
const PITCH_LIMIT = Math.PI * 0.47;
/**
 * The orbit is framed like a long lens (38°); on foot that is a telescope, and standing 1.5 m from
 * the front door fills the screen with the door. A walking eye wants 70°.
 */
const WALK_FOV = 70;
/**
 * The tallest rise the walker takes in stride. Anything taller is a ledge, and a ledge is a wall:
 * this is what stops the flight being walked off sideways halfway up, and what refuses the
 * stairwell void at the top.
 */
const STEP_MAX = 0.42;

const LOT_HALF_W = layout.lot.width / 2;
const LOT_FRONT = layout.wall.frontZ;
const LOT_BACK = LOT_FRONT - layout.lot.depth;
const WALL_T = layout.lot.wallThickness;

/**
 * Solid wall spans of one storey, in the plan's frame, floor-level openings cut out.
 *
 * Storey by storey, because the two storeys are different plans: an upstairs room sits over a
 * downstairs one with its own walls across it, and a collider borrowed from below stops the walker
 * dead in a landing that has no wall there at all.
 *
 * A wall standing on the same line on both floors takes the thicker of the two. The plan draws the
 * stairwell's flank 0.12 downstairs and 0.15 above; left alone, a visitor who walked up hugging it
 * would be legal on the ground storey and 5 mm inside a wall at the top of the same flight, and
 * the flight is too narrow to step around the difference.
 */
const WALL_THICKNESS = new Map<string, number>();
for (const wall of WALLS) {
  const key = `${wall.axis}:${wall.at}`;
  WALL_THICKNESS.set(key, Math.max(WALL_THICKNESS.get(key) ?? 0, wall.thickness));
}

function wallBoxes(storey: 'ground' | 'upper'): Rect[] {
  const boxes: Rect[] = [];
  // A sill at the storey's own floor is a doorway; the first metre of wall above it is not.
  const threshold = STOREYS[storey].floor + 0.4;
  for (const wall of WALLS) {
    if (wall.storey !== storey) continue;
    const half = (WALL_THICKNESS.get(`${wall.axis}:${wall.at}`) ?? wall.thickness) / 2;
    const push = (a: number, b: number) => {
      if (b - a < 0.02) return;
      boxes.push(
        wall.axis === 'x'
          ? { x0: a, x1: b, z0: wall.at - half, z1: wall.at + half }
          : { x0: wall.at - half, x1: wall.at + half, z0: a, z1: b },
      );
    };
    const passable = wall.openings.filter((o) => o.sill <= threshold).sort((a, b) => a.from - b.from);
    let cursor = wall.from;
    for (const opening of passable) {
      push(cursor, opening.from);
      cursor = Math.max(cursor, opening.to);
    }
    push(cursor, wall.to);
  }
  return boxes.map(rectToWorld);
}

/** The boundary wall round the lot, with the gate left open. */
function lotBoxes(): Rect[] {
  const gate = layout.wall.gateWidth / 2;
  const gateX = layout.wall.gateX;
  const t = WALL_T / 2;
  return [
    { x0: -LOT_HALF_W, x1: gateX - gate, z0: LOT_FRONT - t, z1: LOT_FRONT + t },
    { x0: gateX + gate, x1: LOT_HALF_W, z0: LOT_FRONT - t, z1: LOT_FRONT + t },
    { x0: -LOT_HALF_W, x1: LOT_HALF_W, z0: LOT_BACK - t, z1: LOT_BACK + t },
    { x0: -LOT_HALF_W - t, x1: -LOT_HALF_W + t, z0: LOT_BACK, z1: LOT_FRONT },
    { x0: LOT_HALF_W - t, x1: LOT_HALF_W + t, z0: LOT_BACK, z1: LOT_FRONT },
  ];
}

interface FloorRect extends Rect {
  y: number;
}

/** Every finished floor of a storey, in world metres, for stepping up onto it. */
function floorRects(storey: 'ground' | 'upper'): FloorRect[] {
  return ROOMS.filter((room) => room.storey === storey)
    .filter((room) => !room.storage)
    .flatMap((room) => room.rects.map((r) => ({ ...rectToWorld(r), y: room.floorY })));
}

const GROUND_FLOORS = floorRects('ground');
const UPPER_FLOORS = floorRects('upper');

/**
 * The flight itself, in world metres, from `z0` at the head to `z1` at the foot.
 *
 * Twelve risers of 0.225 over 0.152 goings — the steepest a Japanese house stair is allowed to
 * be, and the reason the plan puts it against the wall. It is not a `Wall` and was never in the
 * colliders: a wall you cannot pass is the opposite of a stair you can.
 */
const STAIR = rectToWorld({ x0: STAIRS.x0, x1: STAIRS.x1, z0: STAIRS.head, z1: STAIRS.foot });
const STAIR_GOING = (STAIRS.foot - STAIRS.head) / STAIRS.risers;
const STAIR_RISE = (STAIRS.toY - STAIRS.fromY) / STAIRS.risers;

/** The knee wall on the flight's hall side, carried as a solid: it is a wall from the waist up. */
const STAIR_KNEE = rectToWorld({ x0: STAIR_WALL.x0, x1: STAIR_WALL.x1, z0: STAIRS.head, z1: STAIRS.foot });

const GROUND_COLLIDERS = [...wallBoxes('ground'), ...lotBoxes(), STAIR_KNEE];
const UPPER_COLLIDERS = [...wallBoxes('upper'), STAIR_KNEE];

/** Top of the tread under (x, z), or null when off the flight. The twelfth tread is the floor. */
function treadTop(x: number, z: number): number | null {
  if (x < STAIR.x0 || x > STAIR.x1 || z < STAIR.z0 || z > STAIR.z1) return null;
  const back = STAIR.z1 - z;
  const step = Math.min(STAIRS.risers - 1, Math.max(0, Math.floor(back / STAIR_GOING)));
  return STAIRS.fromY + (step + 1) * STAIR_RISE;
}

/**
 * What the walker stands on at (x, z): a tread, a finished floor, the lot — or nothing at all,
 * which is the stairwell void and the only honest answer on the upper storey where a floor ends.
 */
function surfaceAt(x: number, z: number, storey: 'ground' | 'upper'): number | null {
  const tread = treadTop(x, z);
  if (tread !== null) return tread;
  const floors = storey === 'upper' ? UPPER_FLOORS : GROUND_FLOORS;
  let top: number | null = null;
  for (const f of floors) {
    if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1 && (top === null || f.y > top)) top = f.y;
  }
  if (top !== null) return top;
  return storey === 'upper' ? null : 0;
}

/** Whether a walker of `RADIUS` at (x, z) overlaps a wall of the storey they are standing on. */
function blocked(x: number, z: number, storey: 'ground' | 'upper'): boolean {
  const colliders = storey === 'upper' ? UPPER_COLLIDERS : GROUND_COLLIDERS;
  for (const b of colliders) {
    if (x > b.x0 - RADIUS && x < b.x1 + RADIUS && z > b.z0 - RADIUS && z < b.z1 + RADIUS) return true;
  }
  return false;
}

/** Where the walker is, for the interior lights to follow. Mutated per frame; never a render. */
export const walkerPose = { x: 0, y: 0, z: 0, inside: false };

export function FreeWalk() {
  const active = useAppStore((s) => s.freeWalk);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const position = useRef<{ x: number; z: number }>({ x: layout.wall.gateX, z: LOT_FRONT + 1.4 });
  const yaw = useRef(0);
  const pitch = useRef(0);
  const eye = useRef(EYE);
  /** What the walker is standing on right now. Storey, stairs and steps all come out of this. */
  const ground = useRef(0);
  const keys = useRef(new Set<string>());

  useEffect(() => {
    // Same dev hook the orbit exposes: enough to read the walker's feet from a screenshot script.
    if (import.meta.env.DEV)
      (window as unknown as { __walker: unknown }).__walker = {
        pose: walkerPose,
        ground,
        position,
        yaw,
        pitch,
        probe: (x: number, z: number) => {
          const storey = ground.current >= LEVEL.top ? ('upper' as const) : ('ground' as const);
          return { surface: surfaceAt(x, z, storey), blocked: blocked(x, z, storey), storey };
        },
      };
  }, []);

  useEffect(() => {
    if (!active) return;
    ground.current = surfaceAt(position.current.x, position.current.z, 'ground') ?? 0;
    eye.current = ground.current + EYE;
    // Looking down the path at the front door: -z is the house, which is yaw 0 for a three camera.
    yaw.current = 0;
    pitch.current = 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);
    camera.position.set(position.current.x, eye.current, position.current.z);
    const perspective = camera as typeof camera & { fov: number; updateProjectionMatrix: () => void };
    perspective.fov = WALK_FOV;
    perspective.updateProjectionMatrix();

    const canvas = gl.domElement;
    let dragging = false;
    let lastPointer = { x: 0, y: 0 };
    const lock = () => {
      const request = canvas.requestPointerLock?.();
      if (request && typeof request.catch === 'function') request.catch(() => {});
    };
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) {
        yaw.current -= e.movementX * LOOK_SPEED;
        pitch.current = Math.max(
          -PITCH_LIMIT,
          Math.min(PITCH_LIMIT, pitch.current - e.movementY * LOOK_SPEED),
        );
        return;
      }
      // Pointer lock can be refused (embedded frames, some browsers). Dragging still has to turn
      // the head, so the same handler falls back to client coordinates.
      if (!dragging) return;
      yaw.current -= (e.clientX - lastPointer.x) * LOOK_SPEED;
      pitch.current = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, pitch.current - (e.clientY - lastPointer.y) * LOOK_SPEED),
      );
      lastPointer = { x: e.clientX, y: e.clientY };
    };
    const onDown = (e: MouseEvent) => {
      dragging = true;
      lastPointer = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => {
      dragging = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current.add(e.code);
      if (e.code === 'Escape') {
        // The first Esc is the browser dropping the pointer lock; a second one, already free,
        // means "let me out of here".
        if (document.pointerLockElement !== canvas) useAppStore.getState().toggleFreeWalk();
        return;
      }
      if (e.code === 'KeyE') {
        // The stair now does this properly, on foot, at its own pace. `E` stays as the shortcut
        // for a visitor who has seen the flight once: downstairs lands in the genkan, upstairs in
        // Nobita's room, each a step inside its street-side wall so the view opens into the room.
        const goingUp = ground.current < LEVEL.top;
        const room = ROOMS.find((r) => r.id === (goingUp ? 'nobita' : 'genkan'));
        const first = room?.rects[0];
        if (room && first) {
          const rect = rectToWorld(first);
          position.current = { x: (rect.x0 + rect.x1) / 2, z: rect.z1 - 0.9 };
          ground.current = room.floorY;
          eye.current = room.floorY + EYE;
        }
        pitch.current = 0;
        yaw.current = 0;
      }
      if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)
      ) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const onBlur = () => keys.current.clear();

    canvas.addEventListener('click', lock);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      canvas.removeEventListener('click', lock);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.current.clear();
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
      // Put the lens back: the orbit's framing assumes its own field of view.
      const perspective = camera as typeof camera & { fov: number; updateProjectionMatrix: () => void };
      perspective.fov = config.camera.fov;
      perspective.updateProjectionMatrix();
      // Hand the camera back to the orbit on the street, not wherever the walk stopped: coming
      // out of walk mode with the orbit still aimed at a wall reads as a broken camera.
      useAppStore.getState().resetView();
    };
  }, [active, camera, gl]);

  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.05);
    const held = keys.current;
    // Top of the ground storey's walls: above it the upstairs plan answers for walls, floor
    // and the well. The flight is the only place this changes underfoot, and it changes at the
    // top tread, where the last riser has already put the walker on the upper floor.
    const storey: 'ground' | 'upper' = ground.current >= LEVEL.top ? 'upper' : 'ground';
    // 0.225 of rise every 0.152 of going is steeper than a stride; at hall speed the walker would
    // clear the whole flight in under a second. Halve the pace on the treads and it reads as stairs.
    const onStairs = treadTop(position.current.x, position.current.z) !== null;
    const speed =
      (held.has('ShiftLeft') || held.has('ShiftRight') ? RUN_SPEED : WALK_SPEED) * (onStairs ? 0.5 : 1) * dt;

    /** Where the walker would stand if they moved there, or null if they could not stand there. */
    const standAt = (x: number, z: number): number | null => {
      if (blocked(x, z, storey)) return null;
      const surface = surfaceAt(x, z, storey);
      if (surface === null) return null;
      return Math.abs(surface - ground.current) > STEP_MAX ? null : surface;
    };

    // Camera-relative on the ground plane: W always goes where you are looking.
    const forward =
      (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    const strafe =
      (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) -
      (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
    if (forward || strafe) {
      const len = Math.hypot(forward, strafe) || 1;
      const sin = Math.sin(yaw.current);
      const cos = Math.cos(yaw.current);
      const dx = ((forward / len) * -sin + (strafe / len) * cos) * speed;
      const dz = ((forward / len) * -cos + (strafe / len) * -sin) * speed;
      const p = position.current;
      // Axis by axis, so sliding along a wall still works when one component is blocked.
      const stepX = standAt(p.x + dx, p.z);
      if (stepX !== null) {
        p.x += dx;
        ground.current = stepX;
      }
      const stepZ = standAt(p.x, p.z + dz);
      if (stepZ !== null) {
        p.z += dz;
        ground.current = stepZ;
      }
    }

    const target = ground.current + EYE;
    // Tighter on the treads: twelve risers at this pace is a rise every seventh of a second, and
    // the same easing that smooths a doorstep turns those into a bounce.
    eye.current += (target - eye.current) * Math.min(1, dt * (onStairs ? 22 : 12));

    walkerPose.x = position.current.x;
    walkerPose.y = eye.current;
    walkerPose.z = position.current.z;
    walkerPose.inside = ground.current > 0.2;

    camera.position.set(position.current.x, eye.current, position.current.z);
    camera.rotation.set(pitch.current, yaw.current, 0);
  }, 1);

  return null;
}
