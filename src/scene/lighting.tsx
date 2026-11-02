import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { DirectionalLight, HemisphereLight } from 'three';
import type { TimeOfDayState } from './use-time-of-day';

/**
 * Key, fill and hemisphere lights driven by the active time of day.
 *
 * The key light shares its position with the `<Sky>` sun, so a low dawn or sunset sun throws
 * long shadows; the frustum spans ±30 m to keep them inside the map. 4096 keeps the hero's
 * shadow as crisp as it was at ±16/2048.
 */
export function Lighting({ tod }: { tod: TimeOfDayState }) {
  const key = useRef<DirectionalLight>(null);
  const fill = useRef<DirectionalLight>(null);
  const hemisphere = useRef<HemisphereLight>(null);

  useFrame(() => {
    const keyLight = key.current;
    if (keyLight) {
      // Scale the eased direction back up so the shadow camera keeps its distance from the lot
      // whatever the sun elevation; only the direction matters to a directional light.
      keyLight.position.copy(tod.sun).normalize().multiplyScalar(26);
      keyLight.color.copy(tod.keyColor);
      keyLight.intensity = tod.keyIntensity;
      // Below the horizon the key becomes a moon: keep it above ground so the scene still
      // reads, rather than lighting the underside of everything.
      if (keyLight.position.y < 6) keyLight.position.y = 6;
    }
    const fillLight = fill.current;
    if (fillLight) {
      fillLight.color.copy(tod.fillColor);
      fillLight.intensity = tod.fillIntensity;
    }
    const hemi = hemisphere.current;
    if (hemi) {
      hemi.color.copy(tod.hemiSky);
      hemi.groundColor.copy(tod.hemiGround);
      hemi.intensity = tod.hemiIntensity;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemisphere} args={['#CFE6FF', '#8A7A5A', 0.75]} />
      <directionalLight
        ref={key}
        castShadow
        position={[9, 14, 10]}
        intensity={2.2}
        color="#FFF3DF"
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0004}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-near={1}
        shadow-camera-far={70}
      />
      <directionalLight ref={fill} position={[-8, 6, -6]} intensity={0.5} color="#DCE9FF" />
    </>
  );
}
