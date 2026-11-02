import { type RefObject, useEffect, useRef } from 'react';

export type DismissReason = 'escape' | 'outside';

/**
 * While `active`, calls `onDismiss` on Esc, or when a press or focus lands outside every element in
 * `refs`. Esc is caught in the document capture phase and stopped there, so window-level Esc
 * handlers (the info card) don't also fire for the same key press.
 */
export function useDismiss(
  active: boolean,
  onDismiss: (reason: DismissReason) => void,
  refs: RefObject<Element | null>[],
) {
  // Latest callback and refs without re-subscribing the listeners on every render.
  const latest = useRef({ onDismiss, refs });
  useEffect(() => {
    latest.current = { onDismiss, refs };
  });

  useEffect(() => {
    if (!active) return;
    const isInside = (target: EventTarget | null) =>
      target instanceof Node && latest.current.refs.some((ref) => ref.current?.contains(target));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      latest.current.onDismiss('escape');
    };
    const onOutside = (event: Event) => {
      if (!isInside(event.target)) latest.current.onDismiss('outside');
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
    };
  }, [active]);
}
