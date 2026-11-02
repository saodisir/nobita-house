import { create } from 'zustand';

/** One averaged window of render performance, published by `PerfProbe` inside the canvas. */
export interface PerfSample {
  fps: number;
  /** Mean time between frames over the window, ms. */
  frameMs: number;
  /** Longest single frame in the window, ms: the hitch a mean hides. */
  worstMs: number;
  /** Draw calls and triangles of the last frame, shadow passes included. */
  calls: number;
  triangles: number;
}

interface PerfState {
  /** Null until the first window closes. */
  sample: PerfSample | null;
  publish: (sample: PerfSample) => void;
}

/**
 * Kept apart from the app store: it updates twice a second, and only the stats panel
 * subscribes, so nothing else re-renders on a sample.
 */
export const usePerfStore = create<PerfState>((set) => ({
  sample: null,
  publish: (sample) => set({ sample }),
}));
