import { describe, expect, it } from 'vitest';
import type { RoomId } from '../editor/house/plan';
import { roomById, rooms } from './rooms';
import { tourStops } from './tour';

describe('the house tour', () => {
  it('stops only at real rooms or the street', () => {
    for (const stop of tourStops) {
      if (stop.roomId === null) continue;
      expect(roomById(stop.roomId), `unknown room ${stop.roomId}`).toBeDefined();
    }
  });
  it('visits every room exactly once', () => {
    const ids = tourStops.map((s) => s.roomId).filter((id): id is RoomId => id !== null);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(rooms.map((r) => r.id).sort());
  });
  it('starts and ends on the street', () => {
    expect(tourStops[0]?.roomId).toBeNull();
    expect(tourStops.at(-1)?.roomId).toBeNull();
  });
});
