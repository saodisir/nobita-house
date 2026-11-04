import { beforeEach, describe, expect, it } from 'vitest';
import { type CharacterDef, characters } from '../data/characters';
import { layout } from '../data/scene';
import { groundAt } from '../data/walk-routes';
import { poseFor } from '../state/character-poses';
import { advanceHold, beginHold, blocked, heldKeys, heldPose } from './possession';

/**
 * Driving a child by hand, without a renderer.
 *
 * `advanceHold` is deliberately plain arithmetic over one mutable object, so the interesting
 * questions — does W go where the camera looks, does a child stop at its own garden wall, does it
 * come down off the pavement into the yard — are answered here instead of by looking at a
 * screenshot.
 */

const first = characters[0];
if (!first) throw new Error('no characters to drive');
/** The child every case drives. Annotated rather than narrowed: the guard is module-level and
 *  the cases below are closures, which do not inherit it. */
const def: CharacterDef = first;

/** Put the child somewhere, so a test starts from a known place rather than an empty pose. */
function stand(x: number, z: number, heading = 0) {
  const pose = poseFor(def.id);
  pose.position.set(x, groundAt(x, z), z);
  pose.heading = heading;
  beginHold(def);
}

/** Hold the keys and run the integration at a steady 60 fps for `seconds`. */
function drive(seconds: number, forward: { x: number; z: number }, keys: string[] = ['KeyW']) {
  for (const key of keys) heldKeys.add(key);
  for (let i = 0; i < Math.round(seconds * 60); i++) advanceHold(1 / 60, forward.x, forward.z);
  heldKeys.clear();
}

beforeEach(() => {
  heldKeys.clear();
});

describe('the ground under a driven child', () => {
  it('stands on the pavement slab, the road paint, the lot and the yard', () => {
    expect(groundAt(layout.wall.gateX, 6.6)).toBeCloseTo(layout.standY, 6);
    // Dead centre of the front carriageway: the zebra runs a kerb lower than the slab.
    expect(groundAt(layout.wall.gateX, layout.road.startZ + layout.road.depth / 2)).toBeCloseTo(
      layout.streets.crossing.top,
      6,
    );
    // Bare earth, both sides: the vacant lot across the road and the yard behind the wall.
    expect(groundAt(1, 24)).toBeCloseTo(0, 6);
    expect(groundAt(1, 2)).toBeCloseTo(0, 6);
  });
});

describe('blocking', () => {
  it('refuses the house and the lot walls, and allows the pavement', () => {
    expect(blocked(0, 0)).toBe(true);
    expect(blocked(layout.wall.gateX, 6.6)).toBe(false);
    // Just inside the front wall, well away from the gate.
    expect(blocked(5, layout.wall.frontZ)).toBe(true);
  });
});

describe('advanceHold', () => {
  it('walks the way the camera looks', () => {
    stand(layout.wall.gateX, 6.6);
    // Camera to the north of the child, looking south at the house: W walks it toward -Z, which
    // is yaw π — 0 faces the street.
    drive(0.5, { x: 0, z: -1 });
    expect(heldPose.z).toBeLessThan(6.6);
    expect(Math.abs(Math.abs(heldPose.heading) - Math.PI)).toBeLessThan(0.05);
    expect(heldPose.moving).toBe(true);
  });

  it('turns to face the way it is going', () => {
    stand(layout.wall.gateX, 6.6);
    drive(1, { x: 1, z: 0 });
    expect(heldPose.heading).toBeCloseTo(Math.PI / 2, 1);
    expect(heldPose.x).toBeGreaterThan(layout.wall.gateX + 0.5);
  });

  it('runs under Shift', () => {
    stand(layout.wall.gateX, 6.6);
    drive(1, { x: 0, z: 1 });
    const walked = heldPose.z - 6.6;
    stand(layout.wall.gateX, 6.6);
    drive(1, { x: 0, z: 1 }, ['KeyW', 'ShiftLeft']);
    const ran = heldPose.z - 6.6;
    expect(ran).toBeGreaterThan(walked * 1.5);
    expect(heldPose.running).toBe(true);
  });

  it('steps down through the gate and stands on the yard', () => {
    stand(layout.wall.gateX, 6.6);
    drive(2, { x: 0, z: -1 });
    // Through the opening and onto the soil a kerb below the slab.
    expect(heldPose.z).toBeLessThan(layout.wall.frontZ - 0.5);
    expect(heldPose.y).toBeLessThan(0.03);
  });

  it('stops at the front wall away from the gate', () => {
    stand(5, 6.6);
    drive(2, { x: 0, z: -1 });
    // Never through: a child in the street cannot walk into its own garden through the wall.
    expect(heldPose.z).toBeGreaterThan(layout.wall.frontZ + 0.1);
  });

  it('stops at the house', () => {
    // Clear of the porch, which is part of the footprint the house covers.
    stand(1.02, 4.2);
    drive(2, { x: 0, z: -1 });
    expect(heldPose.z).toBeGreaterThan(3.6);
    expect(blocked(heldPose.x, heldPose.z)).toBe(false);
  });

  it('does not walk out of the block', () => {
    stand(5, 6.6);
    drive(12, { x: 1, z: 0 });
    expect(heldPose.x).toBeLessThan(9);
  });

  it('comes to rest when the keys are released', () => {
    stand(1.02, 6.6);
    drive(1, { x: 0, z: 1 });
    expect(heldPose.moving).toBe(true);
    drive(0.6, { x: 0, z: 1 }, []);
    expect(heldPose.speed).toBe(0);
    expect(heldPose.moving).toBe(false);
  });
});
