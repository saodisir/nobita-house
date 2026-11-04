import { listMotions } from '../data/animations';
import { characterById } from '../data/characters';
import { pick } from '../i18n/locale';
import { useLocale, useT } from '../i18n/use-i18n';
import { useAppStore } from '../state/store';

/**
 * The bar for a child under the hand: who it is, which of its own motions it should hold, and the
 * way out.
 *
 * The motions are the ones the model actually carries — read off the GLB by `character.tsx` into
 * `modelClips` — listed in the studio's catalog order. Same list, same names, same catalog as
 * `Character studio`: the studio is where you go to see a clip on a turntable, and this is where
 * you put it on a child walking down the pavement.
 */
export function PoseBar() {
  const id = useAppStore((s) => s.possessedId);
  const poseClip = useAppStore((s) => s.poseClip);
  const clips = useAppStore((s) => (s.possessedId ? s.modelClips[s.possessedId] : undefined));
  const setPoseClip = useAppStore((s) => s.setPoseClip);
  // Releasing and going home are one gesture: see `PossessKeys` for the Escape that does the same.
  const resetView = useAppStore((s) => s.resetView);
  const locale = useLocale();
  const t = useT();

  const def = id ? characterById(id) : undefined;
  if (!def) return null;
  const entries = listMotions(clips ?? []);
  const short = pick(def.shortName, locale);

  return (
    <section className="panel pose-bar" aria-label={t('poseBar')}>
      <div className="pose-bar__head">
        <span className="swatch" style={{ background: def.color }} aria-hidden="true" />
        <b>{pick(def.name, locale)}</b>
        <button type="button" className="pose-bar__release" onClick={resetView}>
          {t('poseRelease')}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="pose-bar__empty">{t('poseNoClips', { name: short })}</p>
      ) : (
        <>
          <fieldset className="pose-bar__chips">
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

      <p className="pose-bar__hint">{t('poseHint')}</p>
    </section>
  );
}
