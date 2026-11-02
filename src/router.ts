import { useSyncExternalStore } from 'react';

/**
 * Three pages, no router library: the diorama at `/`, the character studio at
 * `/characters/<id>` and the house editor at `/editor`. `parseRoute` is pure so it can be
 * tested without a DOM; everything else is a thin wrapper over the history API.
 */
export type Route = { page: 'diorama' } | { page: 'studio'; characterId: string | null } | { page: 'editor' };

const STUDIO_SEGMENT = 'characters';
const EDITOR_SEGMENT = 'editor';

export function parseRoute(pathname: string): Route {
  const [head, id, ...rest] = pathname.split('/').filter(Boolean);
  if (head === EDITOR_SEGMENT && id === undefined) return { page: 'editor' };
  // Anything deeper than /characters/<id> is not a route this app owns.
  if (head !== STUDIO_SEGMENT || rest.length > 0) return { page: 'diorama' };
  return { page: 'studio', characterId: id ?? null };
}

export const dioramaHref = '/';
export const studioHref = (id?: string) => (id ? `/${STUDIO_SEGMENT}/${id}` : `/${STUDIO_SEGMENT}`);
export const editorHref = `/${EDITOR_SEGMENT}`;

const listeners = new Set<() => void>();

/** `popstate` does not fire for pushState, so navigations notify the subscribers directly. */
export function navigate(href: string, replace = false) {
  if (href === window.location.pathname) return;
  window.history[replace ? 'replaceState' : 'pushState'](null, '', href);
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => dioramaHref,
  );
  return parseRoute(pathname);
}

/** Click handler for in-app links: keeps the href real (middle-click, copy link) but no reload. */
export function linkProps(href: string) {
  return {
    href,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(href);
    },
  };
}
