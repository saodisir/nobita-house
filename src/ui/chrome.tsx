import { MotionConfig, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { startRainSound } from '../audio/rain-sound';
import { config } from '../config';
import { characters } from '../data/characters';
import { roomById } from '../data/rooms';
import { usePerfStore } from '../state/perf-store';
import { useAppStore } from '../state/store';
import { SlidersIcon } from './icons';
import { press } from './motion-presets';
import { SoundControl } from './music-player';
import { PlaceControl } from './place-control';
import { RoomViewPicker } from './room-view-picker';
import { SettingsSheet } from './settings-sheet';
import { StrollControl } from './stroll-control';
import { RainToggle, TimeOfDayControl } from './time-control';
import { TourControl } from './tour-control';
import { useBackgroundMusic } from './use-background-music';
import { useMediaQuery } from './use-media-query';
import { WalkControl } from './walk-control';

/** Below this the toolbar has room for the place control and little else. */
export const COMPACT_QUERY = '(max-width: 767px)';

/** The house, and — once you are inside it — which room you are standing in, and where in it. */
export function Title() {
  const activeRoomId = useAppStore((s) => s.activeRoomId);
  const room = activeRoomId ? roomById(activeRoomId) : undefined;
  return (
    <header className="panel title">
      <h1>Nobita&rsquo;s House</h1>
      {room ? (
        <p className="title__place">
          {room.name}
          <span className="title__jp" lang="ja">
            {room.kana}
          </span>
        </p>
      ) : (
        <p>Doraemon &middot; 3D diorama</p>
      )}
      <RoomViewPicker />
    </header>
  );
}

/**
 * The one menu. Three groups in falling order of weight: where you are, what the light is like,
 * and — behind the settings button — everything that is neither. Flattening all of it into one
 * row of equal buttons is what made the old bar 866px of undifferentiated chrome.
 *
 * On a phone only the place control and the sound button stay out; time of day and rain move
 * into the sheet, which is why that swap is a media *query* and not `display: none` (see `useMediaQuery`).
 */
export function ViewControls() {
  // Owned here, not in the sound button, so the bar's button and the settings sheet share one track.
  const music = useBackgroundMusic(config.music.src, config.music.volume);
  // The rain's sound lives with the music: both belong to the diorama, not to the studio.
  useEffect(startRainSound, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const settingsId = useId();
  const compact = useMediaQuery(COMPACT_QUERY);
  // The stroll switch is back (2026-11-02): a walker now drops its rest offset at speed, so
  // the wall sitters come down off the coping instead of hanging in the air — the reason the
  // button was pulled on 2026-09-13.
  // reducedMotion="user": under prefers-reduced-motion the chip and press transforms jump, fades stay.
  return (
    <MotionConfig reducedMotion="user">
      <div className="panel controls" role="toolbar" aria-label="View">
        <PlaceControl />
        <div className="controls__divider" aria-hidden="true" />
        <TourControl />
        <div className="controls__divider" aria-hidden="true" />
        <WalkControl />
        <StrollControl />
        <div className="controls__divider" aria-hidden="true" />
        {!compact && (
          <>
            <TimeOfDayControl />
            <RainToggle />
            <div className="controls__divider" aria-hidden="true" />
          </>
        )}
        <SoundControl music={music} />
        <motion.button
          ref={settingsRef}
          type="button"
          aria-label="Settings"
          title="Settings"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={() => setSettingsOpen((open) => !open)}
          whileTap={press}
        >
          <SlidersIcon />
        </motion.button>
      </div>
      <SettingsSheet
        id={settingsId}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        triggerRef={settingsRef}
        music={music}
        compact={compact}
      />
    </MotionConfig>
  );
}

/** Always-present list of characters: the keyboard and screen-reader path to the same interaction as clicking a model. */
export function Roster() {
  const selectedId = useAppStore((s) => s.selectedCharacterId);
  const select = useAppStore((s) => s.select);
  return (
    <nav className="panel roster" aria-label="Characters">
      {characters.map((c) => (
        <button
          key={c.id}
          type="button"
          data-id={c.id}
          aria-current={selectedId === c.id ? 'true' : undefined}
          onClick={() => select(selectedId === c.id ? null : c.id)}
        >
          <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
          {c.shortName}
        </button>
      ))}
    </nav>
  );
}

/** 60 Hz with a little slack is smooth; under 30 is visibly choppy. */
const fpsTier = (fps: number) => (fps >= 55 ? 'good' : fps >= 30 ? 'fair' : 'poor');

const formatCount = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;

/**
 * Live render stats under the title. Not a live region: announcing a number that changes
 * twice a second would drown a screen reader.
 */
export function PerfStats() {
  const sample = usePerfStore((s) => s.sample);
  const dash = '—';
  return (
    <section className="panel perf" aria-label="Performance">
      <p className="perf__fps" data-tier={sample ? fpsTier(sample.fps) : undefined}>
        <span className="perf__dot" aria-hidden="true" />
        <b>{sample ? Math.round(sample.fps) : dash}</b> FPS
      </p>
      <dl className="perf__grid">
        <div>
          <dt>Frame</dt>
          <dd>{sample ? `${sample.frameMs.toFixed(1)} ms` : dash}</dd>
        </div>
        <div>
          <dt>Worst</dt>
          <dd>{sample ? `${sample.worstMs.toFixed(1)} ms` : dash}</dd>
        </div>
        <div>
          <dt>Draws</dt>
          <dd>{sample ? sample.calls : dash}</dd>
        </div>
        <div>
          <dt>Tris</dt>
          <dd>{sample ? formatCount(sample.triangles) : dash}</dd>
        </div>
      </dl>
    </section>
  );
}
