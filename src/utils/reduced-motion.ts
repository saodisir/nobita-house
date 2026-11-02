import { useEffect, useRef } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** One-shot read, for code paths that run on an event rather than every frame. */
export const prefersReducedMotion = () => window.matchMedia(QUERY).matches;

/**
 * Live preference for per-frame code: returns a ref so reading it costs nothing, and updates
 * if the OS setting changes mid-session. Previously each animation hook kept its own copy,
 * captured once at mount.
 */
export function useReducedMotionRef() {
  const reduced = useRef(prefersReducedMotion());
  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const onChange = () => {
      reduced.current = query.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
