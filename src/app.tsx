import { Canvas } from '@react-three/fiber';
import { MotionConfig, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import { config } from './config';
import { characters } from './data/characters';
import { residents, residentsEnabled } from './data/residents';
import { roomById } from './data/rooms';
import { pick } from './i18n/locale';
import { useLocale, useT } from './i18n/use-i18n';
import { PerfProbe } from './scene/perf-probe';
import { Scene } from './scene/scene';
import { preflightModels, useAppStore } from './state/store';
import { PerfStats, Title, ViewControls } from './ui/chrome';
import { InfoCard } from './ui/info-card';
import { LoadingVeil } from './ui/loading-veil';
import { MenusToggle } from './ui/menus-toggle';
import { PoseBar } from './ui/pose-bar';
import { RoofControl } from './ui/roof-control';
import { type PlacedPin, RoomPins, RoomPinTracker } from './ui/room-pins';

/**
 * Everything the scene can put on screen, HEAD-checked once before the canvas mounts.
 *
 * The six children are back in this build (2026-11-02): they were taken out when the sculpts
 * were still proxies and the walk button had nothing to drive, and `scene.tsx` stopped drawing
 * them. Their six GLBs are asked for here like any other model, so a missing one falls back to
 * the capsule proxy instead of a hole in the arrangement. The two parents' are asked for only
 * while `residentsEnabled` is on, so an unfinished pair of sculpts costs no request at all.
 */
const modelUrls = [
  config.models.environment,
  config.models.streets,
  config.models.neighbours,
  config.models.tree,
  config.models.hedge,
  config.models.sakura,
  ...characters.map((def) => `${config.models.characterDir}/${def.id}.glb`),
  ...(residentsEnabled ? residents.map((resident) => `${config.models.residentDir}/${resident.id}.glb`) : []),
];

export function App() {
  (window as unknown as Record<string, unknown>).__appProbe = {
    models: useAppStore((st) => st.availableModels),
    preflightDone: useAppStore((st) => st.preflightDone),
  };
  const [menusOpen, setMenusOpen] = useState(true);
  /** Screen positions of the room's hotspot pins, published from inside the Canvas. */
  const [pins, setPins] = useState<PlacedPin[]>([]);
  const room = useAppStore((s) => (s.activeRoomId ? roomById(s.activeRoomId) : undefined));
  const showPerf = useAppStore((s) => s.showPerf);
  const walking = useAppStore((s) => s.freeWalk);
  // A driven child has its own bar on the same bottom edge; the hint belongs to the visitor
  // walking on their own feet.
  const drivingSelf = useAppStore((s) => s.possessedId === null);
  const locale = useLocale();
  const t = useT();

  useEffect(() => {
    document.body.setAttribute('aria-busy', 'true');
    preflightModels(modelUrls);
  }, []);

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [...config.camera.position], fov: config.camera.fov, near: 0.1, far: 200 }}
        // ACES with a little exposure lift: with an HDRI in the scene the highlights need a
        // filmic roll-off, or the sunlit stucco clips to flat white.
        gl={{
          antialias: true,
          toneMapping: NoToneMapping,
          outputColorSpace: SRGBColorSpace,
        }}
        role="img"
        aria-label={
          room ? t('canvasInside', { room: pick(room.name, locale), kana: room.kana }) : t('canvasStreet')
        }
      >
        <Scene />
        <RoomPinTracker onPlace={setPins} />
        {showPerf && <PerfProbe />}
      </Canvas>
      <div id="ui-root">
        {/* Hidden menus stay mounted (unmounting the toolbar would stop the music): they fade out,
            then become invisible and inert so they drop out of the tab order and hit testing. */}
        <MotionConfig reducedMotion="user">
          <motion.div
            id="main-menus"
            className="menus"
            inert={!menusOpen}
            initial={false}
            animate={
              menusOpen
                ? { opacity: 1, visibility: 'visible' }
                : { opacity: 0, transitionEnd: { visibility: 'hidden' } }
            }
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="top-left">
              <Title />
              {showPerf && <PerfStats />}
            </div>
            <ViewControls />
            <RoofControl />
            {/* No roster: the characters are out of this build entirely. */}
          </motion.div>
          <MenusToggle
            open={menusOpen}
            onToggle={() => setMenusOpen((open) => !open)}
            controls="main-menus"
          />
        </MotionConfig>
        <InfoCard />
        <PoseBar />
        <RoomPins placed={pins} />
        {walking && drivingSelf && (
          <div className="walk-hint" role="status">
            <span>
              <b>{t('hintClick')}</b> {t('hintLook')}
            </span>
            <span>
              <b>WASD</b> {t('hintMove')}
            </span>
            <span>
              <b>Shift</b> {t('hintRun')}
            </span>
            <span>
              <b>{t('hintStairs')}</b> {t('hintClimb')}
            </span>
            <span>
              <b>E</b> {t('hintFloors')}
            </span>
            <span>
              <b>Esc</b> {t('hintRelease')}
            </span>
          </div>
        )}
      </div>
      <LoadingVeil />
    </>
  );
}
