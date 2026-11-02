import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, Vector3 } from 'three';
import { type TimeOfDayPreset, timeOfDayById } from '../data/time-of-day';
import { withWeather } from '../data/weather';
import { useAppStore } from '../state/store';
import { useReducedMotionRef } from '../utils/reduced-motion';

/** Seconds for a preset change to land: long enough to read as a sweep, short enough to feel responsive. */
const EASE_SECONDS = 1.4;

/** Every value the scene eases between. Mutated in place; never triggers a React render. */
export interface TimeOfDayState {
  sun: Vector3;
  zenith: Color;
  glowColor: Color;
  glowStrength: number;
  discColor: Color;
  discStrength: number;
  cloudTint: Color;
  cloudOpacity: number;
  mistOpacity: number;
  keyColor: Color;
  keyIntensity: number;
  fillColor: Color;
  fillIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  fogColor: Color;
  fogNear: number;
  fogFar: number;
  lampLevel: number;
  starOpacity: number;
  /** Separate from the stars since rain grounds the fireflies but a clear night keeps both. */
  fireflyOpacity: number;
  /** 0 = dry, 1 = full shower; drives the rain streaks. */
  rain: number;
}

function stateFrom(preset: TimeOfDayPreset): TimeOfDayState {
  return {
    sun: new Vector3(...preset.sun),
    zenith: new Color(preset.zenith),
    glowColor: new Color(preset.sunGlow.color),
    glowStrength: preset.sunGlow.strength,
    discColor: new Color(preset.sunDisc.color),
    discStrength: preset.sunDisc.strength,
    cloudTint: new Color(preset.clouds.tint),
    cloudOpacity: preset.clouds.opacity,
    mistOpacity: preset.mist,
    keyColor: new Color(preset.key.color),
    keyIntensity: preset.key.intensity,
    fillColor: new Color(preset.fill.color),
    fillIntensity: preset.fill.intensity,
    hemiSky: new Color(preset.hemisphere.sky),
    hemiGround: new Color(preset.hemisphere.ground),
    hemiIntensity: preset.hemisphere.intensity,
    fogColor: new Color(preset.fog.color),
    fogNear: preset.fog.near,
    fogFar: preset.fog.far,
    lampLevel: preset.lampLevel,
    starOpacity: preset.stars ? 1 : 0,
    fireflyOpacity: preset.fireflies ? 1 : 0,
    rain: preset.rain,
  };
}

// Scratch instances reused every frame; the easing runs on every frame of the app's life.
const scratchVector = new Vector3();
const scratchColor = new Color();

const approach = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * Drives the whole scene's time of day and weather. Call this **once**, in `Scene`, and pass the result
 * down: each call installs its own `useFrame`, so calling it per consumer would ease several
 * independent copies of the same state.
 *
 * Runs at priority -1 so it updates before the consumers that read it. R3F only hands the
 * render loop over for priority > 0, so a negative priority orders the callback without
 * disabling automatic rendering.
 */
export function useTimeOfDay(): TimeOfDayState {
  const selected = useAppStore((s) => s.timeOfDay);
  const weather = useAppStore((s) => s.weather);
  // Built once per change, not per frame: the weather transform allocates a fresh preset.
  const target = useMemo(() => withWeather(timeOfDayById(selected), weather), [selected, weather]);
  const stateRef = useRef<TimeOfDayState>(null);
  if (stateRef.current === null) {
    // Seed from the initial preset so the very first frame is already correct.
    stateRef.current = stateFrom(target);
  }
  const current = stateRef.current;
  const reduced = useReducedMotionRef();

  useFrame((_, delta) => {
    // Exponential approach: frame-rate independent and it never overshoots.
    const t = reduced.current ? 1 : Math.min(1, 1 - Math.exp((-delta * 4) / EASE_SECONDS));
    current.sun.lerp(scratchVector.set(...target.sun), t);
    current.zenith.lerp(scratchColor.set(target.zenith), t);
    current.glowColor.lerp(scratchColor.set(target.sunGlow.color), t);
    current.discColor.lerp(scratchColor.set(target.sunDisc.color), t);
    current.cloudTint.lerp(scratchColor.set(target.clouds.tint), t);
    current.keyColor.lerp(scratchColor.set(target.key.color), t);
    current.fillColor.lerp(scratchColor.set(target.fill.color), t);
    current.hemiSky.lerp(scratchColor.set(target.hemisphere.sky), t);
    current.hemiGround.lerp(scratchColor.set(target.hemisphere.ground), t);
    current.fogColor.lerp(scratchColor.set(target.fog.color), t);
    current.glowStrength = approach(current.glowStrength, target.sunGlow.strength, t);
    current.discStrength = approach(current.discStrength, target.sunDisc.strength, t);
    current.cloudOpacity = approach(current.cloudOpacity, target.clouds.opacity, t);
    current.mistOpacity = approach(current.mistOpacity, target.mist, t);
    current.keyIntensity = approach(current.keyIntensity, target.key.intensity, t);
    current.fillIntensity = approach(current.fillIntensity, target.fill.intensity, t);
    current.hemiIntensity = approach(current.hemiIntensity, target.hemisphere.intensity, t);
    current.fogNear = approach(current.fogNear, target.fog.near, t);
    current.fogFar = approach(current.fogFar, target.fog.far, t);
    current.lampLevel = approach(current.lampLevel, target.lampLevel, t);
    current.starOpacity = approach(current.starOpacity, target.stars ? 1 : 0, t);
    current.fireflyOpacity = approach(current.fireflyOpacity, target.fireflies ? 1 : 0, t);
    current.rain = approach(current.rain, target.rain, t);
  }, -1);

  return current;
}
