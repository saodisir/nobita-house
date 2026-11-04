import { describe, expect, it } from 'vitest';
import { inSwing } from '../scene/door-sweep';
import { SHED, SHED_DOOR_ID, SHED_LEAF_Z, SHED_SWINGS, shedDoorRect, shedWallRects } from './shed';

describe('the shed is one shell with one doorway', () => {
  it('leaves the front face open exactly across the doorway', () => {
    const d = shedDoorRect();
    const front = shedWallRects().filter(
      (r) => r.z0 === SHED.walls.z1 - SHED.thickness && r.z1 === SHED.walls.z1,
    );
    expect(front).toHaveLength(2);
    const [leftFront, rightFront] = front;
    expect(leftFront?.x1).toBe(d.x0);
    expect(rightFront?.x0).toBe(d.x1);
  });

  it('hangs both leaves at the jambs and opens them toward the house', () => {
    expect(SHED_SWINGS).toHaveLength(2);
    expect(SHED_SWINGS[0].hx).toBe(SHED.door.x0);
    expect(SHED_SWINGS[1].hx).toBe(SHED.door.x1);
    for (const s of SHED_SWINGS) {
      expect(s.id).toBe(SHED_DOOR_ID);
      expect(s.vz).toBe(1);
      expect(s.length * 2).toBeCloseTo(SHED.door.x1 - SHED.door.x0);
    }
  });

  it('blocks a body right in front of the leaves, but not one a stride back', () => {
    const mid = (SHED.door.x0 + SHED.door.x1) / 2;
    const near = { x: mid, z: SHED_LEAF_Z + 0.4 };
    const far = { x: mid, z: SHED_LEAF_Z + 1.6 };
    expect(SHED_SWINGS.some((s) => inSwing(s, near.x, near.z, 0.19))).toBe(true);
    expect(SHED_SWINGS.some((s) => inSwing(s, far.x, far.z, 0.19))).toBe(false);
  });
});
