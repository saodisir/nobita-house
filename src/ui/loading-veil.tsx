import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

/** Paper plate loading screen; removed from the DOM after the fade so it never blocks the canvas. */
export function LoadingVeil() {
  const { progress, loaded, total, active } = useProgress();
  const preflightDone = useAppStore((s) => s.preflightDone);
  const [gone, setGone] = useState(false);
  // With no GLBs on disk nothing ever loads and progress stays 0, so completion is "nothing in flight".
  const done = preflightDone && !active && loaded === total;

  useEffect(() => {
    if (!done) return;
    document.body.removeAttribute('aria-busy');
    const t = setTimeout(() => setGone(true), 700);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;
  const pct = !preflightDone ? 0 : total === 0 ? 100 : Math.round(progress);
  return (
    <div className="veil" data-done={done}>
      <div className="plate">
        <h1>Nobita&rsquo;s House</h1>
        <p className="sub">A 3D diorama &middot; Doraemon fan project</p>
        <div
          className="track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Loading models"
        >
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="meta">
          <span>
            {loaded} / {total} models
          </span>
          <span>{pct}%</span>
        </div>
      </div>
    </div>
  );
}
