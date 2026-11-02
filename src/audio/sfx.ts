/**
 * Synthesized sound for the openable leaves — no audio assets, on purpose.
 *
 * A house makes three gestures and the synth has three voices: a leaf sliding in its track is
 * filtered noise whose centre sweeps up (the shff of wood past wood), a hinged door is a slower
 * lower whoosh, and the clack when a leaf seats is a struck-wood thump with a noise tick on
 * top. Ten leaves share these three sounds, so a few hundred bytes of DSP beat even the
 * smallest licensed sample, and the asset budget stays untouched.
 *
 * Everything fails soft. Browsers gate the AudioContext behind a user gesture — the toggling
 * click is one — and environments without WebAudio (tests, exotic webviews) get silence, never
 * an exception on the click path.
 */

import type { OpenMotion } from '../editor/house/build-shell';
import { prefersReducedMotion } from '../utils/reduced-motion';

/** Which voice to play. */
export type SfxName = 'slide' | 'swing' | 'clack';
/** Where in the travel the leaf is: departure or seat. */
export type SfxPhase = 'start' | 'end';

/** Modest on purpose: these accompany every click and must never startle over the music. */
const MASTER_GAIN = 0.15;

const SLIDE_SECONDS = 0.35;
const SWING_SECONDS = 0.3;

const ENABLED_KEY = 'nobita-house.sfx';

// Private-mode or blocked storage throws; the choice then simply lasts for this visit.
// (Same guard as the music preference in `use-background-music.ts`.)
function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Sound effects are on unless the visitor turned them off earlier. */
export function loadSfxEnabled(): boolean {
  return readStorage(ENABLED_KEY) !== 'off';
}

/** Persist the choice; the flag pair above is the live one, this is its storage side. */
export function saveSfxEnabled(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(ENABLED_KEY, value ? 'on' : 'off');
  } catch {
    // Nothing to do: see readStorage.
  }
}

let enabled = loadSfxEnabled();

/** Current on/off, for a settings row. */
export const isSfxEnabled = () => enabled;

const listeners = new Set<() => void>();

/** Called whenever sounds are switched on or off; returns the unsubscribe. */
export function onSfxEnabledChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Turn the sounds on or off; the choice outlives the visit where storage allows. */
export function setSfxEnabled(value: boolean): void {
  enabled = value;
  saveSfxEnabled(value);
  for (const listener of listeners) listener();
}

/**
 * Pure mapping — which voice a leaf's motion and travel phase call for. Every arrival clacks
 * regardless of how the leaf got there; only the departure differs between slide and swing.
 */
export const sfxForToggle = (motion: OpenMotion, phase: SfxPhase): SfxName =>
  phase === 'end' ? 'clack' : motion.kind === 'slide' ? 'slide' : 'swing';

// --- the synth ---

/** The lazily built context plus everything shared by the voices, rain included. */
export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  /** One second of white noise, built once and shared by every noise voice. */
  noise: AudioBuffer;
}

let graph: AudioGraph | null = null;

/** The one AudioContext of the page, built on first use; null without WebAudio. */
export function ensureGraph(): AudioGraph | null {
  if (graph) return graph;
  // Safari still only exposes the constructor under its old name.
  const scopes = globalThis as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor = scopes.AudioContext ?? scopes.webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  graph = { ctx, master, noise };
  return graph;
}

/** ±`amount` around `value`: keeps repeats from sounding like the same sample replayed. */
const vary = (value: number, amount: number) => value * (1 + (Math.random() * 2 - 1) * amount);

/** Soft filtered-noise sweep: the shff of a fusuma, the drawer, the oshiire leaf. */
function playSlide(g: AudioGraph, t: number): void {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const filter = g.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(vary(420, 0.25), t);
  filter.frequency.exponentialRampToValueAtTime(vary(1900, 0.2), t + SLIDE_SECONDS);
  const gain = g.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vary(0.8, 0.15), t + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + SLIDE_SECONDS);
  src.connect(filter).connect(gain).connect(g.master);
  src.start(t);
  src.stop(t + SLIDE_SECONDS + 0.02);
}

/** Low airy whoosh: a hinged leaf pushing air for the length of its swing. */
function playSwing(g: AudioGraph, t: number): void {
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const filter = g.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.9;
  // Up as the leaf accelerates past the ear, back down as it settles against the wall.
  filter.frequency.setValueAtTime(vary(140, 0.2), t);
  filter.frequency.exponentialRampToValueAtTime(vary(700, 0.25), t + SWING_SECONDS * 0.4);
  filter.frequency.exponentialRampToValueAtTime(vary(200, 0.2), t + SWING_SECONDS);
  const gain = g.ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vary(0.9, 0.15), t + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + SWING_SECONDS);
  src.connect(filter).connect(gain).connect(g.master);
  src.start(t);
  src.stop(t + SWING_SECONDS + 0.02);
}

/** Short wood knock: the leaf seating at the end of its travel. */
function playClack(g: AudioGraph, t: number): void {
  // The thump: a triangle whose pitch falls away, like a struck plank.
  const osc = g.ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(vary(220, 0.12), t);
  osc.frequency.exponentialRampToValueAtTime(88, t + 0.07);
  const thump = g.ctx.createGain();
  thump.gain.setValueAtTime(1, t);
  thump.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(thump).connect(g.master);
  osc.start(t);
  osc.stop(t + 0.09);
  // The tick on top: a sliver of bright noise that makes the thump read as wood, not drum.
  const src = g.ctx.createBufferSource();
  src.buffer = g.noise;
  const filter = g.ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2200;
  const tick = g.ctx.createGain();
  tick.gain.setValueAtTime(vary(0.35, 0.2), t);
  tick.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
  src.connect(filter).connect(tick).connect(g.master);
  src.start(t);
  src.stop(t + 0.03);
}

/**
 * Play the sound for a leaf's motion at the given moment of its travel.
 * Silent no-op when the visitor turned sounds off, asked the OS for reduced motion, or the
 * environment has no WebAudio at all.
 */
export function playOpenSfx(motion: OpenMotion, phase: SfxPhase): void {
  if (!enabled) return;
  try {
    // A one-shot read is the project's convention for event paths (see `reduced-motion.ts`):
    // sounds are skipped entirely under reduced motion, arrivals included.
    if (prefersReducedMotion()) return;
    const g = ensureGraph();
    if (!g) return;
    // Safari starts suspended even after a gesture until resume() is asked for.
    if (g.ctx.state === 'suspended') void g.ctx.resume().catch(() => {});
    const t = g.ctx.currentTime + 0.01;
    const name = sfxForToggle(motion, phase);
    if (name === 'slide') playSlide(g, t);
    else if (name === 'swing') playSwing(g, t);
    else playClack(g, t);
  } catch {
    // A failed voice pool or missing constructor: silence beats an exception on a click.
  }
}
