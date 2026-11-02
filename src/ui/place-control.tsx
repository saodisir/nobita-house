import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { type HouseRoom, rooms } from '../data/rooms';
import { useAppStore } from '../state/store';
import { ChevronIcon, CloseIcon, HouseIcon } from './icons';
import { press } from './motion-presets';
import { useDismiss } from './use-dismiss';

type Section = { label: string; rooms: readonly HouseRoom[] };

/** Grouped the way the house is: downstairs or up. The street is not a room, so it does not list. */
const sections: Section[] = [
  { label: 'Ground floor', rooms: rooms.filter((room) => room.storey === 'ground') },
  { label: 'Upstairs', rooms: rooms.filter((room) => room.storey === 'upper') },
];

/**
 * Where the visitor is, and the chrome's way to move.
 *
 * Replaces the old enter/exit pair — a row of "Look inside…" buttons to go in, a differently
 * shaped panel with a heading to come out. Two forms for one idea, which is why neither had a
 * natural home in the layout. Here the trigger names the current place, the menu lists the rooms
 * (and only the rooms — the street has its own exit button beside the trigger), so the control
 * answers "where am I" and "where can I go" at once, and stays one button wide however many
 * rooms the house grows.
 *
 * The clickable windows in the scene drive the same store, so both routes stay in step.
 */
export function PlaceControl() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const tourActive = useAppStore((s) => s.tourIndex !== null);
  const enterRoom = useAppStore((s) => s.enterRoom);
  const leaveRoom = useAppStore((s) => s.leaveRoom);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = rooms.find((room) => room.id === activeRoomId);

  // `useDismiss` catches Esc in the capture phase and stops it there, so while the menu is open
  // that press closes the menu and never reaches the leave-the-room listener below.
  useDismiss(
    open,
    (reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    },
    [menuRef, triggerRef],
  );

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[aria-current="true"], button')?.focus();
  }, [open]);

  // Escape has exactly one owner while a room is open. Two `window` listeners cannot be ordered
  // reliably — `stopPropagation` does not stop a sibling registered on the same target — so the
  // first press closes an open hotspot card, and only a second one leaves. A running tour takes
  // precedence over both: Esc exits the tour and keeps the visitor where they stand.
  useEffect(() => {
    if (!activeRoomId && !tourActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const state = useAppStore.getState();
      if (state.tourIndex !== null) {
        state.exitTour();
        return;
      }
      if (state.selectedRoomHotspot) {
        state.selectRoomHotspot(null);
        return;
      }
      state.leaveRoom();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeRoomId, tourActive]);

  const go = (id: string) => {
    enterRoom(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="controls__group place">
      <motion.button
        ref={triggerRef}
        type="button"
        className="place__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        title={activeRoomId ? 'Go to another room' : 'Look inside the house'}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        whileTap={press}
      >
        <HouseIcon />
        <span className="place__current">{current ? current.shortName : 'Street'}</span>
        <ChevronIcon />
      </motion.button>
      {activeRoomId && (
        <motion.button
          type="button"
          aria-label="Back to the street"
          title="Back to the street"
          onClick={() => {
            leaveRoom();
            setOpen(false);
          }}
          whileTap={press}
        >
          <CloseIcon />
        </motion.button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            className="panel place__menu"
            role="group"
            aria-label="Places"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {sections.map((section) => (
              <Fragment key={section.label}>
                <p className="place__heading">{section.label}</p>
                {section.rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    className="place__item"
                    aria-current={activeRoomId === room.id ? 'true' : undefined}
                    onClick={() => go(room.id)}
                  >
                    {room.name}
                    <span className="place__jp" lang="ja">
                      {room.kana}
                    </span>
                  </button>
                ))}
              </Fragment>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
