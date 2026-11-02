import { describe, expect, it } from 'vitest';
import { listMotions, motions } from './animations';

describe('motion catalog', () => {
  it('has unique kebab-case ids', () => {
    const ids = motions.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
  it('keeps the two ids other code hard-codes', () => {
    // `welcome` is played by src/scene/character.tsx on selection; `walk` is what walk mode
    // drives. Both names also live in the Blender export, so they cannot drift here alone.
    const ids = motions.map((m) => m.id);
    expect(ids).toContain('welcome');
    expect(ids).toContain('walk');
    expect(motions.find((m) => m.id === 'welcome')?.loop).toBe(false);
    expect(motions.find((m) => m.id === 'walk')?.loop).toBe(true);
  });
  it('lists only the clips a model carries, in catalog order', () => {
    const entries = listMotions(['cheer', 'walk', 'idle']);
    expect(entries.map((e) => e.id)).toEqual(['idle', 'walk', 'cheer']);
    expect(entries.every((e) => e.known)).toBe(true);
  });
  it('shows an unknown clip instead of dropping it', () => {
    const entries = listMotions(['welcome', 'cartwheel']);
    expect(entries.map((e) => e.id)).toEqual(['welcome', 'cartwheel']);
    expect(entries[1]).toMatchObject({ label: 'Cartwheel', known: false });
  });
  it('is empty for a model with no clips', () => {
    expect(listMotions([])).toEqual([]);
  });
});
