import { motion } from 'motion/react';
import { type UIKey, useT } from '../i18n/use-i18n';
import { type DioramaStage, useAppStore } from '../state/store';

/**
 * Taking the house apart — and standing where you can see into it.
 *
 * The house is a diorama: from the street its best rooms are behind a roof. Lifting the roof
 * alone does nothing, though, and that was the first version's mistake: the lid only moves up, so
 * from above it covers the same floor it always did, and the orbit's own drag cannot put the eye
 * over the house anyway (a drag raises the camera but leaves the target on the pavement outside
 * the gate). Both halves are needed, so the button does both.
 *
 * Three detents rather than a slider, because there are three useful states and no useful
 * in-between: a house, a house with its lid off, and a house with its upper floor standing
 * beside it. Everything a slider offers between those is a half-dismantled building.
 *
 * The two steps are not the same size of job. `1` only takes the lid off, which shows the
 * upstairs rooms. `2` also slides the upper floor out — that one is the whole point, because the
 * upper floor's slab is the ground floor's ceiling, so without it the ground floor stays sealed
 * however high the roof goes.
 */
const STAGES: readonly { stage: DioramaStage; label: UIKey; title: UIKey }[] = [
  { stage: 0, label: 'roofStageShut', title: 'roofShutTitle' },
  { stage: 1, label: 'roofStageRoof', title: 'roofRoofTitle' },
  { stage: 2, label: 'roofStage2F', title: 'roof2FTitle' },
];

export function RoofControl() {
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const aerial = useAppStore((s) => s.aerialView);
  const toggleAerial = useAppStore((s) => s.toggleAerial);
  const freeWalk = useAppStore((s) => s.freeWalk);
  const t = useT();
  // Standing inside, the roof is a ceiling: there is nothing to lift it above.
  if (freeWalk) return null;
  return (
    <motion.div className="panel roof" initial={false}>
      {/* The whole house, taken apart — read out once, from the fieldset's legend, not twice. */}
      <span className="roof__label" aria-hidden="true">
        {t('roofLift')}
      </span>
      <fieldset className="roof__stages">
        <legend className="sr-only">{t('roofLegend')}</legend>
        {STAGES.map(({ stage: value, label, title }) => (
          <button
            key={value}
            type="button"
            className="roof__stage"
            aria-pressed={stage === value}
            title={t(title)}
            onClick={() => setStage(value)}
          >
            {t(label)}
          </button>
        ))}
      </fieldset>
      <button
        type="button"
        className="roof__aerial"
        aria-pressed={aerial}
        onClick={toggleAerial}
        title={t(aerial ? 'walkOutTitle' : 'roofAerialTitle')}
      >
        {t('roofAerial')}
      </button>
    </motion.div>
  );
}
