import { AnimatePresence, motion } from 'motion/react';
import { type FocusEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react';
import { SpeakerIcon } from './icons';
import { press } from './motion-presets';
import type { BackgroundMusic } from './use-background-music';
import { useDismiss } from './use-dismiss';

/** Bridges the gap between the button and the popover so the pointer can cross it. */
const HOVER_CLOSE_DELAY_MS = 150;
const LONG_PRESS_MS = 500;

/**
 * The toolbar's one sound control. A click toggles the music; the volume slider appears on mouse
 * hover, on keyboard focus (Tab carries on from the button into the slider), or after a long-press
 * on touch. Esc hides it again until the next approach.
 */
export function SoundControl({ music }: { music: BackgroundMusic }) {
  const { playing, toggle, volume, setVolume } = music;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const groupRef = useRef<HTMLFieldSetElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const longPressed = useRef(false);
  const open = !dismissed && (hovered || focused || pinned);

  useDismiss(open, () => {
    setPinned(false);
    setDismissed(true);
  }, [groupRef]);

  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(pressTimer.current);
    },
    [],
  );

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    window.clearTimeout(hoverTimer.current);
    setDismissed(false);
    setHovered(true);
  };

  const isInGroup = (node: EventTarget | null) => node instanceof Node && !!groupRef.current?.contains(node);

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const closeSoon = () => {
      hoverTimer.current = window.setTimeout(() => setHovered(false), HOVER_CLOSE_DELAY_MS);
    };
    if (event.buttons === 0) {
      closeSoon();
      return;
    }
    // Dragging the slider past the popover's edge: wait for the release, and close only if it
    // lands outside (the range input captures the pointer, so use the release point, not target).
    document.addEventListener(
      'pointerup',
      (up) => {
        if (!isInGroup(document.elementFromPoint(up.clientX, up.clientY))) closeSoon();
      },
      { once: true },
    );
  };

  const onFocus = (event: FocusEvent) => {
    if (isInGroup(event.relatedTarget)) return;
    // Keyboard focus only: some browsers focus a tapped button, and a tap should just toggle music.
    if (!(event.target as Element).matches(':focus-visible')) return;
    setDismissed(false);
    setFocused(true);
  };

  const onBlur = (event: FocusEvent) => {
    if (!isInGroup(event.relatedTarget)) setFocused(false);
  };

  const onPressStart = (event: PointerEvent) => {
    longPressed.current = false;
    if (event.pointerType === 'mouse') return;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setDismissed(false);
      setPinned(true);
    }, LONG_PRESS_MS);
  };

  const cancelPress = () => window.clearTimeout(pressTimer.current);

  // A long-press opened the slider; the click that ends it must not also toggle the music.
  const onClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    toggle();
  };

  return (
    <fieldset
      ref={groupRef}
      className="controls__group sound"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <legend className="sr-only">Music</legend>
      <motion.button
        type="button"
        aria-pressed={playing}
        title="Music"
        onClick={onClick}
        onPointerDown={onPressStart}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(event) => event.preventDefault()}
        whileTap={press}
      >
        <SpeakerIcon muted={!playing || volume === 0} />
        <span className="sr-only">Music</span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="panel sound__popover"
            role="group"
            aria-label="Music volume"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <VolumeSlider volume={volume} onChange={setVolume} />
          </motion.div>
        )}
      </AnimatePresence>
    </fieldset>
  );
}

/** Labelled 0–100 volume range with a % readout; used by the sound popover and the settings sheet. */
export function VolumeSlider({ volume, onChange }: { volume: number; onChange: (volume: number) => void }) {
  const id = useId();
  const percent = Math.round(volume * 100);
  return (
    <div className="volume-slider">
      <label htmlFor={id}>Volume</label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
      />
      <output htmlFor={id}>{percent}%</output>
    </div>
  );
}
