import { Color } from 'three';
import { describe, expect, it } from 'vitest';
import { timeOfDayById, timesOfDay } from './time-of-day';
import { withWeather } from './weather';

const luminance = (hex: string) => {
  const { r, g, b } = new Color(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('weather', () => {
  it('leaves every time of day untouched in clear weather', () => {
    for (const preset of timesOfDay) expect(withWeather(preset, 'clear')).toBe(preset);
  });

  it('grounds the fireflies and hides the moon and stars on a rainy night', () => {
    const night = timeOfDayById('night');
    expect(night.fireflies).toBe(true);
    const rainyNight = withWeather(night, 'rain');
    expect(rainyNight.fireflies).toBe(false);
    expect(rainyNight.stars).toBe(false);
    expect(rainyNight.rain).toBe(1);
    expect(rainyNight.lampLevel).toBe(1);
  });

  it('closes the sky at every time of day without losing which time it is', () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (const preset of timesOfDay) {
      const wet = withWeather(preset, 'rain');
      expect(wet.id).toBe(preset.id);
      expect(wet.sun).toEqual(preset.sun);
      expect(wet.rain).toBe(1);
      expect(wet.fireflies).toBe(false);
      expect(wet.sunDisc.strength).toBe(0);
      expect(wet.sunGlow.strength).toBe(0);
      expect(wet.clouds.opacity).toBeGreaterThan(0.5);
      expect(wet.key.intensity).toBeLessThan(preset.key.intensity);
      expect(wet.lampLevel).toBeGreaterThanOrEqual(preset.lampLevel);
      expect(wet.fog.near).toBeGreaterThan(0);
      expect(wet.fog.far).toBeGreaterThan(wet.fog.near);
      expect(wet.fog.far).toBeLessThan(preset.fog.far);
      for (const colour of [wet.zenith, wet.fog.color, wet.clouds.tint, wet.key.color, wet.hemisphere.sky]) {
        expect(colour).toMatch(hex);
      }
    }
    // A rainy morning is still brighter than a rainy night.
    const sky = (id: 'morning' | 'night') => luminance(withWeather(timeOfDayById(id), 'rain').zenith);
    expect(sky('morning')).toBeGreaterThan(sky('night'));
  });
});
