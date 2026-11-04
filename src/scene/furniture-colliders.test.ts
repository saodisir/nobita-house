import { describe, expect, it } from 'vitest';
import { HOUSE_ORIGIN, rectToWorld } from '../data/house-site';
import { FURNITURE, footprintOf, type Rect } from '../editor/house/plan';
import { furnitureBoxes } from './furniture-colliders';

const itemFor = (id: string) => {
  const item = FURNITURE.find((f) => f.id === id);
  if (!item) throw new Error(`plan.ts has no furniture ${id}`);
  return item;
};
const boxFor = (id: string): Rect => rectToWorld(footprintOf(itemFor(id)));
const same = (a: Rect, b: Rect) => a.x0 === b.x0 && a.x1 === b.x1 && a.z0 === b.z0 && a.z1 === b.z1;
const has = (storey: 'ground' | 'upper', id: string) => {
  const want = boxFor(id);
  return furnitureBoxes(storey).some((b) => same(b, want));
};

describe('furniture colliders', () => {
  it('covers every piece tall enough to be a wall, once, on its own storey', () => {
    const tall = FURNITURE.filter((f) => !f.floorCover && !f.on && f.h >= 0.3);
    expect(furnitureBoxes('ground').length + furnitureBoxes('upper').length).toBe(tall.length);
  });

  it('puts tables, chairs and the big pieces on the ground floor only', () => {
    for (const id of [
      'dining-table',
      'chair-1',
      'chair-4',
      'coffee-table',
      'sofa',
      'kotatsu',
      'fridge',
      'counter',
    ]) {
      expect(has('ground', id)).toBe(true);
      expect(has('upper', id)).toBe(false);
    }
  });

  it('puts the upstairs furniture on the upper floor only', () => {
    for (const id of ['desk', 'desk-chair', 'dora-bed', 'storeroom-boxes']) {
      expect(has('upper', id)).toBe(true);
      expect(has('ground', id)).toBe(false);
    }
  });

  it('leaves flat covers, things on a host and step-over pieces passable', () => {
    for (const id of [
      'rug-yoshitsu',
      'doormat',
      'cushion-n',
      'cushion-s',
      'cushion-w',
      'cushion-e',
      'cushion-kyodai',
      'cushion-nobita',
      'bath-stool',
      'tv',
      'phone',
      'flowers-getabako',
    ]) {
      expect(has('ground', id) || has('upper', id)).toBe(false);
    }
  });

  it('uses world coordinates rather than the plan frame', () => {
    const plan = footprintOf(itemFor('dining-table'));
    const world = rectToWorld(plan);
    expect(world.x0 - plan.x0).toBeCloseTo(HOUSE_ORIGIN.x);
    expect(world.z0 - plan.z0).toBeCloseTo(HOUSE_ORIGIN.z);
  });

  it('returns real rectangles, never a zero-width or inverted box', () => {
    for (const storey of ['ground', 'upper'] as const) {
      for (const b of furnitureBoxes(storey)) {
        expect(b.x1).toBeGreaterThan(b.x0);
        expect(b.z1).toBeGreaterThan(b.z0);
      }
    }
  });
});
