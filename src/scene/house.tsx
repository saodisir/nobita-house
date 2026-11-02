import { Suspense } from 'react';
import { HOUSE_ORIGIN } from '../data/house-site';
import { roomById } from '../data/rooms';
import { HouseModel } from '../editor/house/house-model';
import { useAppStore } from '../state/store';
import { Residents } from './residents';

/**
 * Nobita's house on his lot: the house `/editor` builds from `plan.ts`, every room furnished
 * and every door on its hinges or its track, set down where `house-site.ts` puts it. A view
 * that looks into a room through its doorway opens that door.
 */
export function House() {
  const door = useAppStore((s) => {
    const room = s.activeRoomId ? roomById(s.activeRoomId) : undefined;
    return (room?.views[s.roomViewIndex] ?? room?.views[0])?.door;
  });
  const stage = useAppStore((s) => s.stage);
  return (
    <group position={[HOUSE_ORIGIN.x, 0, HOUSE_ORIGIN.z]}>
      {/* Its tiles load behind their own boundary, so the street never waits on them. */}
      <Suspense fallback={null}>
        <HouseModel cutY={null} openDoor={door} paving={false} stage={stage} />
      </Suspense>
      {/* Likewise their sculpts: the house is complete without the people in it. */}
      <Residents />
    </group>
  );
}
