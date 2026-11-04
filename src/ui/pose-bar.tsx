import { useState } from 'react';
import { listMotions } from '../data/animations';
import { characterById } from '../data/characters';
import { pick } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';

/**
 * The bar for a child under the hand: who it is, which way the lens is looking, and the way out.
 *
 * First person has nobody to watch, so the motions are not shown there at all. The bar keeps the
 * head and the two view buttons, which is also the mouse's way back to third person — hiding the
 * whole panel would leave only the V key. In third person the motions fold behind one button:
 * twenty-five clips in an always-open rail were taking the bottom of the frame. The list itself
 * is unchanged, the clips the model actually carries in the studio's catalog order.
 */
export function PoseBar() {
  const id = useAppStore((s) => (s.freeWalk ? s.possessedId : null));
  const poseClip = useAppStore((s) => s.poseClip);
  const clips = useAppStore((s) => (s.possessedId ? s.modelClips[s.possessedId] : undefined));
  const setPoseClip = useAppStore((s) => s.setPoseClip);
  const driveView = useAppStore((s) => s.driveView);
  const setDriveView = useAppStore((s) => s.setDriveView);
  // Releasing and going home are one gesture: the Escape in `FreeWalk` does the same.
  const resetView = useAppStore((s) => s.resetView);
  const [motionsOpen, setMotionsOpen] = useState(false);
  const locale = useLocale();
  const t = useT();

  const def = id ? characterById(id) : undefined;
  if (!def) return null;
  const entries = listMotions(clips ?? []);
  const short = pick(def.shortName, locale);
  const firstPerson = driveView === 'first';

  return (
    <section className={`panel pose-bar${firstPerson ? ' pose-bar--compact' : ''}`} aria-label={t('poseBar')}>
      <div className="pose-bar__head">
        <span className="swatch" style={{ background: def.color }} aria-hidden="true" />
        <b>{pick(def.name, locale)}</b>
        <button type="button" className="pose-bar__release" onClick={resetView}>
          {t('poseRelease')}
        </button>
      </div>

      <fieldset className="pose-bar__chips pose-bar__views">
        <legend className="sr-only">{t('poseView')}</legend>
        <button type="button" aria-pressed={driveView === 'first'} onClick={() => setDriveView('first')}>
          {t('poseViewFirst')}
        </button>
        <button type="button" aria-pressed={driveView === 'third'} onClick={() => setDriveView('third')}>
          {t('poseViewThird')}
        </button>
      </fieldset>

      {!firstPerson && (
        <>
          {entries.length === 0 ? (
            <p className="pose-bar__empty">{t('poseNoClips', { name: short })}</p>
          ) : (
            <>
              <button
                type="button"
                className="pose-bar__toggle"
                aria-expanded={motionsOpen}
                data-active={poseClip !== null}
                onClick={() => setMotionsOpen((open) => !open)}
              >
                {t('poseActions')}
                <span aria-hidden="true">{motionsOpen ? '▴' : '▾'}</span>
              </button>
              {motionsOpen && (
                <>
                  <fieldset className="pose-bar__chips pose-bar__actions">
                    <legend className="sr-only">{t('poseBarClips')}</legend>
                    <button type="button" aria-pressed={poseClip === null} onClick={() => setPoseClip(null)}>
                      {t('poseAuto')}
                    </button>
                    {entries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        aria-pressed={poseClip === entry.id}
                        onClick={() => setPoseClip(entry.id)}
                      >
                        {pick(entry.label, locale)}
                      </button>
                    ))}
                  </fieldset>
                  {poseClip !== null && <p className="pose-bar__note">{t('poseForced')}</p>}
                </>
              )}
            </>
          )}
          <p className="pose-bar__hint">{t('poseHint')}</p>
        </>
      )}
    </section>
  );
}
