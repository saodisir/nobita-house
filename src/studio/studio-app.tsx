import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useState } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import { config } from '../config';
import { listMotions, motionById } from '../data/animations';
import { type CharacterDef, characterById, characters } from '../data/characters';
import { navigate, studioHref } from '../router';
import { preflightModels, useAppStore } from '../state/store';
import '../styles/studio.css';
import { StudioChrome } from '../ui/studio-chrome';
import { prefersReducedMotion } from '../utils/reduced-motion';
import { STUDIO_FOV, StudioScene } from './studio-scene';

const characterUrls = characters.map((c) => `${config.models.characterDir}/${c.id}.glb`);
/** The pilot character of the Mixamo motion set, so a bare `/characters` opens on him. */
const DEFAULT_CHARACTER = 'dekisugi';

/** The character the URL asks for, the pilot character, or a hard failure if data is broken. */
function resolveCharacter(id: string | null): CharacterDef {
  const found = (id ? characterById(id) : undefined) ?? characterById(DEFAULT_CHARACTER);
  if (!found) throw new Error(`no character to show: neither "${id}" nor "${DEFAULT_CHARACTER}" exists`);
  return found;
}

/**
 * `/characters/<id>` — one character alone on a lit stage with a motion picker.
 *
 * Deliberately its own page: it mounts no street, no house and no neighbour lot, and it
 * preflights the six character GLBs only. Default-exported because `main.tsx` lazy-loads it,
 * which is what keeps the diorama's scene out of this bundle.
 */
export default function StudioApp({ characterId }: { characterId: string | null }) {
  const def = resolveCharacter(characterId);
  /** Clip names as reported by a loaded model, tagged with whose model reported them. */
  const [clips, setClips] = useState<{ id: string; names: string[] }>({ id: '', names: [] });
  const [picked, setPicked] = useState<string | null>(null);
  /** The loop toggle, tagged with the clip it was set on; a new pick starts from its default. */
  const [loopPick, setLoopPick] = useState<{ clip: string; loop: boolean } | null>(null);
  const [speed, setSpeed] = useState(1);
  const [spin, setSpin] = useState(!prefersReducedMotion());
  const preflightDone = useAppStore((s) => s.preflightDone);
  const url = `${config.models.characterDir}/${def.id}.glb`;
  const modelAvailable = useAppStore((s) => s.availableModels[url] === true);

  useEffect(() => {
    // The diorama's loading veil owns `aria-busy`; navigating here mid-load would leave the
    // page announced as busy for ever, and this page has no veil.
    document.body.removeAttribute('aria-busy');
    preflightModels(characterUrls);
  }, []);

  // Canonicalise the URL, so `/characters` and `/characters/nobody` both become a real
  // character's page instead of silently showing someone else's.
  useEffect(() => {
    if (characterId !== def.id) navigate(studioHref(def.id), true);
  }, [characterId, def.id]);

  const onClips = useCallback((id: string, names: string[]) => setClips({ id, names }), []);

  // Tagging the report is what makes switching character safe without an effect: until the new
  // model has reported, there are no clips, rather than the previous character's.
  const reported = clips.id === def.id;
  const clipNames = reported ? clips.names : [];
  // A pick survives a character switch when the new model has that clip too; otherwise the
  // rest pose wins, then the bow, then whatever ships.
  const clipId =
    (picked && clipNames.includes(picked) ? picked : undefined) ??
    clipNames.find((name) => name === 'idle') ??
    clipNames.find((name) => name === 'welcome') ??
    clipNames[0] ??
    null;
  // A clip the catalog has never seen is treated as a loop; a one-shot holds its last pose.
  const loop =
    loopPick && loopPick.clip === clipId ? loopPick.loop : clipId ? (motionById(clipId)?.loop ?? true) : true;
  const onLoop = useCallback(
    (next: boolean) => {
      if (clipId) setLoopPick({ clip: clipId, loop: next });
    },
    [clipId],
  );
  const entries = listMotions(clipNames);
  const playing = clipId ? (motionById(clipId)?.label ?? clipId) : 'nothing';

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        // Roughly where the framing shot for a 1.4 m character lands, so the opening tween is short.
        camera={{ position: [1.36, 0.96, 3.72], fov: STUDIO_FOV, near: 0.05, far: 40 }}
        // Same neutral pipeline as the diorama, so a character looks identical on both pages.
        gl={{ antialias: true, toneMapping: NoToneMapping, outputColorSpace: SRGBColorSpace }}
        role="img"
        aria-label={`${def.name} standing on a studio turntable, playing ${playing}.`}
      >
        <StudioScene def={def} clipId={clipId} loop={loop} speed={speed} spin={spin} onClips={onClips} />
      </Canvas>
      <div className="studio-vignette" aria-hidden="true" />
      <div id="ui-root">
        <StudioChrome
          def={def}
          entries={entries}
          clipId={clipId}
          onClip={setPicked}
          loop={loop}
          onLoop={onLoop}
          speed={speed}
          onSpeed={setSpeed}
          spin={spin}
          onSpin={setSpin}
          modelMissing={preflightDone && !modelAvailable}
          loading={!reported}
        />
      </div>
    </>
  );
}
