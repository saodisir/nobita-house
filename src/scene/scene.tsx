import { characters } from '../data/characters';
import { useAppStore } from '../state/store';
import { CameraRig } from './camera-rig';
import { Character } from './character';
import { Environment } from './environment';
import { Fireflies } from './fireflies';
import { Foliage } from './foliage';
import { FreeWalk } from './free-walk';
import { HdriEnvironment } from './hdri-environment';
import { House } from './house';
import { InteriorLighting } from './interior-lighting';
import { LawnGrass } from './lawn-grass';
import { Lighting } from './lighting';
import { Neighbours } from './neighbours';
import { NightLights } from './night-lights';
import { PostProcessing } from './post-processing';
import { Rain } from './rain';
import { RainCover } from './rain-cover';
import { SkyDome } from './sky-dome';
import { Streets } from './streets';
import { useTimeOfDay } from './use-time-of-day';
import { WetSurfaces } from './wet-surfaces';
import { WindowPortals } from './window-portal';
import { YardEarth } from './yard-earth';

export function Scene() {
  const select = useAppStore((s) => s.select);
  // Called once here and passed down: each call installs its own per-frame easing.
  const tod = useTimeOfDay();
  return (
    <>
      <color attach="background" args={['#BFE0FA']} />
      <fog attach="fog" args={['#CFE6FA', 48, 110]} />
      <SkyDome tod={tod} />
      <Lighting tod={tod} />
      {/* HDRI off for now: at a useful intensity it flattens the tuned daylight; see notes. */}
      <NightLights tod={tod} />
      <CameraRig />
      {/* click on empty space deselects; the end of an orbit drag is not a click */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        onClick={(e) => {
          if (e.delta <= 2) select(null);
        }}
        receiveShadow
      >
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#8DB26A" />
      </mesh>
      <House />
      <InteriorLighting tod={tod} />
      <WindowPortals />
      <Environment />
      <LawnGrass />
      <YardEarth />
      <Streets />
      {/* The six children: at home on the sidewalk, out on their own laps once stroll is on. */}
      {characters.map((def, index) => (
        <Character key={def.id} def={def} index={index} />
      ))}
      <Neighbours />
      <Foliage />
      <Fireflies tod={tod} />
      <Rain tod={tod} />
      <RainCover tod={tod} />
      <WetSurfaces tod={tod} />
      {/* One keyboard, one walker: FreeWalk owns both views of a drive. */}
      <FreeWalk />
      <PostProcessing />
    </>
  );
}
