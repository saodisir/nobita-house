import { describe, expect, it } from 'vitest';
import { anchorPropOf, roomHotspots } from './room-hotspots';
import { RODIN_STYLE_SUFFIX, roomProps } from './room-props';
import { type HouseRoom, roomById, rooms } from './rooms';
import type { Rect } from './scene';

const inside = (r: Rect, x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

describe('the rooms on the lot', () => {
  it('gives every room somewhere to stand, the first place being where the visitor arrives', () => {
    for (const room of rooms) expect(room.views.length, room.id).toBeGreaterThan(0);
  });

  it.each(
    rooms
      .filter(
        (room): room is HouseRoom & { entry: NonNullable<HouseRoom['entry']> } => room.entry !== undefined,
      )
      .map((room) => [room.id, room] as const),
  )('%s is seen from the street through a window in its own outside wall', (_id, room) => {
    const [cx, cy, cz] = room.entry.centre;
    const [ox, oz] = room.entry.outward;
    expect(Math.hypot(ox, oz)).toBeCloseTo(1, 9);
    // Just inside the glass is the room itself; just outside, no room of the storey at all.
    expect(inside(room.bounds, cx - ox * 0.3, cz - oz * 0.3), 'inside').toBe(true);
    for (const other of rooms.filter((r) => r.storey === room.storey)) {
      expect(inside(other.bounds, cx + ox * 0.3, cz + oz * 0.3), `outside lands in ${other.id}`).toBe(false);
    }
    expect(cy).toBeGreaterThan(room.floorY);
    expect(cy).toBeLessThan(room.ceilingY);
  });
});

describe('recovered content', () => {
  it('has unique kebab-case prop ids', () => {
    const ids = roomProps.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('keeps every Rodin prompt intact and suffix-free', () => {
    for (const prop of roomProps) {
      expect(prop.rodinPrompt.length, prop.id).toBeGreaterThan(20);
      // The suffix is appended at build time; baking it in would double it.
      expect(prop.rodinPrompt).not.toContain(RODIN_STYLE_SUFFIX);
    }
  });

  it('resolves every hotspot to a prop, a room, and exactly one anchor', () => {
    const ids = roomHotspots.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const hotspot of roomHotspots) {
      expect(
        roomProps.some((p) => p.id === hotspot.propId),
        hotspot.id,
      ).toBe(true);
      expect(roomById(hotspot.roomId), `${hotspot.id} room`).toBeDefined();
      expect(anchorPropOf(hotspot), `${hotspot.id} anchor prop`).toBeDefined();
      // A pin cannot hang in two places.
      expect(Boolean(hotspot.anchor) !== Boolean(hotspot.anchorWorld), hotspot.id).toBe(true);
    }
  });

  it('anchors every world pin inside its own room', () => {
    for (const hotspot of roomHotspots) {
      if (!hotspot.anchorWorld) continue;
      const room = roomById(hotspot.roomId);
      if (!room) throw new Error(`${hotspot.id} has no room`);
      const [x, y, z] = hotspot.anchorWorld;
      expect(inside(room.bounds, x, z), `${hotspot.id} at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBe(true);
      expect(y, hotspot.id).toBeGreaterThan(room.floorY);
      expect(y, hotspot.id).toBeLessThan(room.ceilingY);
    }
  });

  it('keeps the card prose: 2-4 sentences, no placeholder', () => {
    for (const hotspot of roomHotspots) {
      expect(hotspot.title.en.length, hotspot.id).toBeGreaterThan(10);
      // Chinese says the same in a third of the characters, so the floor is lower.
      expect(hotspot.title.zh.length, `${hotspot.id} zh title`).toBeGreaterThan(3);
      for (const locale of ['en', 'zh'] as const) {
        const body = hotspot.body[locale];
        // Chinese ends a sentence on a full stop of its own; there is no space to split on.
        const sentences = body.split(locale === 'en' ? /(?<=\.)\s+/ : /(?<=。)/).filter(Boolean);
        expect(sentences.length, `${hotspot.id} ${locale} sentence count`).toBeGreaterThanOrEqual(2);
        expect(sentences.length, `${hotspot.id} ${locale} sentence count`).toBeLessThanOrEqual(4);
        expect(body, `${hotspot.id} ${locale}`).not.toMatch(/TODO|TBD|Lorem/i);
      }
    }
  });
});
