import { rectToWorld } from '../data/house-site';
import { FURNITURE, footprintOf, type Rect, storeyOfRoom } from '../editor/house/plan';

/**
 * Furniture the walker has to walk round, as world AABBs.
 *
 * `FURNITURE` is the same list `buildFurniture()` draws from, so a table moved in the plan
 * moves its collider too, and `footprintOf()` already turns the turned w × d rectangle into an
 * axis-aligned box. Three things are not walls: rugs and doormats lie flat (`floorCover`), a
 * thing standing on another item (`on`) sits inside its host's footprint, and anything lower
 * than a low step can be walked over rather than stopped by. Storey by storey for the same
 * reason the walls are: an upstairs table must not block a hallway below it.
 */
const FURNITURE_STEP = 0.3;

export function furnitureBoxes(storey: 'ground' | 'upper'): Rect[] {
  return FURNITURE.filter(
    (item) => !item.floorCover && !item.on && item.h >= FURNITURE_STEP && storeyOfRoom(item.room) === storey,
  ).map((item) => rectToWorld(footprintOf(item)));
}
