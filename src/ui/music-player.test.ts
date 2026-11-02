import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../config';

describe('background music', () => {
  it('points at a file Vite serves from public/', () => {
    expect(config.music.src.startsWith('/')).toBe(true);
    expect(existsSync(join(process.cwd(), 'public', config.music.src))).toBe(true);
  });
});
