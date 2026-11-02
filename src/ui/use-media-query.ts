import { useCallback, useSyncExternalStore } from 'react';

/** One `MediaQueryList` per query, shared by every caller: they are cheap but not free. */
const lists = new Map<string, MediaQueryList>();

function listFor(query: string): MediaQueryList {
  let list = lists.get(query);
  if (!list) {
    list = window.matchMedia(query);
    lists.set(query, list);
  }
  return list;
}

/**
 * Whether a CSS media query currently matches, as React state.
 *
 * Used where CSS alone cannot decide: a control that must live in the toolbar on desktop and in
 * the settings sheet on a phone has to be *rendered* in one place only — hiding a second copy
 * with `display: none` would put two elements with the same motion `layoutId` and the same radio
 * `name` in the document at once.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = listFor(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => listFor(query).matches,
    () => false,
  );
}
