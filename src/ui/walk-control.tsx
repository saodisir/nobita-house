import { motion } from 'motion/react';
import { useAppStore } from '../state/store';
import { CloseIcon } from './icons';
import { press } from './motion-presets';

/**
 * In and out of walking.
 *
 * One button, because the mode has no sub-state: pressing it drops you at the gate on your own
 * feet, pressing it again puts you back on the street with the orbit.
 *
 * The glyph is a pair of footprints rather than a person: the toolbar already uses a person for
 * the character roster, and this button moves the visitor, not Nobita.
 */
function FootstepsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <ellipse cx="5.6" cy="5" rx="1.7" ry="2.6" fill="currentColor" />
      <ellipse cx="10.4" cy="11" rx="1.7" ry="2.6" fill="currentColor" />
      <rect x="4.4" y="8.4" width="2.4" height="1.2" rx="0.6" fill="currentColor" />
      <rect x="9.2" y="14.4" width="2.4" height="1.2" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function WalkControl() {
  const freeWalk = useAppStore((s) => s.freeWalk);
  const toggle = useAppStore((s) => s.toggleFreeWalk);

  return (
    <motion.button
      type="button"
      onClick={toggle}
      whileTap={press}
      aria-pressed={freeWalk}
      title={freeWalk ? 'Back to the street' : 'Walk the house'}
    >
      {freeWalk ? <CloseIcon /> : <FootstepsIcon />}
      <span className="walk__label">{freeWalk ? 'Exit' : 'Walk'}</span>
    </motion.button>
  );
}
