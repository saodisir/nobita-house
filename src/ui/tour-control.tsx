import { motion } from 'motion/react';
import { roomById } from '../data/rooms';
import { tourStops } from '../data/tour';
import { useAppStore } from '../state/store';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlayIcon } from './icons';
import { press } from './motion-presets';

/**
 * The guided tour. One button while it is off; a stepper while it runs — prev, the stop
 * name and counter, next, and a way out. The camera work is the store's `tourGo`, which
 * calls the same `enterRoom`/`leaveRoom` the place menu uses, so a tour leg is
 * indistinguishable from a menu jump.
 */
export function TourControl() {
  const tourIndex = useAppStore((s) => s.tourIndex);
  const startTour = useAppStore((s) => s.startTour);
  const tourGo = useAppStore((s) => s.tourGo);
  const exitTour = useAppStore((s) => s.exitTour);

  if (tourIndex === null) {
    return (
      <motion.button type="button" onClick={startTour} whileTap={press} title="Tour the house">
        <PlayIcon />
        <span className="tour__start">Tour</span>
      </motion.button>
    );
  }

  const stop = tourStops[tourIndex];
  const name = (stop?.roomId ? roomById(stop.roomId)?.shortName : undefined) ?? 'Street';
  const last = tourStops.length - 1;

  return (
    <fieldset className="controls__group tour" aria-label="House tour">
      <motion.button
        type="button"
        aria-label="Previous stop"
        title="Previous stop"
        disabled={tourIndex === 0}
        onClick={() => tourGo(-1)}
        whileTap={press}
      >
        <ChevronLeftIcon />
      </motion.button>
      <span className="tour__label" aria-live="polite">
        <span className="tour__stop">{name}</span>
        <span className="tour__count">
          {tourIndex + 1} / {tourStops.length}
        </span>
      </span>
      <motion.button
        type="button"
        aria-label="Next stop"
        title="Next stop"
        disabled={tourIndex === last}
        onClick={() => tourGo(1)}
        whileTap={press}
      >
        <ChevronRightIcon />
      </motion.button>
      <motion.button
        type="button"
        aria-label="Exit tour"
        title="Exit tour"
        onClick={exitTour}
        whileTap={press}
      >
        <CloseIcon />
      </motion.button>
    </fieldset>
  );
}
