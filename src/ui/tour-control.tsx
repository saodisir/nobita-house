import { motion } from 'motion/react';
import { roomById } from '../data/rooms';
import { tourStops } from '../data/tour';
import { pick } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
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
  const locale = useLocale();
  const t = useT();

  if (tourIndex === null) {
    return (
      <motion.button type="button" onClick={startTour} whileTap={press} title={t('tourStartTitle')}>
        <PlayIcon />
        <span className="tour__start">{t('tourStart')}</span>
      </motion.button>
    );
  }

  const stop = tourStops[tourIndex];
  const room = stop?.roomId ? roomById(stop.roomId) : undefined;
  const name = room ? pick(room.shortName, locale) : t('placeStreet');
  const last = tourStops.length - 1;

  return (
    <fieldset className="controls__group tour" aria-label={t('tourGroup')}>
      <motion.button
        type="button"
        aria-label={t('tourPrevious')}
        title={t('tourPrevious')}
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
        aria-label={t('tourNext')}
        title={t('tourNext')}
        disabled={tourIndex === last}
        onClick={() => tourGo(1)}
        whileTap={press}
      >
        <ChevronRightIcon />
      </motion.button>
      <motion.button
        type="button"
        aria-label={t('tourExit')}
        title={t('tourExit')}
        onClick={exitTour}
        whileTap={press}
      >
        <CloseIcon />
      </motion.button>
    </fieldset>
  );
}
