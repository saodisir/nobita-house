import { motion } from 'motion/react';
import { useAppStore } from '../state/store';
import { CloseIcon } from './icons';
import { press } from './motion-presets';

/**
 * Whether the six children are out and about.
 *
 * The walk loop has been in the scene since the beginning; the button that switched it on was
 * taken out on 2026-09-13, because walk mode had no way to get a wall sitter off its seat —
 * Gian and Suneo set off with their 1.5 m coping offset still applied and hung in the air.
 * `wander.ts` fixes exactly that: a walker at speed carries no rest offset, and one that pauses
 * stands in a standing clip instead of a sit. Now that the sitters can leave the wall, the
 * switch comes back.
 *
 * Two groups, not one loop: Nobita, Doraemon and Shizuka in the yard, Gian, Suneo and Dekisugi
 * on the street. Each child runs its own lap at its own pace and stops when it likes, so the
 * two places read as two things happening at once.
 */
function CrowdIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3.9" cy="4.3" r="1.4" fill="currentColor" />
      <rect x="3.05" y="6.35" width="1.7" height="4" rx="0.85" fill="currentColor" />
      <circle cx="8" cy="3.3" r="1.6" fill="currentColor" />
      <rect x="7.05" y="5.55" width="1.9" height="4.8" rx="0.95" fill="currentColor" />
      <circle cx="12.1" cy="4.5" r="1.35" fill="currentColor" />
      <rect x="11.3" y="6.5" width="1.65" height="3.85" rx="0.82" fill="currentColor" />
    </svg>
  );
}

export function StrollControl() {
  const strolling = useAppStore((s) => s.walkMode);
  const toggle = useAppStore((s) => s.toggleWalkMode);

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={press}
      aria-pressed={strolling}
      title={strolling ? 'Call them back' : 'Let them out'}
    >
      {strolling ? <CloseIcon /> : <CrowdIcon />}
      <span className="walk__label">{strolling ? 'Back' : 'Stroll'}</span>
    </motion.button>
  );
}
