import { describe, expect, it } from 'vitest';
import { DEFAULT_TIME_OF_DAY, timeOfDayById, timesOfDay } from './time-of-day';

describe('time-of-day presets', () => {
  it('has unique ids and a resolvable default', () => {
    const ids = timesOfDay.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_TIME_OF_DAY);
    expect(timeOfDayById(DEFAULT_TIME_OF_DAY).id).toBe(DEFAULT_TIME_OF_DAY);
  });

  it('opens in daylight with the sun up and the lamps off', () => {
    const opening = timeOfDayById(DEFAULT_TIME_OF_DAY);
    expect(opening.id).toBe('morning');
    expect(opening.sun[1]).toBeGreaterThan(0);
    expect(opening.lampLevel).toBe(0);
    expect(opening.stars).toBe(false);
  });

  it('puts the sun above the horizon by day and below it at night', () => {
    for (const preset of timesOfDay) {
      const [, y] = preset.sun;
      if (preset.id === 'night') expect(y).toBeLessThan(0);
      else expect(y).toBeGreaterThan(0);
    }
  });

  it('lights the lamps only as daylight fades, and stars only at night', () => {
    const level = (id: string) => timesOfDay.find((p) => p.id === id)?.lampLevel ?? -1;
    expect(level('morning')).toBe(0);
    expect(level('dawn')).toBeGreaterThan(0);
    expect(level('sunset')).toBeGreaterThan(level('dawn'));
    expect(level('night')).toBe(1);
    expect(timesOfDay.filter((p) => p.stars).map((p) => p.id)).toEqual(['night']);
    expect(timesOfDay.filter((p) => p.fireflies).map((p) => p.id)).toEqual(['night']);
    expect(timesOfDay.every((p) => p.rain === 0)).toBe(true);
  });

  it('keeps every fog range and sky colour usable', () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const preset of timesOfDay) {
      expect(preset.fog.near).toBeGreaterThan(0);
      expect(preset.fog.far).toBeGreaterThan(preset.fog.near);
      expect(preset.zenith).toMatch(hex);
      expect(preset.fog.color).toMatch(hex);
      expect(preset.sunGlow.color).toMatch(hex);
      expect(preset.clouds.tint).toMatch(hex);
    }
  });

  it('hides clouds, mist, the sun halo and the sun disc at night so the stars read against a clear sky', () => {
    for (const preset of timesOfDay) {
      if (preset.stars) {
        expect(preset.clouds.opacity).toBe(0);
        expect(preset.mist).toBe(0);
        expect(preset.sunGlow.strength).toBe(0);
        expect(preset.sunDisc.strength).toBe(0);
      } else {
        expect(preset.clouds.opacity).toBeGreaterThan(0.5);
        expect(preset.mist).toBeGreaterThan(0);
        expect(preset.sunDisc.strength).toBeGreaterThan(0);
        expect(preset.sunDisc.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});
