import { describe, expect, it } from 'vitest';
import { seeded } from '../scene/wander-plan';
import {
  BODY_PAD,
  NAV_EDGES,
  NAV_GOALS,
  NAV_NODES,
  NAV_OBSTACLES,
  nearestOnRoute,
  OUTER_LAP_LENGTH,
  type RoutePoint,
  randomLoop,
  sampleRoute,
  segmentClear,
} from './nav-graph';

const byId = new Map(NAV_NODES.map((n) => [n.id, n]));
const node = (id: string) => {
  const found = byId.get(id);
  if (!found) throw new RangeError(`no node ${id}`);
  return found;
};
const asNode = (p: RoutePoint) => ({ id: '', x: p.x, z: p.z });
const blank = () => ({ x: 0, y: 0, z: 0, heading: 0 });
/** A person radius, not the full lane pad: the lane point is already off the centre line. */
const inside = (x: number, z: number) =>
  NAV_OBSTACLES.some((r) => x > r.x0 - 0.19 && x < r.x1 + 0.19 && z > r.z0 - 0.19 && z < r.z1 + 0.19);

const pairs = [...new Set(NAV_EDGES.map((e) => [e.from, e.to].sort().join('|')))];

describe('the garden walk graph', () => {
  it('admits every authored edge, and none crosses a wall grown by a body and a lane', () => {
    expect(NAV_NODES.length).toBe(9);
    expect(pairs).toHaveLength(12);
    expect(BODY_PAD).toBeGreaterThan(0.55 + 0.19 - 1e-9);
    for (const pair of pairs) {
      const [a, b] = pair.split('|');
      if (!a || !b) throw new Error('bad pair');
      expect(segmentClear(node(a), node(b)), pair).toBe(true);
    }
  });

  it('rejects a line that would cut straight through the house', () => {
    expect(segmentClear({ id: 'w', x: -5.5, z: 0 }, { id: 'e', x: 5.3, z: 0 })).toBe(false);
  });

  it('connects every node back to the gate', () => {
    const seen = new Set(['gate']);
    const queue = ['gate'];
    while (queue.length > 0) {
      const at = queue.shift();
      for (const edge of NAV_EDGES) {
        if (edge.from === at && !seen.has(edge.to)) {
          seen.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    expect(seen.size).toBe(NAV_NODES.length);
  });

  it('draws a closed walk that begins and ends at the gate', () => {
    for (let seed = 0; seed < 30; seed++) {
      const route = randomLoop(seeded(seed));
      expect(route.ids[0]).toBe('gate');
      expect(route.ids[route.ids.length - 1]).toBe('gate');
      expect(route.length).toBeGreaterThan(20);
      const first = route.points[0];
      const last = route.points[route.points.length - 1];
      if (!first || !last) throw new Error('empty walk');
      expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(1e-9);
      expect(route.s[route.s.length - 1]).toBeCloseTo(route.length, 6);
    }
  });

  it('keeps every part of every drawn walk outside the walls', () => {
    for (let seed = 0; seed < 60; seed++) {
      const route = randomLoop(seeded(seed));
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i];
        const b = route.points[i + 1];
        if (!a || !b) throw new Error('missing point');
        expect(segmentClear(asNode(a), asNode(b)), `seed ${seed} segment ${i}`).toBe(true);
      }
    }
  });

  it('replays a seed exactly and draws a different afternoon from a different seed', () => {
    const a = randomLoop(seeded(77));
    const b = randomLoop(seeded(77));
    const c = randomLoop(seeded(78));
    expect(a.ids).toEqual(b.ids);
    expect(a.points).toEqual(b.points);
    expect(a.ids).not.toEqual(c.ids);
    const walks = new Set(Array.from({ length: 20 }, (_, seed) => randomLoop(seeded(seed)).ids.join('>')));
    expect(walks.size).toBeGreaterThan(8);
  });

  it('holds three lanes continuous and clear of the walls round every corner', () => {
    let maxJump = 0;
    for (let seed = 0; seed < 40; seed++) {
      const route = randomLoop(seeded(seed));
      for (const lane of [-0.55, 0, 0.55]) {
        const a = blank();
        const b = blank();
        for (let d = 0; d < route.length; d += 0.05) {
          sampleRoute(route, d, lane, a);
          sampleRoute(route, d + 0.05, lane, b);
          maxJump = Math.max(maxJump, Math.hypot(b.x - a.x, b.z - a.z));
          expect(inside(b.x, b.z), `seed ${seed} lane ${lane} at ${d.toFixed(2)}`).toBe(false);
        }
      }
    }
    // Five centimetres of travel plus the turn of the normal; a flipped lane would be a metre.
    expect(maxJump).toBeLessThan(0.12);
  });

  it('wraps distance and finds the nearest point back on the walk', () => {
    const route = randomLoop(seeded(5));
    const start = blank();
    const wrapped = blank();
    sampleRoute(route, 0, 0, start);
    sampleRoute(route, route.length, 0, wrapped);
    expect(Math.hypot(start.x - wrapped.x, start.z - wrapped.z)).toBeLessThan(1e-9);
    expect(nearestOnRoute(route, start.x, start.z)).toBeLessThan(0.4);

    const middle = blank();
    const again = blank();
    sampleRoute(route, route.length * 0.5, 0, middle);
    sampleRoute(route, nearestOnRoute(route, middle.x, middle.z), 0, again);
    expect(Math.hypot(middle.x - again.x, middle.z - again.z)).toBeLessThan(0.1);
  });

  it('gives every point a unit lane normal', () => {
    const route = randomLoop(seeded(9));
    for (const point of route.points) {
      expect(Math.hypot(point.nx, point.nz)).toBeCloseTo(1, 5);
    }
  });

  it('measures the outer lap off the same edges the children walk', () => {
    const outer = NAV_EDGES.filter((e) =>
      ['gate>se', 'se>ne', 'ne>nw', 'nw>sw', 'sw>gate'].includes(`${e.from}>${e.to}`),
    );
    expect(outer).toHaveLength(5);
    expect(OUTER_LAP_LENGTH).toBeCloseTo(
      outer.reduce((sum, e) => sum + e.length, 0),
      6,
    );
    expect(OUTER_LAP_LENGTH).toBeGreaterThan(40);
  });

  it("keeps an afternoon's walk within a couple of laps and keeps the walks varied", () => {
    const shapes = new Set<string>();
    for (let seed = 0; seed < 80; seed++) {
      const route = randomLoop(seeded(seed));
      shapes.add(route.ids.join('>'));
      expect(route.length / OUTER_LAP_LENGTH).toBeLessThan(2);
      expect(route.length / OUTER_LAP_LENGTH).toBeGreaterThan(0.5);
    }
    // A penalty on used edges must not collapse the afternoon into one fixed lap.
    expect(shapes.size).toBeGreaterThan(30);
  });

  it('spreads the walk instead of pacing one stretch back and forth', () => {
    let retraced = 0;
    for (let seed = 0; seed < 80; seed++) {
      const route = randomLoop(seeded(seed));
      const used = new Set<string>();
      let repeated = false;
      for (let i = 1; i < route.ids.length; i++) {
        const key = [route.ids[i - 1], route.ids[i]].sort().join('|');
        if (used.has(key)) repeated = true;
        used.add(key);
      }
      if (repeated) retraced++;
    }
    // Without the penalty on used edges this is 47 of 80; the remaining ones are the walks
    // that have to come back out of the inner line, which has only four ways in.
    expect(retraced).toBeLessThan(40);
  });

  it('picks a destination and plans a real way there', () => {
    expect(NAV_GOALS).toHaveLength(NAV_NODES.length - 1);
    expect(NAV_GOALS).not.toContain('gate');
    const edges = new Set(NAV_EDGES.map((e) => `${e.from}>${e.to}`));
    for (let seed = 0; seed < 60; seed++) {
      const route = randomLoop(seeded(seed));
      expect(NAV_GOALS).toContain(route.goal);
      expect(route.ids).toContain(route.goal);
      // A* is a goal-directed search: a destination one hop from the gate is reached in one hop.
      if (route.goal === 'se' || route.goal === 'sw') expect(route.ids[1]).toBe(route.goal);
      for (let i = 1; i < route.ids.length; i++) {
        expect(edges.has(`${route.ids[i - 1]}>${route.ids[i]}`), `seed ${seed} step ${i}`).toBe(true);
      }
    }
  });

  it('keeps two lanes their full width apart through every corner', () => {
    // Interpolating two unit normals at a corner used to leave a 0.64-length vector, which
    // quietly pulled a party's 0.55 m lanes 0.2 m closer together — inside one another.
    const a = blank();
    const b = blank();
    for (let seed = 0; seed < 25; seed++) {
      const route = randomLoop(seeded(seed));
      for (let d = 0; d < route.length; d += 0.05) {
        sampleRoute(route, d, -0.55, a);
        sampleRoute(route, d, 0.55, b);
        expect(Math.hypot(a.x - b.x, a.z - b.z), `seed ${seed} at ${d.toFixed(2)}`).toBeGreaterThan(1.09);
      }
    }
  });

  it('replays a destination exactly and visits many different places', () => {
    expect(randomLoop(seeded(31)).goal).toBe(randomLoop(seeded(31)).goal);
    const goals = new Set(Array.from({ length: 40 }, (_, seed) => randomLoop(seeded(seed)).goal));
    expect(goals.size).toBeGreaterThan(5);
  });
});
