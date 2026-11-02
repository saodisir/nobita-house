import { motion } from 'motion/react';
import { press } from './motion-presets';

interface Props {
  open: boolean;
  onToggle: () => void;
  /** id of the element holding the menus it shows and hides. */
  controls: string;
}

/** Corner button that folds every main-page menu away so the scene can be seen whole, and back. */
export function MenusToggle({ open, onToggle, controls }: Props) {
  // Fixed accessible name + aria-expanded ("Menus, expanded"); the tooltip says what a click does.
  return (
    <motion.button
      type="button"
      className="panel menus-toggle"
      aria-expanded={open}
      aria-controls={controls}
      aria-label="Menus"
      title={open ? 'Hide menus' : 'Show menus'}
      onClick={onToggle}
      whileTap={press}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor">
        {open ? (
          // Corners pointing in: collapse.
          <path
            d="M7 2.5V7H2.5M11 2.5V7h4.5M7 15.5V11H2.5M11 15.5V11h4.5"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        ) : (
          // Corners pointing out: expand.
          <path
            d="M2.5 7V2.5H7M15.5 7V2.5H11M2.5 11v4.5H7M15.5 11v4.5H11"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        )}
      </svg>
    </motion.button>
  );
}
