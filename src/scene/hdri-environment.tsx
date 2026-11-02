import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { EquirectangularReflectionMapping, PMREMGenerator } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { useAppStore } from '../state/store';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * Image-based lighting for the whole scene.
 *
 * Without an environment map every material has nothing to reflect, so glass, enamel and tile
 * read as flat plastic and the shaded sides go muddy. A real HDRI fixes both at once: it lights
 * the scene from every direction and gives surfaces something to mirror.
 *
 * Day and night are two separate Poly Haven CC0 captures, loaded one at a time. The equirect map
 * is prefiltered through PMREM so roughness works, then handed to the scene as its environment.
 */

/** Where the environment settles per time of day; night is a dark capture, so it is not dimmed much. */
const DAY_INTENSITY = 0.3;
const NIGHT_INTENSITY = 0.2;

export function HdriEnvironment({ tod: _tod }: { tod: TimeOfDayState }) {
  const id = useAppStore((s) => s.timeOfDay);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const night = id === 'night';

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const loader = new RGBELoader();
    let disposed = false;
    let target: ReturnType<PMREMGenerator['fromEquirectangular']> | null = null;

    loader.load(night ? '/hdri/night.hdr' : '/hdri/day.hdr', (hdr) => {
      if (disposed) {
        hdr.dispose();
        return;
      }
      hdr.mapping = EquirectangularReflectionMapping;
      target = pmrem.fromEquirectangular(hdr);
      hdr.dispose();
      scene.environment = target.texture;
      scene.environmentIntensity = night ? NIGHT_INTENSITY : DAY_INTENSITY;
    });

    return () => {
      disposed = true;
      target?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, night]);

  return null;
}
