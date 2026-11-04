import { useEffect, useRef } from 'react';
import { characterById } from '../data/characters';
import { roomHotspots } from '../data/room-hotspots';
import { pick } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';

/**
 * The one card in the app. On the street it holds a character bio; in Nobita's room it holds
 * a hotspot's card. One component, because the two are the same object to a visitor — a panel
 * that opens on a selection, closes on Esc, and hands focus back where it came from.
 */
export function InfoCard() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const hotspotId = useAppStore((s) => s.selectedRoomHotspot);
  const select = useAppStore((s) => s.select);
  const selectRoomHotspot = useAppStore((s) => s.selectRoomHotspot);
  const driveAs = useAppStore((s) => s.driveAs);
  const closeRef = useRef<HTMLButtonElement>(null);
  const locale = useLocale();
  const t = useT();

  const character = activeRoomId === null && selectedId ? characterById(selectedId) : undefined;
  const hotspot =
    activeRoomId !== null && hotspotId ? roomHotspots.find((h) => h.id === hotspotId) : undefined;
  const open = character ?? hotspot;
  const close = character ? () => select(null) : () => selectRoomHotspot(null);
  /** Where focus goes when the card closes: the control that opened it. */
  const origin = character ? `.roster [data-id="${character.id}"]` : `.room-pin[data-id="${hotspot?.id}"]`;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    // Escape inside the room belongs to `RoomControls`: it closes this card first and only
    // leaves on a second press. Registering a second `window` listener here would fire in
    // whichever order the two happened to mount, and one press would do both.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    if (character) window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const button = document.querySelector<HTMLButtonElement>(origin);
      // With the menus folded away the roster is inert, so focus goes to the toggle that
      // brings it back; a ghosted pin cannot take focus either.
      const unreachable = button?.closest('[inert]') || button?.tabIndex === -1;
      const target = unreachable ? document.querySelector<HTMLButtonElement>('.menus-toggle') : button;
      target?.focus();
    };
  }, [open, close, origin, character]);

  if (character) {
    return (
      <Card
        eyebrow={t('cardCharacter')}
        eyebrowColor={character.color}
        title={pick(character.name, locale)}
        jp={character.jpName}
        body={pick(character.bio, locale)}
        // A click looks; these two buttons start a drive. Same walk, same house, only a different
        // place to put the lens. V swaps them without letting go of the child.
        actions={[
          { label: t('cardDriveFirst'), onClick: () => driveAs(character.id, 'first') },
          { label: t('cardDriveThird'), onClick: () => driveAs(character.id, 'third') },
        ]}
        closeRef={closeRef}
        onClose={close}
      />
    );
  }
  if (hotspot) {
    return (
      <Card
        eyebrow={t('cardInThisRoom')}
        title={pick(hotspot.title, locale)}
        body={pick(hotspot.body, locale)}
        closeRef={closeRef}
        onClose={close}
      />
    );
  }
  return null;
}

function Card({
  eyebrow,
  eyebrowColor,
  title,
  jp,
  body,
  actions,
  closeRef,
  onClose,
}: {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  jp?: string;
  body: string;
  actions?: { label: string; onClick: () => void }[];
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <section className="panel card" role="dialog" aria-modal="false" aria-labelledby="card-title">
      <p className="eyebrow" style={eyebrowColor ? { color: eyebrowColor } : undefined}>
        {eyebrow}
      </p>
      <h2 id="card-title">{title}</h2>
      {jp && (
        <p className="jp" lang="ja">
          {jp}
        </p>
      )}
      <p className="body">{body}</p>
      {actions?.map((action) => (
        <button key={action.label} type="button" className="card__action" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
      <button ref={closeRef} type="button" className="close" aria-label={t('cardClose')} onClick={onClose}>
        &times;
      </button>
    </section>
  );
}
