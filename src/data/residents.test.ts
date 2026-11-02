import { describe, expect, it } from 'vitest';
import {
  FURNITURE,
  type Furniture,
  interiorOf,
  roomById,
  type StoreyId,
  storeyOfRoom,
  yawOf,
} from '../editor/house/plan';
import { residents } from './residents';

/**
 * The footprint of an item as a box on the floor. `w` runs across the item's front and `d` front
 * to back, so an item facing east or west has them the other way round; a half turn does not
 * change the box. The two items turned 45° are across the room from both parents.
 */
function footprint(item: Furniture) {
  const quarter = Math.round(yawOf(item) / (Math.PI / 2));
  const hx = quarter % 2 === 0 ? item.w / 2 : item.d / 2;
  const hz = quarter % 2 === 0 ? item.d / 2 : item.w / 2;
  return { x0: item.x - hx, x1: item.x + hx, z0: item.z - hz, z1: item.z + hz };
}

/** Distance from a point to a box on the ground plane: 0 when the point is inside it. */
function gapTo(box: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) {
  const dx = Math.max(box.x0 - x, 0, x - box.x1);
  const dz = Math.max(box.z0 - z, 0, z - box.z1);
  return Math.hypot(dx, dz);
}

describe('the parents at home', () => {
  it('stands each of them inside the room they belong to', () => {
    for (const res of residents) {
      const room = roomById(res.room);
      const [x, , z] = res.position;
      expect(room.storey, res.id).toBe<StoreyId>('ground');
      const inside = room.rects.some((r) => {
        const i = interiorOf(r, room.storey);
        return x > i.x0 && x < i.x1 && z > i.z0 && z < i.z1;
      });
      expect(inside, `${res.id} at (${x}, ${z}) is in ${room.name}`).toBe(true);
    }
  });

  it('leaves them a body-width clear of every piece of furniture round them', () => {
    for (const res of residents) {
      const storey = roomById(res.room).storey;
      const [x, , z] = res.position;
      for (const item of FURNITURE) {
        // Floor coverings are walked on and cushions are sat on; nothing else is entered.
        if (item.floorCover || item.h < 0.2) continue;
        if (res.ignore?.includes(item.id)) continue;
        if (storeyOfRoom(item.room) !== storey) continue;
        const gap = gapTo(footprint(item), x, z);
        expect(
          gap,
          `${res.id} stands ${gap.toFixed(2)} m from "${item.id}", needs ${res.girth}`,
        ).toBeGreaterThanOrEqual(res.girth);
      }
    }
  });

  it('sets them down on the floor, or on the cushion under them', () => {
    for (const res of residents) {
      const room = roomById(res.room);
      const [x, y, z] = res.position;
      if (res.pose === 'stand') {
        expect(y, `${res.id} stands on the ${room.name} floor`).toBeCloseTo(room.floorY, 6);
        continue;
      }
      const seat = FURNITURE.find(
        (item) => item.kind === 'floorCushion' && gapTo(footprint(item), x, z) === 0,
      );
      expect(seat, `${res.id} is sitting on a cushion`).toBeDefined();
      expect(y, `${res.id} sits on the top of "${seat?.id}"`).toBeCloseTo(room.floorY + (seat?.h ?? 0), 6);
    }
  });

  it('keeps the two of them out of each other', () => {
    for (const a of residents) {
      for (const b of residents) {
        if (a === b) continue;
        const [ax, , az] = a.position;
        const [bx, , bz] = b.position;
        expect(Math.hypot(ax - bx, az - bz)).toBeGreaterThan(a.girth + b.girth);
      }
    }
  });
});
