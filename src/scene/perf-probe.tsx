import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { usePerfStore } from '../state/perf-store';

/** Length of one averaging window. Short enough to feel live, long enough to read. */
const WINDOW_MS = 500;
/** A gap this long means the tab was hidden and rAF paused, not a slow frame. */
const PAUSE_MS = 1000;

/**
 * Measures real frame pacing with `performance.now()` between frames and publishes one
 * averaged sample per window to `usePerfStore`, so the DOM panel re-renders twice a second
 * rather than every frame. Draw calls and triangles come from `renderer.info`, which three
 * resets at the start of each render; read here, before this frame renders, it holds the
 * totals of the previous frame, shadow passes included.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const publish = usePerfStore((s) => s.publish);
  const span = useRef({ start: 0, last: 0, frames: 0, worst: 0 });

  useFrame(() => {
    const now = performance.now();
    const w = span.current;
    const gap = now - w.last;
    if (w.start === 0 || gap > PAUSE_MS) {
      Object.assign(w, { start: now, last: now, frames: 0, worst: 0 });
      return;
    }
    w.last = now;
    w.frames += 1;
    w.worst = Math.max(w.worst, gap);
    const elapsed = now - w.start;
    if (elapsed < WINDOW_MS) return;
    publish({
      fps: (w.frames * 1000) / elapsed,
      frameMs: elapsed / w.frames,
      worstMs: w.worst,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
    });
    Object.assign(w, { start: now, frames: 0, worst: 0 });
  });

  return null;
}
