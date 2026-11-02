import { linkProps, studioHref } from '../router';
import { PersonIcon } from './icons';

/** The diorama's way through to the character studio page: a row in the settings sheet. */
export function StudioLink({ className }: { className: string }) {
  return (
    <a className={className} {...linkProps(studioHref())}>
      <PersonIcon />
      <span className="controls__label">Character studio</span>
      <span className="controls__arrow" aria-hidden="true">
        &rarr;
      </span>
    </a>
  );
}
