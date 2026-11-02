import { motion } from 'motion/react';
import { timesOfDay } from '../data/time-of-day';
import { useAppStore } from '../state/store';
import { RainIcon, TimeOfDayIcon } from './icons';
import { press } from './motion-presets';

/**
 * Which light the house stands in. Icons only, everywhere: four labelled presets made time of day
 * the widest thing in the toolbar, which is the wrong weight for a look-and-feel setting. The
 * names stay for screen readers and as tooltips.
 *
 * Real radios, not toggle buttons: exactly one time of day is active, and arrow-key navigation
 * between them comes for free. The input is visually hidden and one shared-layout chip slides
 * behind whichever is checked.
 */
export function TimeOfDayControl() {
  const timeOfDay = useAppStore((s) => s.timeOfDay);
  const setTimeOfDay = useAppStore((s) => s.setTimeOfDay);
  return (
    <fieldset className="controls__group controls__segmented controls__times">
      <legend className="sr-only">Time of day</legend>
      {timesOfDay.map((preset) => (
        <label key={preset.id} data-time={preset.id} title={preset.label}>
          <input
            type="radio"
            name="time-of-day"
            value={preset.id}
            checked={timeOfDay === preset.id}
            onChange={() => setTimeOfDay(preset.id)}
          />
          <span className="controls__segment">
            <TimeOfDayIcon id={preset.id} />
            <span className="sr-only">{preset.label}</span>
          </span>
          {timeOfDay === preset.id && (
            <motion.span
              className="controls__chip"
              // Radius set through motion (not CSS) so it stays round while the chip stretches.
              layoutId="time-of-day-chip"
              style={{ borderRadius: 10 }}
              transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              aria-hidden="true"
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Rain on or off, laid over whichever time of day is selected. A toggle rather than a fifth
 * segment: weather is not a time of day, and a rainy night is still night.
 */
export function RainToggle() {
  const raining = useAppStore((s) => s.weather === 'rain');
  const setWeather = useAppStore((s) => s.setWeather);
  return (
    <motion.button
      type="button"
      aria-pressed={raining}
      title="Rain"
      onClick={() => setWeather(raining ? 'clear' : 'rain')}
      whileTap={press}
    >
      <RainIcon />
      <span className="sr-only">Rain</span>
    </motion.button>
  );
}
