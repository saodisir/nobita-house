// Optimize raw/exported GLBs into public/models.
// Usage: bun run assets:build [--in assets/raw/final] [--out public/models]
// Chain: dedup → weld → prune → texture resize → meshopt compress. Skinned meshes skip simplify
// because gltf-transform's simplifier can wreck skin weights.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const args = parseArgs(process.argv.slice(2));
const IN = resolve(ROOT, args.in ?? 'assets/raw/final');
const OUT = resolve(ROOT, args.out ?? 'public/models');

if (!existsSync(IN)) {
  // Expected before any Blender export exists; the app falls back to proxy geometry.
  console.log(`No input dir yet (${IN}) — nothing to build.`);
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const files = walk(IN).filter((f) => f.endsWith('.glb'));
if (files.length === 0) {
  console.log(`No .glb files under ${IN} yet — nothing to build.`);
  process.exit(0);
}

/** Source tiles are authored at 1024; anything here would only be upscaled by 2048. */
const SMALL_TEXTURES = ['character', 'props'];

for (const file of files) {
  const rel = file.slice(IN.length + 1);
  const dest = join(OUT, rel);
  mkdirSync(resolve(dest, '..'), { recursive: true });
  const isCharacter = rel.includes('character');
  const textureSize = SMALL_TEXTURES.some((tag) => rel.includes(tag)) ? '1024' : '2048';

  run(['dedup', file, dest]);
  if (!isCharacter) {
    // Everything but the rigged characters ships as hundreds of separate parts, one draw call
    // each. Flatten the node tree and merge by material; nothing in the app addresses them
    // by name.
    run(['flatten', dest, dest]);
    run(['join', dest, dest]);
  }
  run(['weld', dest, dest]);
  run(['resize', dest, dest, '--width', textureSize, '--height', textureSize]);
  run(['prune', dest, dest]);
  // WebP cuts PNG leaf cards and PBR maps by ~4x; three.js reads EXT_texture_webp natively.
  run(['webp', dest, dest, '--quality', '85']);
  run(['meshopt', dest, dest, '--level', 'high']);

  const before = statSync(file).size;
  const after = statSync(dest).size;
  console.log(`${rel}: ${fmt(before)} → ${fmt(after)} (${Math.round((1 - after / before) * 100)}% smaller)`);
}

function run(argv) {
  execFileSync('bunx', ['--bun', '@gltf-transform/cli', ...argv], { stdio: ['ignore', 'ignore', 'inherit'] });
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

function fmt(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}
