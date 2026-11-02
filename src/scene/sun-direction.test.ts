import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  displayMoonDirection,
  displaySunDirection,
  MOON_ELEVATION,
  SUN_MAX_ELEVATION,
} from './sun-direction';

const azimuth = (v: Vector3) => Math.atan2(v.x, v.z);

describe('drawn sun and moon directions', () => {
  it('caps a high sun at the display elevation and keeps its azimuth', () => {
    const sun = new Vector3(9, 14, 10);
    const drawn = displaySunDirection(sun, new Vector3());
    expect(drawn.length()).toBeCloseTo(1);
    expect(Math.asin(drawn.y)).toBeCloseTo(SUN_MAX_ELEVATION);
    expect(azimuth(drawn)).toBeCloseTo(azimuth(sun));
  });

  it('leaves a low sun where it is', () => {
    const sun = new Vector3(-16, 1, 9);
    expect(displaySunDirection(sun, new Vector3()).toArray()).toEqual(sun.clone().normalize().toArray());
  });

  it('hangs the moon above the horizon in the direction of the moonlight below it', () => {
    const moonlight = new Vector3(-4.4, -4, -13.5);
    const drawn = displayMoonDirection(moonlight, new Vector3());
    expect(drawn.length()).toBeCloseTo(1);
    expect(Math.asin(drawn.y)).toBeCloseTo(MOON_ELEVATION);
    expect(azimuth(drawn)).toBeCloseTo(azimuth(moonlight));
  });
});
