/**
 * The sound of the rain, synthesized like the leaf sounds in `sfx.ts` — no audio asset.
 *
 * Three layers over one bus: a hiss (band-limited noise, the shower as a whole), a low rumble
 * (the same noise under 350 Hz, rain drumming on the roofs around), and a patter (a pre-baked
 * buffer of sparse, randomly loud clicks through a band-pass, the near drops hitting the
 * ground). The noise buffers are several seconds long and start at random offsets so their
 * loops never line up into an audible rhythm.
 *
 * The rain follows the weather and the "Sound effects" switch, fading in and out with the
 * sky. Indoors the whole bus is low-passed and turned down: rain heard through the walls.
 */

import { useAppStore } from '../state/store';
import { type AudioGraph, ensureGraph, isSfxEnabled, onSfxEnabledChange } from './sfx';

/** Loudness of a full shower outdoors. Ambience: under the music, over silence. */
const RAIN_GAIN = 0.07;
/** Indoors: how much quieter, and the low-pass the walls and windows apply. */
const INDOOR_GAIN = 0.55;
const INDOOR_CUTOFF = 900;
const OUTDOOR_CUTOFF = 16000;
/** Time constant of the fades, seconds; about the sky's own easing. */
const FADE_SECONDS = 0.6;
const HISS_SECONDS = 4;
const PATTER_SECONDS = 5;
/** Drops per second in the patter layer. */
const PATTER_RATE = 140;

interface RainVoice {
  ctx: AudioContext;
  out: GainNode;
  muffle: BiquadFilterNode;
}

let voice: RainVoice | null = null;

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * Sparse drops: each a 2–6 ms burst of noise with an exponential tail, most soft and a few
 * loud (amplitude squared), scattered at random through the buffer.
 */
function patterBuffer(ctx: BaseAudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.round(rate * PATTER_SECONDS), rate);
  const data = buffer.getChannelData(0);
  for (let n = 0; n < PATTER_RATE * PATTER_SECONDS; n++) {
    const start = Math.floor(Math.random() * data.length);
    const length = Math.floor(rate * (0.002 + Math.random() * 0.004));
    const loudness = Math.random() ** 2;
    for (let i = 0; i < length && start + i < data.length; i++) {
      data[start + i] =
        (data[start + i] ?? 0) + (Math.random() * 2 - 1) * loudness * Math.exp((-5 * i) / length);
    }
  }
  return buffer;
}

function biquad(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

/**
 * One layer: a looping source, started at a random point of its loop, through a filter chain
 * from `input` to `output`, at `gain` into the bus.
 */
function loop(
  ctx: AudioContext,
  buffer: AudioBuffer,
  input: AudioNode,
  output: AudioNode,
  gain: number,
  bus: AudioNode,
) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const level = ctx.createGain();
  level.gain.value = gain;
  source.connect(input);
  output.connect(level).connect(bus);
  source.start(0, Math.random() * buffer.duration);
}

function buildVoice({ ctx }: AudioGraph): RainVoice {
  const muffle = biquad(ctx, 'lowpass', OUTDOOR_CUTOFF);
  const out = ctx.createGain();
  out.gain.value = 0;
  muffle.connect(out).connect(ctx.destination);

  const hiss = noiseBuffer(ctx, HISS_SECONDS);
  const hissHigh = biquad(ctx, 'highpass', 450);
  const hissLow = biquad(ctx, 'lowpass', 7000);
  hissHigh.connect(hissLow);
  loop(ctx, hiss, hissHigh, hissLow, 0.5, muffle);
  const rumble = biquad(ctx, 'lowpass', 350);
  loop(ctx, hiss, rumble, rumble, 0.8, muffle);
  const patter = biquad(ctx, 'bandpass', 2600, 0.8);
  loop(ctx, patterBuffer(ctx), patter, patter, 0.9, muffle);
  return { ctx, out, muffle };
}

/** Brings the rain's loudness and muffling in line with the weather, the room and the switch. */
function sync() {
  const { weather, activeRoomId } = useAppStore.getState();
  const level = weather === 'rain' && isSfxEnabled() ? 1 : 0;
  // Nothing is built until it first rains with sound on: dry visits never open a context.
  if (!voice && level === 0) return;
  try {
    const graph = ensureGraph();
    if (!graph) return;
    // The toggling click is the gesture that lets a suspended context start.
    if (graph.ctx.state === 'suspended') void graph.ctx.resume().catch(() => {});
    voice ??= buildVoice(graph);
    const indoors = activeRoomId !== null;
    const now = graph.ctx.currentTime;
    voice.out.gain.setTargetAtTime(level * RAIN_GAIN * (indoors ? INDOOR_GAIN : 1), now, FADE_SECONDS);
    voice.muffle.frequency.setTargetAtTime(indoors ? INDOOR_CUTOFF : OUTDOOR_CUTOFF, now, 0.3);
  } catch {
    // No WebAudio worth the name: the rain falls silently.
  }
}

/** Starts following the weather; returns the teardown, which also fades the rain out. */
export function startRainSound(): () => void {
  sync();
  const unsubscribeStore = useAppStore.subscribe((state, previous) => {
    if (state.weather !== previous.weather || state.activeRoomId !== previous.activeRoomId) sync();
  });
  const unsubscribeSwitch = onSfxEnabledChange(sync);
  return () => {
    unsubscribeStore();
    unsubscribeSwitch();
    voice?.out.gain.setTargetAtTime(0, voice.ctx.currentTime, 0.1);
  };
}
