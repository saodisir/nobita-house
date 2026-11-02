import type { Vector3 } from 'three';

/**
 * Highest elevation the sun is *drawn* at. The orbit camera always looks slightly down at a
 * target near the ground, so the top of the frame sits at ~14 degrees, while the morning sun is
 * at 46: drawn truthfully it would never be on screen. The disc keeps the true azimuth, so it
 * lines up with the shadows, but drops to this elevation. At 9.5 degrees it landed in the top
 * ~45 px of the frame, under the title card and toolbar; at 7 its ~2.2 degree disc clears
 * both. The key light in `Lighting` still uses the true sun vector.
 */
export const SUN_MAX_ELEVATION = (7 * Math.PI) / 180;

/**
 * Elevation the moon is drawn at. At night the preset's `sun` vector is the moonlight, below
 * the horizon so the sky shader draws no sun, which gives the moon an azimuth but no usable
 * height. It sits lower than the sun's cap because the drawn disc and its halo are larger: at
 * 7 degrees the halo ran off the top of the default view.
 */
export const MOON_ELEVATION = (4.5 * Math.PI) / 180;

/** Writes the drawn moon direction into `out`: the moonlight's azimuth at `MOON_ELEVATION`. */
export function displayMoonDirection(moonlight: Vector3, out: Vector3) {
  const across = Math.hypot(moonlight.x, moonlight.z) || 1;
  const scale = Math.cos(MOON_ELEVATION) / across;
  return out.set(moonlight.x * scale, Math.sin(MOON_ELEVATION), moonlight.z * scale);
}

/** Writes the drawn sun direction into `out`: true azimuth, elevation capped for display. */
export function displaySunDirection(sun: Vector3, out: Vector3) {
  out.copy(sun).normalize();
  const cap = Math.sin(SUN_MAX_ELEVATION);
  if (out.y > cap) {
    const across = Math.hypot(out.x, out.z) || 1;
    const scale = Math.cos(SUN_MAX_ELEVATION) / across;
    out.set(out.x * scale, cap, out.z * scale);
  }
  return out;
}
