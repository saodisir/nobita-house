import { Color, type HSL, SRGBColorSpace } from 'three';
import type { TimeOfDayPreset } from './time-of-day';

export type WeatherId = 'clear' | 'rain';

export const DEFAULT_WEATHER: WeatherId = 'clear';

/**
 * Street lamps and windows come on under a rain sky even by day: a grey morning in a Tokyo
 * suburb is dim enough that people switch the lights on.
 */
const RAIN_LAMP_FLOOR = 0.3;

const scratch = new Color();
const hsl: HSL = { h: 0, s: 0, l: 0 };

/** The same hue, washed out and dimmed: how a colour reads under a solid cloud deck. */
function overcast(hex: string, saturation: number, lightness: number): string {
  scratch.set(hex).getHSL(hsl, SRGBColorSpace);
  scratch.setHSL(hsl.h, hsl.s * saturation, hsl.l * lightness, SRGBColorSpace);
  return `#${scratch.getHexString(SRGBColorSpace)}`;
}

/**
 * The time of day as the weather leaves it. Clear returns the preset untouched. Rain keeps
 * each time of day's hue so dawn is still a pink-grey and night still blue-black, but closes
 * the sky over it: sun, moon and stars hidden, colours washed out, direct light cut so shadows
 * all but vanish, the haze drawn in, and no fireflies — they do not fly in rain.
 *
 * The sun vector is kept: it still carries the dim key light, and easing it would swing the
 * faint shadows round for no reason.
 */
export function withWeather(preset: TimeOfDayPreset, weather: WeatherId): TimeOfDayPreset {
  if (weather === 'clear') return preset;
  return {
    ...preset,
    zenith: overcast(preset.zenith, 0.15, 0.85),
    sunGlow: { ...preset.sunGlow, strength: 0 },
    sunDisc: { ...preset.sunDisc, strength: 0 },
    // A full deck of dark cloud, night included: the clear night hid its clouds for the stars.
    clouds: { tint: overcast(preset.clouds.tint, 0.2, 0.7), opacity: Math.max(preset.clouds.opacity, 0.9) },
    mist: Math.max(preset.mist, 0.85),
    key: { color: overcast(preset.key.color, 0.3, 1), intensity: preset.key.intensity * 0.3 },
    fill: { color: overcast(preset.fill.color, 0.4, 1), intensity: preset.fill.intensity * 0.9 },
    // Skylight takes over from the sun: the diffuse term rises a little as the direct one falls.
    hemisphere: {
      sky: overcast(preset.hemisphere.sky, 0.35, 1),
      ground: overcast(preset.hemisphere.ground, 0.35, 1),
      intensity: preset.hemisphere.intensity * 1.15,
    },
    fog: {
      color: overcast(preset.fog.color, 0.15, 0.8),
      near: preset.fog.near * 0.75,
      far: preset.fog.far * 0.9,
    },
    stars: false,
    fireflies: false,
    rain: 1,
    lampLevel: Math.max(preset.lampLevel, RAIN_LAMP_FLOOR),
  };
}
