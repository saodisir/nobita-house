import type { Localized } from '../i18n/locale';

export type TimeOfDayId = 'dawn' | 'morning' | 'sunset' | 'night';

export interface TimeOfDayPreset {
  id: TimeOfDayId;
  /** Tooltip and accessible name of the segment; the buttons themselves are icons only. */
  label: Localized;
  /** Sun direction in metres. Drives the sky's sun glow and the shadow-casting key light
   * together: if the two ever diverge, the shadows contradict the sky. */
  sun: readonly [number, number, number];
  /**
   * Sky colour straight overhead. The horizon deliberately has no field of its own: it is the
   * fog colour, so the fogged ground meets the sky without a seam at any time of day.
   */
  zenith: string;
  /** Halo around the sun on the dome; 0 hides it. Strongest when the sun is low. */
  sunGlow: { color: string; strength: number };
  /** The visible sun disc; 0 hides it (night). */
  sunDisc: { color: string; strength: number };
  /** Cloud billboards: tint follows the light (pink dawn, lit-orange sunset); 0 hides them. */
  clouds: { tint: string; opacity: number };
  /** Horizon haze band hugging the ground's far edge: covers the seam where the fogged
   * ground plane ends against the glowing sky. 0 hides it (night keeps the sky clear). */
  mist: number;
  /** Key directional light, the one that casts shadows. */
  key: { color: string; intensity: number };
  /** Bounce fill from the opposite side; never casts. */
  fill: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  fog: { color: string; near: number; far: number };
  stars: boolean;
  /** Fireflies over the garden. Warm, still nights only: `withWeather` grounds them in rain. */
  fireflies: boolean;
  /** Rain density, 0 = dry, 1 = a steady shower. Every time of day is dry; `withWeather` wets it. */
  rain: number;
  /** 0 = lamps off, 1 = full night glow. Drives the point lights and window emissive. */
  lampLevel: number;
}

/** The default, held separately so the fallback never depends on array order. Sky blue is
 * matched to the hero reference, whose sky above the rooftops measures #78BEFC. */
const MORNING: TimeOfDayPreset = {
  id: 'morning',
  label: { en: 'Morning', zh: '清晨' },
  sun: [-3.9, 14, -13.5],
  zenith: '#6AB4F6',
  sunGlow: { color: '#FFF4DC', strength: 0.3 },
  sunDisc: { color: '#FFE9B8', strength: 1 },
  clouds: { tint: '#FFFFFF', opacity: 0.96 },
  mist: 0.72,
  key: { color: '#FFF3DF', intensity: 2.2 },
  fill: { color: '#DCE9FF', intensity: 0.5 },
  hemisphere: { sky: '#CFE6FF', ground: '#8A7A5A', intensity: 0.75 },
  fog: { color: '#CFE6FA', near: 48, far: 110 },
  stars: false,
  fireflies: false,
  rain: 0,
  lampLevel: 0,
};

/**
 * Four times of day. The sun keeps the moon's azimuth all day — low at dawn and sunset, high
 * at morning — so the drawn sun and the night moon hang in the same spot of the sky; at night
 * the vector slips below the horizon to become the moonlight.
 */
export const timesOfDay: readonly TimeOfDayPreset[] = [
  {
    id: 'dawn',
    label: { en: 'Dawn', zh: '黎明' },
    sun: [-3.9, 2.6, -13.5],
    zenith: '#6D86C4',
    sunGlow: { color: '#FFC89A', strength: 0.9 },
    sunDisc: { color: '#FFE2BC', strength: 1 },
    clouds: { tint: '#F7C6BE', opacity: 0.88 },
    mist: 0.85,
    key: { color: '#FFC79A', intensity: 1.5 },
    fill: { color: '#9FB6E8', intensity: 0.55 },
    hemisphere: { sky: '#F2C9B4', ground: '#6E6552', intensity: 0.55 },
    fog: { color: '#E7C6B4', near: 40, far: 105 },
    stars: false,
    fireflies: false,
    rain: 0,
    lampLevel: 0.35,
  },
  MORNING,
  {
    id: 'sunset',
    label: { en: 'Sunset', zh: '黄昏' },
    sun: [-3.9, 3.2, -13.5],
    zenith: '#4A5AA6',
    sunGlow: { color: '#FF9A4E', strength: 1.1 },
    sunDisc: { color: '#FFB57C', strength: 1 },
    clouds: { tint: '#F6A97E', opacity: 0.9 },
    mist: 0.9,
    key: { color: '#FF9A4E', intensity: 1.9 },
    fill: { color: '#7E8FD6', intensity: 0.5 },
    hemisphere: { sky: '#F0A878', ground: '#6B5540', intensity: 0.55 },
    fog: { color: '#EDA478', near: 38, far: 100 },
    stars: false,
    fireflies: false,
    rain: 0,
    lampLevel: 0.55,
  },
  {
    id: 'night',
    label: { en: 'Night', zh: '夜晚' },
    // The moonlight. The moon is drawn on this azimuth (see `displayMoonDirection`), which puts
    // it left of the house in the default view, so shadows fall away from where it hangs. The
    // day sun shares this azimuth, so both discs occupy the same spot of the sky.
    sun: [-3.9, -4, -13.5],
    zenith: '#03060F',
    sunGlow: { color: '#000000', strength: 0 },
    sunDisc: { color: '#000000', strength: 0 },
    // Clouds off so the stars read against a clear sky; mist too, same reason.
    clouds: { tint: '#2A3350', opacity: 0 },
    mist: 0,
    // A dim, cool moonlight keeps silhouettes readable.
    key: { color: '#9FB4E8', intensity: 0.55 },
    fill: { color: '#5C6EA8', intensity: 0.28 },
    hemisphere: { sky: '#2C3A63', ground: '#171B26', intensity: 0.35 },
    fog: { color: '#111A30', near: 34, far: 95 },
    stars: true,
    fireflies: true,
    rain: 0,
    lampLevel: 1,
  },
];

/** Open on the daytime the hero sky was tuned against; the night is one click away. */
export const DEFAULT_TIME_OF_DAY: TimeOfDayId = 'morning';

export const timeOfDayById = (id: TimeOfDayId): TimeOfDayPreset =>
  timesOfDay.find((preset) => preset.id === id) ?? MORNING;
