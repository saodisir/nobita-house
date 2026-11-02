/**
 * The guided tour of the house, as data.
 *
 * A stop is only a room id — the camera work is already done by `enterRoom`/`leaveRoom` and
 * `useInteriorCamera`, which stands the visitor in each room's first place. The route below
 * is ordered the way a visitor would walk it: in at the front door, round the ground floor,
 * up the stairs, and out.
 *
 * `tour.test.ts` is what keeps this honest: add a room to `rooms` and the tour fails until
 * it gets a stop.
 */
import type { RoomId } from '../editor/house/plan';

/** One stop on the house tour. `roomId: null` is the street. */
export interface TourStop {
  roomId: RoomId | null;
}

/** The whole house in walking order, street to street, every room once. */
export const tourStops: readonly TourStop[] = [
  { roomId: null },
  { roomId: 'genkan' },
  { roomId: 'yoshitsu' },
  { roomId: 'hallway' },
  { roomId: 'living' },
  { roomId: 'nook' },
  { roomId: 'oshiire' },
  { roomId: 'kitchen' },
  { roomId: 'doma' },
  { roomId: 'toilet' },
  { roomId: 'washroom' },
  { roomId: 'bath' },
  { roomId: 'upperHall' },
  { roomId: 'storeroom' },
  { roomId: 'nobita' },
  { roomId: 'doraOshiire' },
  { roomId: null },
];
