import { roomById } from '../data/rooms';
import { useAppStore } from '../state/store';

/**
 * Where in the room to stand: one chip per place `room-views.ts` finds in it, the corners and,
 * for the rooms too small to show from inside, the doorway. The same places `/editor` lists.
 * Nothing to pick in a room with only one.
 */
export function RoomViewPicker() {
  const room = useAppStore((s) => (s.activeRoomId ? roomById(s.activeRoomId) : undefined));
  const index = useAppStore((s) => s.roomViewIndex);
  const setRoomView = useAppStore((s) => s.setRoomView);
  if (!room || room.views.length < 2) return null;
  return (
    <fieldset className="title__views">
      <legend>Stand at</legend>
      {room.views.map((view, i) => (
        <button key={view.label} type="button" aria-pressed={i === index} onClick={() => setRoomView(i)}>
          {view.label}
        </button>
      ))}
    </fieldset>
  );
}
