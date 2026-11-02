import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import { NoToneMapping, SRGBColorSpace } from 'three';
import '../styles/editor.css';
import { EditorChrome } from '../ui/editor-chrome';
import { EDITOR_EYE, EDITOR_FOV, EditorScene } from './editor-scene';
import { roomById } from './house/plan';
import { type EditorLevel, WHOLE_HOUSE } from './levels';
import type { RoomView } from './room-views';

/**
 * `/editor` — Nobita's house on its own, for editing.
 *
 * The house here is not a model file: it is built in the browser from `house/plan.ts`, the
 * measured plan of `assets/drawings.jpg`, so changing the plan changes the
 * house. Nothing here touches the diorama's GLBs. Default-exported because `main.tsx`
 * lazy-loads it, which keeps the diorama's scene out of this bundle.
 */
export default function EditorApp() {
  const [level, setLevel] = useState<EditorLevel>(WHOLE_HOUSE);
  /** A corner of a room the camera stands in, or null to look at the house from outside. */
  const [view, setView] = useState<RoomView | null>(null);
  const [labels, setLabels] = useState(true);

  useEffect(() => {
    // The diorama's loading veil owns `aria-busy`; this page has no veil.
    document.body.removeAttribute('aria-busy');
  }, []);

  const showing = view
    ? `standing in ${roomById(view.room).name}, ${view.label.toLowerCase()}`
    : level.label.toLowerCase();

  return (
    <>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: EDITOR_EYE, fov: EDITOR_FOV, near: 0.1, far: 250 }}
        // Same neutral pipeline as the diorama, so a surface looks identical on both pages.
        gl={{ antialias: true, toneMapping: NoToneMapping, outputColorSpace: SRGBColorSpace }}
        role="img"
        aria-label={`Nobita's house, built from its plan: ${showing}.`}
      >
        <EditorScene level={level} view={view} labels={labels} />
      </Canvas>
      <div id="ui-root">
        <EditorChrome
          level={level}
          onLevel={(next) => {
            setLevel(next);
            setView(null);
          }}
          view={view}
          onView={setView}
          labels={labels}
          onLabels={setLabels}
        />
      </div>
    </>
  );
}
