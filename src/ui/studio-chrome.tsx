import type { MotionEntry } from '../data/animations';
import type { CharacterDef } from '../data/characters';
import { characters } from '../data/characters';
import { dioramaHref, linkProps, studioHref } from '../router';

interface Props {
  def: CharacterDef;
  /** The clips the loaded model carries, in catalog order. Empty is a real state. */
  entries: MotionEntry[];
  clipId: string | null;
  onClip: (id: string) => void;
  /** Whether the current clip repeats; starts from the catalog's default for each pick. */
  loop: boolean;
  onLoop: (loop: boolean) => void;
  speed: number;
  onSpeed: (speed: number) => void;
  spin: boolean;
  onSpin: (spin: boolean) => void;
  /** The GLB is not on the server: the stage shows a plinth, and this says why. */
  modelMissing: boolean;
  /** The model exists but has not reported its clips yet, so "no clips" would be a lie. */
  loading: boolean;
}

/** Panels over the studio canvas: navigation, the motion picker, and the character's numbers. */
export function StudioChrome({
  def,
  entries,
  clipId,
  onClip,
  loop,
  onLoop,
  speed,
  onSpeed,
  spin,
  onSpin,
  modelMissing,
  loading,
}: Props) {
  const selected = entries.find((entry) => entry.id === clipId);
  return (
    <>
      <header className="panel studio-head">
        <a className="studio-back" {...linkProps(dioramaHref)}>
          &larr; Diorama
        </a>
        <h1>Character studio</h1>
        <p>Every motion the model carries, one character at a time.</p>
      </header>

      <section className="panel studio-info" aria-labelledby="studio-name">
        <p className="eyebrow" style={{ color: def.color }}>
          Character
        </p>
        <h2 id="studio-name">{def.name}</h2>
        <p className="jp" lang="ja">
          {def.jpName}
        </p>
        <dl className="studio-stats">
          <div>
            <dt>Height</dt>
            <dd>{def.height.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>Stride</dt>
            <dd>{def.stride.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>Clips</dt>
            <dd>{entries.length}</dd>
          </div>
        </dl>
        <p className="body">{def.bio}</p>
      </section>

      {/* The roster and the motion bar share the bottom edge on a phone, so they are one stack
          rather than two absolute panels at hand-tuned offsets — the motion bar grows with the
          clip count and used to cover the roster outright. `display: contents` on desktop leaves
          each panel's own positioning untouched. */}
      <div className="studio-dock">
        <nav className="panel studio-roster" aria-label="Characters">
          {characters.map((c) => (
            <a
              key={c.id}
              data-id={c.id}
              aria-current={c.id === def.id ? 'page' : undefined}
              {...linkProps(studioHref(c.id))}
            >
              <span className="swatch" style={{ background: c.color }} aria-hidden="true" />
              {c.shortName}
            </a>
          ))}
        </nav>

        <section className="panel studio-motions" aria-label="Motion">
          {entries.length === 0 ? (
            <p className="studio-empty">
              {modelMissing
                ? `${def.shortName}'s model is not built yet — the stage shows a placeholder.`
                : loading
                  ? `Loading ${def.shortName}…`
                  : `${def.shortName} carries no animation clips yet. The Mixamo motion set lands with the pipeline in phase 3.`}
            </p>
          ) : (
            <>
              <fieldset className="studio-chips">
                <legend className="sr-only">Motion clips</legend>
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    aria-pressed={entry.id === clipId}
                    onClick={() => onClip(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </fieldset>
              <p className="studio-clip-note">{selected?.description ?? 'Pick a motion.'}</p>
            </>
          )}
          <div className="studio-row">
            <label htmlFor="studio-speed">Speed</label>
            <input
              id="studio-speed"
              type="range"
              min={0.25}
              max={2}
              step={0.05}
              value={speed}
              onChange={(e) => onSpeed(Number(e.target.value))}
            />
            <output htmlFor="studio-speed">{speed.toFixed(2)}&times;</output>
            <button type="button" aria-pressed={loop} disabled={!clipId} onClick={() => onLoop(!loop)}>
              Loop
            </button>
            <button type="button" aria-pressed={spin} onClick={() => onSpin(!spin)}>
              Turntable
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
