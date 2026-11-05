/**
 * The story's two pieces of chrome: a button to start it, and a fixed dialogue box.
 *
 * The box sits at the bottom of the screen, not over a character's head. A head-anchored
 * bubble has to solve occlusion, two people talking at once and scale at every camera
 * distance; a fixed box solves the actual job — showing who says what — and stays readable
 * on a phone. There is deliberately no pause, skip or click-to-continue: once the button is
 * pressed the story plays to the end, and the button comes back when it is over.
 *
 * Each line fades in on its own because the box is keyed by beat. There is no fade out: the
 * story ends on a line and that line should be gone the instant it is over, not held for a
 * quarter of a second by an exit animation that a slow renderer cannot get a frame for.
 *
 * The launch button is a plain button over a solid paper fill. It is small, sits against the
 * sky and changes only once per story, so it needs neither a blurred panel nor an animated
 * layer: CSS :active is enough for the press.
 */
import { motion } from 'motion/react';
import { characters } from '../data/characters';
import { pick, useLocale, useT } from '../i18n/use-i18n';
import { useStoryStore } from '../state/story';

export function StoryChrome() {
  const status = useStoryStore((s) => s.status);
  const speech = useStoryStore((s) => s.speech);
  const locale = useLocale();
  const t = useT();
  const speaker = speech ? characters.find((def) => def.id === speech.who) : undefined;

  return (
    <>
      {status !== 'playing' && (
        <button
          type="button"
          className="story-launch"
          onClick={() => useStoryStore.getState().startStory()}
          title={t(status === 'done' ? 'storyReplay' : 'storyPlay')}
        >
          {t(status === 'done' ? 'storyReplay' : 'storyPlay')}
        </button>
      )}
      {status === 'playing' && speech && speaker && (
        <motion.div
          key={speech.token}
          className="story-dialog panel"
          role="status"
          aria-label={t('storyDialog')}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="story-dialog__who" style={{ color: speaker.color }}>
            {pick(speaker.shortName, locale)}
          </span>
          <p className="story-dialog__line">{pick(speech.line, locale)}</p>
        </motion.div>
      )}
    </>
  );
}
