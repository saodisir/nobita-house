import { type EditorLevel, editorLevels } from '../editor/levels';
import { ROOM_VIEWS, type RoomView } from '../editor/room-views';
import { dioramaHref, linkProps } from '../router';

interface Props {
  level: EditorLevel;
  onLevel: (level: EditorLevel) => void;
  view: RoomView | null;
  onView: (view: RoomView) => void;
  labels: boolean;
  onLabels: (labels: boolean) => void;
}

/**
 * The editor's title card: the way back, the storey on show, the room names, and a room to
 * stand in. Choosing a storey steps back out of the room.
 */
export function EditorChrome({ level, onLevel, view, onView, labels, onLabels }: Props) {
  const spots = view ? ROOM_VIEWS.find((entry) => entry.room.id === view.room)?.views : undefined;
  return (
    <header className="panel editor-head">
      <a className="editor-back" {...linkProps(dioramaHref)}>
        &larr; Diorama
      </a>
      <h1>House editor</h1>
      <p>Both floors, built from the plan drawing. The diorama keeps its own house.</p>
      <fieldset className="editor-levels">
        <legend>Show</legend>
        {editorLevels.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={!view && option.id === level.id}
            onClick={() => onLevel(option)}
          >
            {option.label}
          </button>
        ))}
        <button type="button" aria-pressed={labels} onClick={() => onLabels(!labels)}>
          Room names
        </button>
      </fieldset>
      <fieldset className="editor-levels">
        <legend>Stand in a room</legend>
        {ROOM_VIEWS.map(({ room, views }) => (
          <button
            key={room.id}
            type="button"
            aria-pressed={view?.room === room.id}
            onClick={() => {
              const first = views[0];
              if (first && view?.room !== room.id) onView(first);
            }}
          >
            {room.name}
          </button>
        ))}
      </fieldset>
      {spots && (
        <fieldset className="editor-levels">
          <legend>Stand at</legend>
          {spots.map((spot) => (
            <button key={spot.label} type="button" aria-pressed={spot === view} onClick={() => onView(spot)}>
              {spot.label}
            </button>
          ))}
          <p className="editor-hint">Drag to look round, scroll or pinch to zoom.</p>
        </fieldset>
      )}
    </header>
  );
}
