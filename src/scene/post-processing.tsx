import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  Noise,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

/**
 * The lens, applied once to whatever the scene drew.
 *
 * A plain forward render of this scene reads as a flat illustration for reasons that have nothing
 * to do with the geometry: every pixel is in perfect focus, the blacks stop exactly where the
 * shading stops, nothing blooms, and there is no grain. A photograph has all four of those, so
 * adding them — carefully, in small amounts — is what makes the frame read as a photo rather than
 * a diagram.
 *
 * The order matters: occlusion first (it is geometry-aware), then bloom (it needs the ungraded
 * highlights), then the colour grade, then the frame — vignette and grain sit on top of everything.
 *
 * Every value here is deliberately conservative. The bloom threshold sits above 1.0 so only real
 * light sources — the sunset disc, lit windows at night, the lamp heads — glow; a lit wall is
 * around 0.8 and must not. Nothing else is strong enough to notice on its own; together they take
 * the plastic sheen off the render.
 */
export function PostProcessing() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom luminanceThreshold={1.05} luminanceSmoothing={0.4} intensity={0.18} mipmapBlur radius={0.6} />
      <BrightnessContrast brightness={0.015} contrast={0.06} />
      <HueSaturation saturation={0.04} />
      <Vignette offset={0.34} darkness={0.38} eskil={false} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.018} />
    </EffectComposer>
  );
}
