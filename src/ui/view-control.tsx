import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { type UIKey, useT } from '../i18n/use-i18n';
import { type DioramaStage, useAppStore } from '../state/store';
import { ChevronIcon } from './icons';
import { press } from './motion-presets';
import { useDismiss } from './use-dismiss';

/**
 * One button in the toolbar for the two things that change how the house is seen.
 *
 * They used to be one panel in the bottom-left corner, and the aerial secretly set the stage to
 * `2` on the way in and put it back on the way out. That made "look down at the house with its
 * roof still on" impossible, and silently undid a stage the visitor had chosen. Here they are
 * two independent controls: the aerial only moves the camera, the three detents only take the
 * house apart. A menu rather than four more buttons in the bar, which is already wide enough to
 * crowd the title card on a small laptop.
 *
 * Three detents rather than a slider, because there are three useful states and no useful
 * in-between: a house, a house with its lid off, and a house with its upper floor standing
 * beside it. Everything a slider offers between those is a half-dismantled building.
 */
const STAGES: readonly { stage: DioramaStage; label: UIKey; title: UIKey }[] = [
  { stage: 0, label: 'roofStageShut', title: 'roofShutTitle' },
  { stage: 1, label: 'roofStageRoof', title: 'roofRoofTitle' },
  { stage: 2, label: 'roofStage2F', title: 'roof2FTitle' },
];

export function ViewControl() {
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const aerial = useAppStore((s) => s.aerialView);
  const toggleAerial = useAppStore((s) => s.toggleAerial);
  const freeWalk = useAppStore((s) => s.freeWalk);
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useDismiss(
    open,
    (reason) => {
      setOpen(false);
      if (reason === 'escape') triggerRef.current?.focus();
    },
    [menuRef, triggerRef],
  );

  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [open]);

  return (
    <div className="controls__group view">
      <motion.button
        ref={triggerRef}
        type="button"
        className="view__trigger"
        aria-expanded={open}
        aria-controls={menuId}
        title={t('viewMenu')}
        onClick={() => setOpen((was) => !was)}
        whileTap={press}
      >
        <span className="view__label">{t('viewControl')}</span>
        <ChevronIcon />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            className="panel view__menu"
            role="group"
            aria-label={t('viewMenu')}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="view__aerial"
              aria-pressed={aerial}
              title={t('viewAerialTitle')}
              onClick={toggleAerial}
            >
              {t('roofAerial')}
            </button>
            <p className="view__heading">{t('viewLift')}</p>
            {/* Standing inside, the roof is a ceiling: there is nothing to lift it above. */}
            <fieldset className="view__stages" disabled={freeWalk}>
              <legend className="sr-only">{t('roofLegend')}</legend>
              {STAGES.map(({ stage: value, label, title }) => (
                <button
                  key={value}
                  type="button"
                  className="view__stage"
                  aria-pressed={stage === value}
                  title={t(title)}
                  onClick={() => setStage(value)}
                >
                  {t(label)}
                </button>
              ))}
            </fieldset>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
