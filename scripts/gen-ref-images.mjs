// Generate 2D reference images for manual Hyper3D Rodin image-to-3D.
// Usage: bun scripts/gen-ref-images.mjs --subject futon [--provider zai] [--model ...] [--size 2K] [--views front,three-quarter]
//        bun scripts/gen-ref-images.mjs --all
//        bun scripts/gen-ref-images.mjs --subject futon --print   # prompt only, no API call
// Output: assets/ref/<subject>/<view>.png. The front view is generated first and then fed back as a
// reference image so the other views stay consistent (same colours, proportions, pose).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GoogleGenAI } from '@google/genai';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'assets/ref');

loadDotEnv(resolve(ROOT, '.env'));
const args = parseArgs(process.argv.slice(2));

// Two image back-ends. They are not interchangeable: only Gemini takes a reference image, so
// only Gemini can hold one subject steady across several views. Z.AI is text-to-image, which
// is enough for a single-image Rodin run and not enough for a multi-view one.
const PROVIDERS = {
  gemini: {
    env: 'GEMINI_API_KEY',
    model: 'gemini-2.5-flash-image',
    reference: true,
    namedIp: true,
    call: callGemini,
  },
  // Z.AI refuses a prompt that names a copyrighted film. Bisected 2026-09-19: the futon
  // prompt fails on "Stand By Me Doraemon" alone and passes without it, so this provider gets
  // a style that describes the look instead of citing it.
  // For pasting into someone else's image tool by hand. No key, no call — it exists so the
  // prompt handed to a human comes out of this file rather than a copy of it that drifts.
  manual: { model: 'manual', reference: false, namedIp: false },
  zai: { env: 'ZAI_API_KEY', model: 'cogview-4-250304', reference: false, namedIp: false, call: callZai },
};
const PRINT_ONLY = Boolean(args.print);
const providerName =
  args.provider ??
  (PRINT_ONLY
    ? 'manual'
    : Object.keys(PROVIDERS).find((n) => PROVIDERS[n].env && process.env[PROVIDERS[n].env]));
const provider = PROVIDERS[providerName];
if (!provider) {
  console.error(
    `No image provider. Set GEMINI_API_KEY or ZAI_API_KEY in .env, or pass --provider ${Object.keys(PROVIDERS).join('|')}`,
  );
  process.exit(1);
}
const apiKey = provider.env ? process.env[provider.env] : null;
if (provider.env && !apiKey) {
  console.error(`${provider.env} missing (set it in .env)`);
  process.exit(1);
}
// Flash at 1K is roughly an order of magnitude cheaper than the Pro image model at 2K and is
// still plenty for Rodin's image-to-3D input. Override with --model / --size when a subject
// needs more detail.
const MODEL = args.model ?? provider.model;
// Three views are enough for Rodin multi-view; the back adds cost without adding silhouette info.
// A provider that cannot be shown the front view has no way to keep the others consistent with
// it, so asking for more than one view there buys three unrelated objects, not three angles.
const VIEWS = (args.views ?? (provider.reference ? 'front,left,three-quarter' : 'front')).split(',');
const IMAGE_SIZE = args.size ?? '1K';
const FORCE = Boolean(args.force);

// Shared style prefix keeps all subjects in one visual family.
const STYLE =
  '3D rendered CGI in the style of the "Stand By Me Doraemon" animated movie, smooth soft plastic-like shading, ' +
  'subtle subsurface skin, clean studio lighting, uniform pure white background (#FFFFFF), no floor shadow, no text, no watermark.';

// The same look with the film unnamed, for a provider that will not render a named IP.
const STYLE_NEUTRAL =
  'Rendered as a frame from a modern 3D animated feature film, smooth soft plastic-like shading, gentle ' +
  'subsurface glow, clean studio lighting, uniform pure white background (#FFFFFF), no floor shadow, no text, no watermark.';

// Plants get their own style: the movie-CGI prefix drags foliage back to photoreal leaf
// clusters, which image-to-3D cannot reconstruct. Clay-render wording keeps volumes solid.
const PLANT_STYLE =
  'Rendered as a smooth matte clay sculpture, soft studio lighting, uniform pure white background (#FFFFFF), ' +
  'simple solid volumes exactly like a stop-motion prop, absolutely no fine leaf detail, no noise, ' +
  'no floor shadow, no text, no watermark.';

// Pose rules are what make the mesh usable for Mixamo auto-rig later.
const CHARACTER_POSE =
  'Full body, whole figure visible with margin, centred, standing straight in a relaxed A-pose: arms held away from the body at about 40 degrees, ' +
  'palms facing inward, fingers slightly apart, feet shoulder-width apart, neutral calm expression, mouth closed, eyes open looking straight ahead. ' +
  'No props, nothing in hands, no accessories that touch the body other than what is described.';

// Props are objects, not figures: the rules that matter are that the thing sits on nothing,
// fills the frame, and keeps one readable silhouette. Rodin reconstructs volume from the
// outline first, so a prop photographed on a surface comes back with the surface attached.
const PROP_POSE =
  'The whole object visible with margin, centred, floating with no ground plane and no surface under it, ' +
  'seen from slightly above so the top and one long side both read, one single object only, nothing else in frame. ' +
  'Cut out on a flat empty pure white backdrop with absolutely no cast shadow and no horizon line where a floor would meet a wall.';

// The two parents are never rigged and never walk, so the A-pose rule above would be wrong twice
// over: it is a rigging pose, and one of them is authored seated. Their pose is in the description.
const RESIDENT_POSE =
  'Full body, whole figure visible with margin, centred, in exactly the pose described, neutral calm expression, ' +
  'mouth closed, eyes open, no props, nothing in the hands, no floor shadow, nothing else in frame.';

const SUBJECTS = {
  doraemon: {
    kind: 'character',
    name: 'Doraemon',
    description:
      'a round blue robot cat with a white face and white belly, round white hands without fingers, small red nose, whiskers, ' +
      'a red collar with a yellow bell, a white pouch pocket on the belly, short stubby legs, no ears',
  },
  nobita: {
    kind: 'character',
    name: 'Nobita Nobi',
    description:
      'a thin ten-year-old Japanese boy with short black hair, big round glasses, small eyes, wearing a yellow short-sleeve shirt, ' +
      'dark blue shorts, white socks and blue sneakers',
  },
  shizuka: {
    kind: 'character',
    name: 'Shizuka Minamoto',
    description:
      'a ten-year-old Japanese girl with black hair in two low pigtails, gentle smile, wearing a pink long-sleeve blouse, ' +
      'a red pleated skirt, white socks and pink shoes',
  },
  jaian: {
    kind: 'character',
    name: 'Takeshi "Gian" Goda',
    description:
      'a big stocky ten-year-old Japanese boy, wide face, small eyes, thick black hair, wearing an orange long-sleeve shirt with a ' +
      'horizontal yellow stripe across the chest, dark blue trousers and blue sneakers',
  },
  suneo: {
    kind: 'character',
    name: 'Suneo Honekawa',
    description:
      'a short slim ten-year-old Japanese boy with black hair swept into a pointed swoop, narrow eyes, small pointed mouth, ' +
      'wearing a green long-sleeve shirt, brown shorts, white socks and yellow shoes',
  },
  // The two parents, set dressing inside the house: no rig, no clips. The descriptions are the
  // briefs in `src/data/residents.ts` — one standing in the kitchen, one seated at the kotatsu.
  mother: {
    kind: 'resident',
    name: "Nobita's mother",
    description:
      'a short Japanese woman in her late thirties, black hair in a low bun, round wire glasses, a cream apron over a warm pink ' +
      'house dress, house slippers, standing with her hands together in front of her',
  },
  father: {
    kind: 'resident',
    name: "Nobita's father",
    description:
      'a tall, slightly stooped Japanese man in his late thirties, short black hair, round glasses, a grey cardigan over a ' +
      'collared shirt and dark trousers, seated on the floor with his legs folded under him and his forearms resting forward, ' +
      'as if leaning at a low table',
  },
  tree: {
    kind: 'plant',
    name: 'a Japanese suburban street tree',
    description:
      'a single small deciduous broadleaf tree about five metres tall, one straight grey-brown trunk that ' +
      'splits into four or five main branches, a rounded dense canopy of bright fresh green leaves, ' +
      'no flowers, no fruit, roots hidden, nothing else in frame',
  },
  hedge: {
    kind: 'plant',
    name: 'a clipped garden shrub',
    description:
      'a single rounded evergreen garden shrub about eighty centimetres tall, dense small dark green leaves, ' +
      'neatly clipped into a soft dome, a few woody stems visible at the base, nothing else in frame',
  },
  sakura: {
    kind: 'plant',
    name: 'a stylized cartoon cherry blossom tree in full bloom, one single object',
    description:
      'a smooth sculpted 3D cartoon sakura tree like a wooden toy: one dark brown trunk leaning ' +
      'slightly with two main branches, and a canopy of exactly four big smooth rounded solid ' +
      'soft-pink blossom blobs merged together, completely solid matte surfaces with no ' +
      'individual petals, no texture noise, no holes, no green leaves, nothing else in frame',
  },
  // Texture sources for the leaf-card canopies: one flat cluster on pure black so alpha can be
  // keyed from luminance, plus a seamless bark tile for a derived normal map.
  'leaf-cluster': {
    kind: 'texture',
    name: 'a single cluster of fresh green leaves',
    description:
      'a small bushy cluster of about twenty broad green leaves radiating from one hidden centre, seen ' +
      'straight on, rendered as smooth semi-stylized 3D foliage, crisp edges, evenly lit, centred and ' +
      'filling seventy percent of the frame, on a perfectly uniform pure black background',
  },
  'blossom-cluster': {
    kind: 'texture',
    name: 'a single cluster of cherry blossom flowers',
    description:
      'a small dense cluster of about fifteen soft pink five-petal sakura blossoms with a few buds, seen ' +
      'straight on, rendered as smooth semi-stylized 3D flowers, crisp edges, evenly lit, centred and ' +
      'filling seventy percent of the frame, on a perfectly uniform pure black background',
  },
  bark: {
    kind: 'texture',
    name: 'a seamless tree bark texture tile',
    description:
      'a flat close-up of grey-brown deciduous tree bark with vertical ridges and fissures, filling the ' +
      'entire frame edge to edge with no border, evenly lit with no shadows, tileable',
  },
  'tile-stucco': {
    kind: 'texture',
    name: 'a seamless material tile',
    description:
      'a seamless tileable texture of cream-white exterior stucco plaster, fine sand grain, very light tone, low contrast, evenly lit, filling the entire frame edge to edge',
  },
  'tile-concrete': {
    kind: 'texture',
    name: 'a seamless material tile',
    description:
      'a seamless tileable texture of smooth light grey precast concrete with faint pores and subtle stains, very light tone, low contrast, evenly lit, filling the entire frame edge to edge',
  },
  'tile-asphalt': {
    kind: 'texture',
    name: 'a seamless material tile',
    description:
      'a seamless tileable texture of fine asphalt aggregate seen straight down, medium-light grey tone, low contrast, evenly lit, filling the entire frame edge to edge',
  },
  'tile-grass': {
    kind: 'texture',
    name: 'a seamless material tile',
    description:
      'a seamless tileable texture of a short mown lawn seen straight down, uniform fresh green, low contrast, evenly lit, no shadows, filling the entire frame edge to edge',
  },
  'tile-wood': {
    kind: 'texture',
    name: 'a seamless material tile',
    description:
      'a seamless tileable texture of light planed pine planks with vertical grain, pale tone, low contrast, evenly lit, filling the entire frame edge to edge',
  },
  // --- interior props (src/editor/house/build-furniture.ts builds these) -------------
  // Only the futon was ever required: the others are procedural boxes and a sculpt would be
  // an upgrade, not a fix. `src/data/room-props.ts` carries each one's `build` tag.
  // Laid out, not rolled: `prop-04` is two metres deep in `src/data/room-props.ts` and is
  // placed along the mats, so a bundle would be the wrong object at the wrong size.
  futon: {
    kind: 'prop',
    name: 'a Japanese futon laid out for sleeping',
    description:
      'a traditional Japanese futon spread flat, a long narrow rectangle more than twice as long as it is wide, ' +
      'two metres long, ninety centimetres wide, only fifteen centimetres thick so it lies low and flat, ' +
      'a blue quilted cover with a visible stitched grid, the padding softly puffed between the stitch lines, ' +
      'one white pillow lying flat at the far end, no bed, no frame, no mattress base, no legs',
  },
  'kotatsu-quilt': {
    kind: 'prop',
    // Described as the shape it ends up as, not as the thing it is draped over: asking for
    // "a quilt over a kotatsu" returned a flat quilt standing on its edge (2026-09-19).
    name: 'a thick quilt tented into a low square box shape',
    description:
      'a thick padded quilt hanging over an invisible low square table so it forms a flat square top about one ' +
      'metre across with four fabric sides falling straight down and flaring slightly where they reach the floor, ' +
      'like a soft fabric box open underneath, warm beige and brown with a simple woven pattern, ' +
      'gentle vertical folds down each side, rounded padded corners, no table, no legs, no furniture visible',
  },
  zabuton: {
    kind: 'prop',
    name: 'a zabuton floor cushion',
    description:
      'a single flat square Japanese floor cushion about forty centimetres across and eight thick, ' +
      'muted red fabric, piped seams round all four edges, a small tuft stitched through the centre, ' +
      'slightly puffed in the middle and compressed at the corners',
  },
  dorayaki: {
    kind: 'prop',
    name: 'a stack of three dorayaki',
    description:
      'three round Japanese dorayaki pancake sandwiches stacked neatly on top of each other, ' +
      'each about ten centimetres across, golden-brown domed castella tops with a slightly darker rim, ' +
      'dark red bean paste just visible at the seam between the two halves of each one',
  },
  house: {
    kind: 'building',
    name: "Nobita's house from Doraemon",
    description:
      'a small two-storey suburban Japanese family house: cream stucco walls, blue-grey Japanese kawara tile roof with gentle hip gable, ' +
      'a lower tile awning over the ground floor, a small entrance porch with a wooden front door with a small window, ' +
      'sliding aluminium windows, wooden shutter panels beside the upper window, a rain gutter. ' +
      'Building only, no fence, no trees, no people, no street.',
  },
};

const VIEW_TEXT = {
  front: 'Front orthographic-like view, camera at eye level, facing the viewer directly.',
  left: 'Exact left side profile view (90 degrees), camera at eye level.',
  back: 'Exact back view (180 degrees), camera at eye level.',
  'three-quarter': 'Three-quarter view from the front-left (45 degrees), camera slightly above eye level.',
};

let geminiClient = null;
const ai = () => (geminiClient ??= new GoogleGenAI({ apiKey }));

const targets = args.all ? Object.keys(SUBJECTS) : args.subject ? [args.subject] : [];
if (targets.length === 0) {
  console.error(`Pass --subject <id> or --all. Subjects: ${Object.keys(SUBJECTS).join(', ')}`);
  process.exit(1);
}

for (const id of targets) {
  const subject = SUBJECTS[id];
  if (!subject) {
    console.error(`Unknown subject "${id}"`);
    process.exit(1);
  }
  const dir = resolve(OUT_DIR, id);
  if (!PRINT_ONLY) mkdirSync(dir, { recursive: true });
  let frontPng = null;

  if (PRINT_ONLY) {
    for (const view of VIEWS)
      console.log(`${buildPrompt(subject, `${subject.name}, ${subject.description}`, view, false)}\n`);
    continue;
  }

  for (const view of VIEWS) {
    const file = resolve(dir, `${view}.png`);
    if (existsSync(file) && !FORCE) {
      console.log(`skip ${id}/${view} (exists)`);
      if (view === 'front') frontPng = readFileSync(file);
      continue;
    }
    const png = await generateView(subject, view, provider.reference && view !== 'front' ? frontPng : null);
    writeFileSync(file, png);
    if (view === 'front') frontPng = png;
    console.log(`wrote ${id}/${view}.png (${(png.length / 1024).toFixed(0)} KB)`);
  }
}

async function generateView(subject, view, referencePng) {
  const named = `${subject.name}, ${subject.description}`;
  const anonymous = subject.description;
  const attempts = [named, anonymous];
  let lastErr;
  for (const who of attempts) {
    const prompt = buildPrompt(subject, who, view, Boolean(referencePng));
    try {
      return await provider.call(prompt, referencePng);
    } catch (err) {
      lastErr = err;
      console.warn(`  retry ${view} with anonymous description: ${err.message}`);
    }
  }
  throw lastErr;
}

function buildPrompt(subject, who, view, hasReference) {
  const pose =
    subject.kind === 'character'
      ? CHARACTER_POSE
      : subject.kind === 'resident'
        ? RESIDENT_POSE
        : subject.kind === 'prop'
          ? PROP_POSE
          : subject.kind === 'plant'
            ? 'The whole plant visible with margin, centred, upright, perfectly symmetrical lighting so no side is in deep shadow.'
            : subject.kind === 'texture'
              ? 'Flat frontal view, no perspective, no ground, no shadow cast outside the subject.'
              : 'Whole building visible with margin, centred.';
  const consistency = hasReference
    ? 'Use the attached image as the exact same subject: identical colours, proportions, outfit and pose. Only the camera angle changes. '
    : '';
  // Props take the same movie-CGI look as the characters: they share a room with them.
  const style =
    subject.kind === 'plant'
      ? PLANT_STYLE
      : subject.kind === 'texture'
        ? ''
        : provider.namedIp
          ? STYLE
          : STYLE_NEUTRAL;
  // A prop's camera is part of its pose line, and for a single-image run that is the only
  // camera there is. Keeping the view sentence too would put two angles in one prompt.
  const angle = subject.kind === 'prop' && VIEWS.length === 1 ? '' : `${VIEW_TEXT[view]} `;
  return `${consistency}${angle}Subject: ${who}. ${pose} ${style}`;
}

async function callGemini(prompt, referencePng) {
  const parts = [{ text: prompt }];
  if (referencePng)
    parts.push({ inlineData: { mimeType: 'image/png', data: referencePng.toString('base64') } });
  const config = { responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: '1:1' } };
  // Only the Pro/Nano-Banana-Pro image models accept an explicit imageSize.
  if (MODEL.includes('pro-image') || MODEL.includes('banana-pro')) config.imageConfig.imageSize = IMAGE_SIZE;

  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts }],
        config,
      });
      const image = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (!image) {
        const text = res.candidates?.[0]?.content?.parts
          ?.map((p) => p.text)
          .filter(Boolean)
          .join(' ');
        throw new Error(`no image returned${text ? `: ${text.slice(0, 200)}` : ''}`);
      }
      return Buffer.from(image.inlineData.data, 'base64');
    } catch (err) {
      const status = err?.status ?? err?.code;
      if ((status === 429 || status === 503) && attempt < 4) {
        const wait = 5000 * attempt;
        console.warn(`  ${status}, waiting ${wait / 1000}s`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('unreachable');
}

// Z.AI answers with a URL rather than bytes, and the URL is short-lived, so it is fetched
// straight away. The response is whatever the service encoded — often JPEG despite the .png
// name — which Rodin accepts either way.
async function callZai(prompt) {
  const size = IMAGE_SIZE === '2K' ? '2048x2048' : '1024x1024';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch('https://api.z.ai/api/paas/v4/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt, size }),
    });
    const body = await res.json().catch(() => ({}));
    const url = body?.data?.[0]?.url;
    if (url) return await download(url);
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 5000 * attempt;
      console.warn(`  ${message}, waiting ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new Error(message);
  }
  throw new Error('unreachable');
}

// The URL is handed over before the object is readable, so a straight fetch 404s about half
// the time. Observed 2026-09-19: the file appears within a couple of seconds.
async function download(url) {
  let status = 0;
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(url);
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    status = res.status;
    if (status !== 404 && status < 500) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`image download failed: ${status}`);
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}
