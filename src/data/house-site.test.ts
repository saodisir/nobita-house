import { describe, expect, it } from 'vitest';
import { WALLS } from '../editor/house/plan';
import { HOUSE_FOOTPRINT, HOUSE_SHELL, HOUSE_STEPS, toWorld } from './house-site';
import { heroLot, layout } from './scene';

const EPS = 1e-9;
const t = layout.lot.wallThickness;
const garden = { x0: heroLot.x0 + t, x1: heroLot.x1 - t, z0: heroLot.z0 + t, z1: heroLot.z1 - t };

describe('the house on its lot', () => {
  it('stands inside the boundary walls, clear of them', () => {
    for (const r of [...HOUSE_SHELL, ...HOUSE_STEPS]) {
      expect(r.x0, JSON.stringify(r)).toBeGreaterThan(garden.x0 + 0.1);
      expect(r.x1, JSON.stringify(r)).toBeLessThan(garden.x1 - 0.1);
      expect(r.z0, JSON.stringify(r)).toBeGreaterThan(garden.z0 + 0.1);
      expect(r.z1, JSON.stringify(r)).toBeLessThan(garden.z1 - 0.1);
    }
  });

  it('keeps its eaves over its own lot', () => {
    expect(HOUSE_FOOTPRINT.x0).toBeGreaterThanOrEqual(heroLot.x0 - EPS);
    expect(HOUSE_FOOTPRINT.x1).toBeLessThanOrEqual(heroLot.x1 + EPS);
    expect(HOUSE_FOOTPRINT.z0).toBeGreaterThanOrEqual(heroLot.z0 - EPS);
    expect(HOUSE_FOOTPRINT.z1).toBeLessThanOrEqual(heroLot.z1 + EPS);
  });

  it('opens its front door on the gate, with room to walk between the porch and the gate', () => {
    const door = WALLS.flatMap((w) => w.openings).find((o) => o.id === 'door-front');
    if (!door) throw new Error('no door-front');
    const [x0] = toWorld(door.from, 0, 0);
    const [x1] = toWorld(door.to, 0, 0);
    const { gateX, gateWidth } = layout.wall;
    expect(x0).toBeGreaterThanOrEqual(gateX - gateWidth / 2);
    expect(x1).toBeLessThanOrEqual(gateX + gateWidth / 2);
    const porchFront = Math.max(...HOUSE_STEPS.map((r) => r.z1));
    expect(garden.z1 - porchFront).toBeGreaterThanOrEqual(0.6);
  });
});
