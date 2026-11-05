import { describe, expect, it } from 'vitest';
import { GAME_CLIPS } from './walk-clips';
import { makePlan, type PlanMember, seeded } from './wander-plan';

const MEMBERS: readonly PlanMember[] = [
  { index: 0, kind: 'street', indoor: false },
  { index: 1, kind: 'yard', indoor: false },
  { index: 2, kind: 'yard', indoor: true },
  { index: 3, kind: 'yard', indoor: false },
  { index: 4, kind: 'street', indoor: false },
  { index: 5, kind: 'street', indoor: false },
];

describe('seeded afternoons', () => {
  it('replays a seed exactly and separates two seeds', () => {
    const a = seeded(1234);
    const b = seeded(1234);
    const c = seeded(1235);
    const draw = (rng: () => number) => Array.from({ length: 12 }, () => rng());
    expect(draw(a)).toEqual(draw(b));
    expect(draw(a)).not.toEqual(draw(c));
    for (const n of draw(seeded(99))) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('gives every child an itinerary inside the bounds the walk can show', () => {
    const plan = makePlan(7, MEMBERS);
    expect(plan.child.size).toBe(MEMBERS.length);
    for (const member of MEMBERS) {
      const child = plan.child.get(member.index);
      if (!child) throw new Error(`no plan for ${member.index}`);
      expect(child.walkFor).toBeGreaterThanOrEqual(7);
      expect(child.walkFor).toBeLessThan(15);
      expect(child.restFor).toBeGreaterThanOrEqual(2.5);
      expect(child.restFor).toBeLessThan(6.5);
      expect(child.departure).toBeGreaterThanOrEqual(0);
      expect(child.departure).toBeLessThan(2.2);
      expect(child.pace).toBeGreaterThanOrEqual(0.9);
      expect(child.pace).toBeLessThan(1.15);
      // The street is one lane; a lateral offset there would put a child in the road.
      if (member.kind === 'street') expect(child.lateral).toBe(0);
    }
  });

  it('forms a yard party of two or three, in distinct lanes, with one leader', () => {
    for (let seed = 0; seed < 40; seed++) {
      const plan = makePlan(seed, MEMBERS);
      expect(plan.parties).toHaveLength(1);
      const party = plan.parties[0];
      if (!party) throw new Error('no party');
      expect(party.members.length).toBeGreaterThanOrEqual(2);
      expect(party.members.length).toBeLessThanOrEqual(3);
      expect(party.members).toContain(party.leader);
      expect(new Set(party.lanes).size).toBe(party.members.length);
      for (const index of party.members) {
        const def = MEMBERS.find((m) => m.index === index);
        expect(def?.kind).toBe('yard');
      }
      for (const [i, index] of party.members.entries()) {
        expect(plan.child.get(index)?.lateral).toBe(party.lanes[i]);
      }
    }
  });

  it('draws a schedule of games the models can actually play', () => {
    const plan = makePlan(31, MEMBERS);
    expect(plan.games).toHaveLength(24);
    for (const game of plan.games) {
      expect(GAME_CLIPS).toContain(game.clip);
      expect(game.quorum === 2 || game.quorum === 3).toBe(true);
      expect(game.seconds).toBe(8);
      expect(game.gap).toBeGreaterThanOrEqual(10);
      expect(game.gap).toBeLessThan(22);
      expect([...game.order].sort((a, b) => a - b)).toEqual(
        MEMBERS.map((m) => m.index).sort((a, b) => a - b),
      );
    }
  });

  it('draws a different afternoon from a different seed, and the same one from the same seed', () => {
    const a = makePlan(101, MEMBERS);
    const b = makePlan(101, MEMBERS);
    const c = makePlan(102, MEMBERS);
    const digest = (p: typeof a) => ({
      children: [...p.child.entries()].map(([i, c]) => [i, c.walkFor, c.lateral, c.pace]),
      parties: p.parties,
      games: p.games.map((g) => [g.clip, g.kind, g.quorum, g.gap]),
    });
    expect(digest(a)).toEqual(digest(b));
    expect(digest(a)).not.toEqual(digest(c));
    expect(a.seed).toBe(101);
  });

  it('leaves a pack with fewer than two garden children without a party', () => {
    const few = MEMBERS.filter((m) => m.index === 0 || m.index === 1 || m.index === 4);
    const plan = makePlan(5, few);
    expect(plan.parties).toHaveLength(0);
  });
});
