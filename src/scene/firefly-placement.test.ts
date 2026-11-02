import { describe, expect, it } from 'vitest';
import { inHeroLot } from '../data/scene';
import {
  FIREFLY_COUNT,
  gardenClearance,
  MIN_CLEARANCE,
  placeFireflies,
  WANDER_REACH,
} from './firefly-placement';

describe('firefly placement', () => {
  const flies = placeFireflies();

  it('places the full swarm, the same way every load', () => {
    expect(flies).toHaveLength(FIREFLY_COUNT);
    expect(placeFireflies()).toEqual(flies);
  });

  it("keeps every anchor in Nobita's garden, clear of the house, porch and wall", () => {
    for (const { anchor } of flies) {
      const [x, y, z] = anchor;
      expect(inHeroLot(x, z)).toBe(true);
      expect(gardenClearance(x, z)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
      expect(y).toBeGreaterThan(0.5);
    }
  });

  it('reads the L-shaped shell per room: the kitchen notches are garden, the kitchen is not', () => {
    // Inside the old bounding-box keep-out, the two notches the kitchen block leaves beside
    // the main block were house; they are open ground, and the swarm anchors in them.
    expect(gardenClearance(-3.65, -5.01)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    expect(gardenClearance(3.6, -5.31)).toBeGreaterThanOrEqual(MIN_CLEARANCE);
    // Inside the kitchen is house.
    expect(gardenClearance(0, -7.61)).toBe(0);
  });

  it('sizes each wander to the room around its anchor', () => {
    for (const { anchor, radius } of flies) {
      expect(radius * WANDER_REACH).toBeLessThanOrEqual(gardenClearance(anchor[0], anchor[2]) + 1e-9);
    }
  });

  it('flashes every fly once per 2 to 5 seconds', () => {
    for (const { blinkRate } of flies) {
      const period = (Math.PI * 2) / blinkRate;
      expect(period).toBeGreaterThanOrEqual(2);
      expect(period).toBeLessThanOrEqual(5);
    }
  });
});
