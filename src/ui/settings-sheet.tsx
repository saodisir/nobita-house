import { AnimatePresence, motion } from 'motion/react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { isSfxEnabled, setSfxEnabled } from '../audio/sfx';
import { useAppStore } from '../state/store';
import { ResetIcon } from './icons';
import { VolumeSlider } from './music-player';
import { StudioLink } from './studio-link';
import { TimeOfDayControl } from './time-control';
import type { BackgroundMusic } from './use-background-music';
import { useDismiss } from './use-dismiss';

interface Props {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The bar's settings button: presses on it don't count as outside, and Esc returns focus to it. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  music: BackgroundMusic;
  /** Phone widths, where the toolbar hands time of day and rain over to this sheet. */
  compact: boolean;
}

function SwitchRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="settings__row" role="switch" aria-checked={checked} onClick={onToggle}>
      {label}
      <span className="settings__switch" aria-hidden="true" />
    </button>
  );
}

/**
 * Everything the toolbar deliberately does not show: camera utilities, the volume, the developer
 * stats and the way to the studio. It hangs under the settings button at every width now — on
 * desktop as a popover, on phones as a sheet above the bottom bar — because the alternative was a
 * toolbar where a place to stand and an auto-rotate toggle looked equally important.
 */
export function SettingsSheet({ id, open, onClose, triggerRef, music, compact }: Props) {
  const autoRotate = useAppStore((s) => s.autoRotate);
  const toggleAutoRotate = useAppStore((s) => s.toggleAutoRotate);
  const showPerf = useAppStore((s) => s.showPerf);
  const togglePerf = useAppStore((s) => s.togglePerf);
  const raining = useAppStore((s) => s.weather === 'rain');
  const setWeather = useAppStore((s) => s.setWeather);
  // Mirrored into local state because the sfx module lives outside React; the sheet is the
  // only writer, so the mirror cannot drift.
  const [sfxOn, setSfxOn] = useState(isSfxEnabled);
  const resetView = useAppStore((s) => s.resetView);
  const sheetRef = useRef<HTMLElement>(null);

  useDismiss(
    open,
    (reason) => {
      onClose();
      if (reason === 'escape') triggerRef.current?.focus();
    },
    [sheetRef, triggerRef],
  );

  useEffect(() => {
    if (open) sheetRef.current?.querySelector<HTMLElement>('button, [type="radio"]')?.focus();
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          ref={sheetRef}
          id={id}
          className="panel settings"
          aria-label="Settings"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {compact && (
            <>
              <div className="settings__row">
                Time of day
                <TimeOfDayControl />
              </div>
              <SwitchRow
                label="Rain"
                checked={raining}
                onToggle={() => setWeather(raining ? 'clear' : 'rain')}
              />
            </>
          )}
          {/* An action, not a setting: it lands the camera back on the street, so the sheet that
              covers that view has no reason to stay open over it. */}
          <button
            type="button"
            className="settings__row"
            onClick={() => {
              resetView();
              onClose();
            }}
          >
            Reset view
            <ResetIcon />
          </button>
          <SwitchRow label="Auto-rotate" checked={autoRotate} onToggle={toggleAutoRotate} />
          <div className="settings__row">
            <VolumeSlider volume={music.volume} onChange={music.setVolume} />
          </div>
          <SwitchRow
            label="Sound effects"
            checked={sfxOn}
            onToggle={() => {
              const next = !sfxOn;
              setSfxEnabled(next);
              setSfxOn(next);
            }}
          />
          <SwitchRow label="Show performance" checked={showPerf} onToggle={togglePerf} />
          <StudioLink className="settings__row settings__link" />
        </motion.section>
      )}
    </AnimatePresence>
  );
}
