# Asset pipeline — reference image → Hyper3D Rodin → Blender → GLB

Manual steps are marked **(you)**; everything else runs from this repo or through the Blender MCP connection.

## 1. Reference images (Gemini or Z.AI)

```sh
bun run gen:refs -- --subject doraemon      # one subject
bun run gen:refs -- --all                   # every subject, skips existing files
bun run gen:refs -- --subject house --force # regenerate
bun run gen:refs -- --subject futon --provider zai
bun run gen:refs -- --subject futon --print # print the prompt, call nothing
```

Two back-ends, picked by whichever key is in `.env` or forced with `--provider`. They are not interchangeable:

| | Gemini (`GEMINI_API_KEY`) | Z.AI (`ZAI_API_KEY`) |
|---|---|---|
| Default model | `gemini-2.5-flash-image` | `cogview-4-250304` |
| Reference image in | yes | no |
| Default views | `front,left,three-quarter` | `front` only |
| Named film in the prompt | yes | **refused** |

Output: `assets/ref/<subject>/<view>.png`.

**These images stay on the machine.** `assets/ref/` and the house stills at the top of `assets/` are gitignored and are not part of the distributed repository: they are generated or collected reference art, including third-party material, and the build reads none of them (`.vercelignore` excludes `assets/` entirely). A fresh clone has no reference images — run `bun run gen:refs -- --all` to regenerate the views you need, and supply the house stills yourself if you want to re-measure the floor plan. The shipped GLBs in `public/models/` are already built, so none of this is needed to run the app. `scripts/make-textures.py` treats `assets/ref/tile-*/front.png` as an optional source and falls back to procedural noise when it is absent.

Only Gemini accepts an image as input, which is what keeps one subject consistent across angles: the front view is generated first and passed back for the others. Z.AI is text-to-image, so a second view would be a second object, not a second angle — it defaults to one view, and that single image is enough for a Rodin single-image run.

Z.AI also refuses any prompt that names a copyrighted film. Bisected on 2026-09-19: the futon prompt failed on the words *Stand By Me Doraemon* and passed with everything else intact, so that provider swaps in `STYLE_NEUTRAL`, which describes the same look without citing it. Its responses hand back a URL a second or two before the file exists, so downloads retry through the 404.

For a subject that needs more detail, override per run: `--model gemini-3-pro-image --size 2K`. That combination costs roughly an order of magnitude more per image, so use it deliberately. Add `--views front,left,back,three-quarter` if a back view is genuinely needed; Rodin reconstructs fine from three.

Subjects: the five characters, `mother` and `father` (the two parents, §4c), `house`, the plants, the texture tiles, and the interior props `futon`, `kotatsu-quilt`, `zabuton`, `dorayaki`. Plants use a dedicated clay-sculpture style prompt and the Pro model: photoreal foliage reads as noise to image-to-3D and produced wrong objects on Rodin. The parents take a `resident` pose rule instead of the rigging A-pose: they are never auto-rigged, and one of them is authored seated.

Props are described as the **shape they end up as**, not as the thing they relate to. "A quilt draped over a kotatsu" returned a flat quilt standing on its edge; "a thick quilt tented into a low square box shape" returned the right object. Same for the futon: `prop-04` is two metres deep, so it is prompted laid out, not rolled.

`--print` composes the prompt and calls nothing, for pasting into an image tool by hand. It selects the `manual` provider, which names no film and asks for one view, so what it prints is safe to paste anywhere. It exists so a hand-carried prompt comes out of this file instead of a copy of it that drifts away from it.

## 2. Image-to-3D on hyper3d.ai **(you)**

Per subject, in the Rodin web UI:

| Setting | Value |
|---|---|
| Mode | Image to 3D. Multi-view when the folder holds several PNGs (front first); single-image when it holds one |
| Quality | highest your plan allows |
| Pose / character option | keep the input pose (A-pose). Do **not** let Rodin re-pose or auto-rig; Mixamo does that later |
| Material / texture | PBR or "shaded" with textures on |
| Export | **GLB**, textures embedded |

Save as `assets/raw/<subject>.glb` (gitignored). File names must match the subject ids above.

## 3. Blender cleanup (me, via MCP)

`scripts/blender/prep_character.py` handles one character per run: import (GLB or FBX), pick an LOD rung if the file ships a ladder, decimate to the triangle target otherwise, drop the feet to z = 0 with the pivot centred, face −Y so the glTF export lands at +Z, and scale to the canon height.

| Character | Height | Source triangles | Shipped |
|---|---|---|---|
| Doraemon | 1.29 m | 110k | 40k |
| Nobita | 1.40 m | 7.8k vertices (`rodin/nobita3/`) | 15.6k, undecimated |
| Shizuka | 1.38 m | 7.7k quads (`rodin/shizuka3/`) | 15.5k, undecimated |
| Gian | 1.57 m | 4.2k vertices (`rodin/jaian3/`) | 33.8k, subdivided ×1 in the merge |
| Suneo | 1.42 m (canon 1.35 m, see §4b) | 7.8k quads (`rodin/suneo2/`) | 15.7k, undecimated |

Everything outdoors is procedural, split so exactly one script owns every surface. Nobita's house is not among them: since 2026-09-27 it is built in the browser from `src/editor/house/plan.ts`, the same house `/editor` shows, and set on the lot by `src/data/house-site.ts`.

| Script | Owns | Exports |
|---|---|---|
| `env_build.py` | Nobita's lot: yard, block wall, gate, shed, path, yard props | `environment.glb` |
| `streets_build.py` | the public realm: both carriageways, four sidewalk strips, kerbs and their corner arcs, markings, crossings, drains, five utility poles and their wires | `streets.glb` |
| `neighbours_build.py` | the eight neighbour lots and the sandlot (worn lawn, block walls, board fence, pipes, ring pyramid, bamboo) | `neighbours.glb` |
| `plants_build.py` | trees, hedge, cherry blossom | `props/*.glb` |

`env_helpers.py` holds what they share — the colour table, `material`, `fresh_collection`, `add_box`/`add_cylinder`/`add_sphere`/`add_wire`/`add_gable_prism`/`add_quarter_ring`, and `hex_rgba` for turning a `scene.ts` tint into a linear colour. It loads `texture_lib.py` itself, so a builder only ever execs one file:

```python
import os
SCRIPTS_DIR = f"{ROOT_DIR}/scripts/blender"
exec(open(os.path.join(SCRIPTS_DIR, "env_helpers.py")).read())
```

**Coordinates.** glTF is +Y up with the street at +Z; Blender is Z-up and its exporter maps Blender +Y to glTF −Z. `streets_build.py` and `neighbours_build.py` convert at the point of use with `P(x, z, y) → (x, −z, y)` and never flip anything afterwards. `env_build.py` predates that and negates every object's Y as the **last** thing it does — it is the only script that still works this way, and anything added after that loop exports mirrored. The same loop negates each object's rotation about Z, because mirroring across the XZ plane turns a Z rotation the other way. That matters for the open wrought-iron gate leaves, which stand 70° into the yard; the vent crosses turn about Y and are untouched. The build before the iron gate is kept in `assets/raw/backup-260913-env-before-iron-gate/`.

**Neighbour houses.** Three variants (`hip2`, `gable2`, `gable1`) whose dimensions, roof pitch and setback are the same numbers `houseVariants` and `houseTransform` hold in `src/data/scene.ts`; the Python copy names its TypeScript source in a comment block. A house is laid out in its own frame — local +X along the street, local +Z pointing at it — and `place()` rotates that frame about the house centre before translating, because `add_box` bakes translation into the mesh and rotating the object afterwards would spin it about its own origin. Yaws are quarter turns only, so the rotation is an axis swap (`swapped()`) that never touches a mesh. Rotating +Z by **+π/2** about +Y lands on +X.

Roofs are one six-vertex build for all three variants: four eave corners plus a ridge line. A ridge as long as the roof degenerates the two hip triangles into vertical gable ends, so `hip2` and both gables come out of the same function — and out of the matching `roofGeometry` in `src/scene/neighbours.tsx`, which is why the proxy and the GLB share a silhouette. In the GLB a gable drops those end triangles and `add_gable_attic` closes the end with a stucco pentagon prism 4 cm under the roof planes, so a gable end reads as wall under verge boards.

**Showa detail.** The neighbours follow the 1960s-80s Nerima suburb of the manga and `assets/home.jpg` (research: `plans/reports/researcher-260913-1449-doraemon-neighbour-house-architecture.md`). The GLB gets kawara tones in `layout.neighbours[].roof` and a tile roll along every eave, a raised ridge with onigawara end blocks (plus hip ridges on `hip2`), and a tiled skirt roof round the ground floor (`add_skirt`, all four sides on `hip2`, the front on `gable2`). Around the openings come sloped hoods, amado shutter boxes, and silver two-pane sashes with a meeting stile. The rest is a TV aerial on two-storey roofs, a laundry pole with washing on the `gable2` balcony, and pierced blocks on each lot's street wall. The skirt overhangs by the same 0.5 m as the eaves, so the roof-sized colliders and the lot-fit test still hold. The block holes use their own `block_hole` material because `NightLights` lights every `env_interior` after dark. The proxy keeps its plain massing and only shares the roof colours, the gate opening and the walk.

**Entrances and yard life** (2026-09-28). Each gate stands in line with its front door, the way Nobita's does: `neighbourEntry` in `scene.ts` gives the gate and the walk's footprint, `build_gate` builds a 1.5 m pedestrian gate — two capped piers (stone, brick or concrete by lot), two lattice leaves, one left ajar on every other lot, a lantern on one pier, nameplate and intercom on the other, a mailbox on the wall — and `build_approach` lays the walk in the lot's `approach` finish: granite slabs in courses, stepping stones in gravel, or 洗い出し concrete between kerbs. The door is a two-leaf aluminium sliding genkan door with a transom, under a wider hood with a bracket lamp; potted plants flank the step. Every house keeps a pair of propane cylinders on a side wall; houses without a balcony get a 物干し台 laundry stand in the back yard, and every third lot a mamachari by the front wall. Gate lanterns and porch lamps use `lamp_lens`, which `NightLights` lights after dark under `neighbours-root`. The lawn keeps off the walk, the step and the gas pad (`neighbourLawn`); `scene.test.ts` holds each walk clear of trees and hedges.

Anything that has to lie flat on a roof slope goes through `slope_rotation()`, never a hand-written euler. A local axis lands on a different Blender axis *and* a different direction per yaw (local +Z is Blender −Y at yaw 0 but +Y at yaw π), and a rotation about Blender X puts +Z on the opposite side of the horizon from a rotation about Blender Y. Folding in only the axis mirrors every course lip on the yaw-0 and quarter-turn lots.

**Junction corners.** `streets_build.py` cuts a kerb-radius square out of each of the four pavement corners, then fills it with `add_quarter_disc` (pavement) inside `add_quarter_ring` (kerb) — both at the same radius, so they meet with no seam — and an asphalt slab underneath for the piece the curve gives back to the road. Rounding only the kerb band leaves a square nub of pavement standing out past the curve.

Both build procedurally and export through `scripts/blender/export_glb.py`, which takes `COLLECTION` (`ENV`, `STREETS`, `NEIGHBOURS`) or an explicit `OBJECTS` list.

Rodin is deliberately **not** used for the house. Image-to-3D reconstructs organic volumes; it rounds off the straight edges, flat wall planes and repeating tile courses that architecture depends on. The house was first built in Blender by `house_build.py` for the same reason; it is now built from plan data in the browser (`src/editor/house/`, see `docs/tech-stack.md`), which is procedural too, and where every wall, opening and piece of furniture stays addressable, so doors open and rooms can be stood in. The Blender builder and `house.glb` are gone.

**The lot is 15 × 18 m** (since 2026-09-28; it was 13 m deep, which left the 11.9 m house 1 m of ground in front and none behind). The porch stands 2 m behind the front wall, where the plan's own path from the porch ends (`EXTERIOR.path`), so the gate opens onto a short walk to the door as in `assets/home.jpg`: a 1.2 m cut-stone path laid in rows that alternate one full slab with two halves over a dark bedding; kerbed shrub beds under the 洋室 window and in front of the toilet; a hedge and a flower bed along the wall; and stepping stones from the path round the house's front-west corner and down the west yard to a shoe stone at the living room's garden doors, where the stone lantern stands. The washing line stands in the west yard behind the living room, where the kitchen's glass door opens onto it. The 4.2 m back yard behind the kitchen holds the shed, by the kitchen's back door. The lot behind moved back 5 m to make room.

**Every neighbour lot matches it** (since 2026-09-28): 15 m along its street by 18 m deep, 0.4 m apart, so the block reads as one even grid; the sandlot runs 18 m deep too, its pipes against the back wall. Seven lots that size would double the instanced grass, so `NEIGHBOUR_SPACING` went from 0.065 to 0.08 m to keep each neighbour lawn under 35k blades.

The garden is grass **and** worn earth. A lawn mown to every wall reads as a lawn nobody uses, but the first answer — three tan rectangles laid as slabs by `env_build.py` down the west side, across the back and beside the east wall — read as a sandpit dropped on the lawn, whatever its colour: nobody wears ground into a rectangle. Since 2026-09-26 the worn ground is not geometry at all. `YARD_EARTH` in `src/scene/lawn-placement.ts` describes it as ground people actually wear: a trodden path from the kitchen's back door to the shed, another from the kitchen's garden door out to the washing line and along it, swelling and pinching along its length; a scuffed patch round the tap; a ring under the east tree. The walk from the gate to the garden is stepping stones, so it wears nothing. `earthDepth` turns that into one soft signed distance with a low ripple so no edge runs clean, and the same field does both jobs: it dithers the blades out across a ~30 cm band (a stray tuft survives in 1% of the dirt) and shortens them from a hand's width out, and `src/scene/yard-earth.tsx` bakes it into a lot-sized decal a few millimetres above the turf — alpha from the cover, a grey-leaning loam mottled at two scales with a little grit, and the margin pulled toward trodden turf so the lawn wears into it. It is about 7 m², against the 38 m² the slabs took. `env_build.py` no longer builds any earth, and the `sand` palette entry and tile are gone.

**Lawn shading.** The blades used to read as dark-green speckle close up: each tilted its normal across its own width and toward its face, so thousands of blades each caught the key at a different angle, the tint jittered ±5% blade to blade, and the root colour sat well below the tip. Normals now point almost straight up (a 0.12 tip toward the face), tint moves 3–4%, root and tip are a step apart (`#6BB232` → `#8EC64C`), and blades are shorter (6–14 cm) with less lean, so the lawn shades as one sward. The lawn floors in `environment.glb` and `neighbours.glb` (material `env_grass`) now receive shadows too, through `LawnGroundScene` in `lawn-grass.tsx`: the blades always did, so a tree's shadow used to land on the blades and not the ground between them, a patch of dark specks over a bright floor instead of shade.

Trees, hedge and the cherry blossom are procedural too (`scripts/blender/plants_build.py`, user decision 2026-09-10 after Rodin returned wrong objects for foliage). The two trees were redesigned on 2026-09-26 and are grown from their foliage inward: a species table (`TREE`, `SAKURA`) names tiers of cloud puffs round the trunk axis, and `grow()` routes a branch graph from the fork to every puff, splitting wherever the puffs part ways, with limb radius from the pipe model. Every puff sits on a branch that ends inside it, the limbs show through the gaps, and the crown's reach comes straight from the table. The wood (trunk, root flare, limbs, a knuckle at each fork) is swept as overlapping tubes and voxel-remeshed into one skin so forks fillet, then unwrapped along its branches for the bark normal map; the cherry turns that map a quarter round so the fissures read as a Yoshino's horizontal lenticel bands. Puffs are one metaball family each, painted with a baked vertex ramp (`COLOR_0`: deep under each puff, pale on top) and coated with alpha-clipped cards — 4,200 blossom cards on the cherry, 2,400 leaf cards on the broadleaf — over a body held to the cards' own colour range, so what shows between cards reads as shade, not as smooth balls. Puffs are polygonised fine (`PUFF_RESOLUTION` 0.05, a dozen cells across a lump), and every face buried inside a neighbouring puff is deleted (`cull_buried`, a ray-parity test) so the cards and the triangle budget land on the visible skin only. The cards are scattered on that full-detail skin; the canopy is then decimated to budget (30k cherry, 26k broadleaf) and the wood to 16k/13k, and both take their normals back from the full-detail mesh through a Data Transfer modifier (`transfer_normals`, exported as custom normals). A coarse grid showed as angular lumps and plain decimation as sliver facets, both under a low sun and under the moon (reported 2026-09-26 and 2026-09-27). The sakura is an umbrella, wider than it is tall, on four zigzag limbs; the broadleaf is a straight bole under a bubbly round crown with a dark core so gaps look into foliage. The hedge keeps the older single-dome recipe. Each tree is about 40k (broadleaf) or 46k (cherry) triangles and three draw calls. `src/scene/foliage.tsx` places instances from `src/data/scene.ts` with deterministic yaw and scale jitter, measuring model height in **world** space (meshopt quantisation moves the real scale onto the node, so geometry-space bounds are wrong).

Two lighting rules come with the redesign, both in `foliage.tsx`. A solid puff lit by N·L alone goes flat maroon on the side away from the key, which from the street is the side you see all morning, so canopies and every leaf or blossom card, the hedge's included, multiply the hemisphere term by `CANOPY_SKYLIGHT` (3.2) through an `onBeforeCompile` patch; it scales with the sky, so trees still darken at dusk and night. And cards neither cast nor receive shadows: the puff body casts for them, and card shadows speckle it.

**Canopy clearance.** `build_all()` prints each model's reach from the trunk over its height (tree 0.478, sakura 0.492 at the 2026-09-27 build); `layout.canopyRatio` is that × 1.08 for the scale jitter, and `scene.test.ts` holds every trunk that far clear of its lot's house. The wider sakura dropped three placements: the hero tree 4.1 → 3.4 m (it stands 1.86 m from the house), `[-24.5, -9.5]` 4.0 → 3.4 m, `[5.9, -14.6]` (then at z −9.6) 5.4 → 4.7 m. Re-measure after changing a tier table.

Rebuild: run the command in the script's docstring with `EXPORT_DIR` pointing at `assets/raw/final/props`, copy that `props/` folder alone into a scratch directory, and `bun run assets:build -- --in <scratch> --out public/models`, so the other models' binaries stay untouched.

The interior is procedural too, and lives with the house: `src/editor/house/build-furniture.ts` builds every piece in `plan.ts`'s item list from boxes, rounded boxes and cylinders, and `src/editor/house/doors.tsx` hangs every door and animates it on click. The Blender interior (`interior_build.py`, `soft_shapes.py`, `interior.glb`, `interior-parts.glb`) was removed with the old house on 2026-09-27.

One rule from it still holds: "hard edges procedural, soft things Rodin" is the wrong split for bedding. A futon is not organic; it is a padded slab two metres by ninety. A CC BY Sketchfab sculpt at 17.9k triangles and a CC0 Kenney bedroll (a camping roll wearing a futon's dimensions) were both tried and rejected before it was built procedurally.

The reference images in `assets/ref/{futon,kotatsu-quilt,zabuton,dorayaki}/` are what these shapes were measured against. They are references, not inputs: nothing reads them.

## 4. Animation

Two layers, both honouring `prefers-reduced-motion`:

- **Procedural idle** (`src/scene/use-character-motion.ts`): breathing bob with a matching squash, slow sway, hover lift. Phase-offset per character.
- **Skeletal welcome bow** (`scripts/blender/rig_welcome.py`, user request 2026-09-10): each shipped GLB carries a vertical bone chain and one `welcome` clip — bow toward the street, hold, rise (48 frames at 24 fps). Vertices are weighted by smooth height bands instead of bone-heat, which is deterministic and exactly sufficient for a bow; it also works with every held prop and fist the sculpts arrived with, where a full Mixamo limb rig would fail. The app plays the clip once per selection and suppresses its procedural hop when the clip exists.
- **Skeletal walk cycle** (same script, for walk mode): a `leg_l`/`leg_r` bone per side hangs from the hip to the floor under the bottom band bone, and a 24-frame `walk` clip swings them contact → passing → opposite contact → passing, with frame 24 repeating frame 0. Counting from zero matters: the exporter writes keyframe times as `frame / fps`, so keying 1–25 would ship a 1.042 s clip with nothing to play over its first 42 ms — a 4% foot slip and a freeze at every contact. Both clips go onto their own NLA track and the armature is left with no active action, which is what makes the exporter ship two animations instead of one. The app loops `walk` while a character is out walking, at `timeScale = speed / stride`, and keeps it under `prefers-reduced-motion` — the character is travelling either way, and frozen legs would only slide.

Each profile names a `legs` band: `top`, the height fraction where leg weighting stops; `spread`, how far out the bones sit; and `swing`, the peak angle. The split plane is the legs' own centre line, measured across a slab at shin height — never the chain's `axis_x`, which is measured at chest height where the arms and held props drag the bounding box sideways (on Nobita that put the split 10 cm inside his left leg and both legs ended up on one bone). Leg weighting also stops past the widest point of the feet, so a hand hanging at the character's side — Gian's fist reaches 64 cm out — never swings with a leg. Below `top` the bottom band's weight is split left/right over a 3 cm cross-fade and blended back into the body over the same width the chain uses, so nothing above `top` — the bow included — changes. `top` is 0.40 h for the humanoids and 0.32 h for **Shizuka**, just under the hem where her width jumps from 23 cm to 39 cm; weight anything above it to a leg and the skirt swings open. The 28° swing is far wider than a real hip angle because these legs have no knee or ankle: the swing alone has to cover the stride, and a wider angle also tilts the rigid sole up out of the pavement instead of into it. **Doraemon had no walk clip on this rig** (he has a Mixamo `walk` since 2026-09-13, see §4b): his old mesh ran straight across the middle at every height — boots welded to a barrel — so a left/right split shears him, and the 0.22 m his boots could cover per cycle would need nine steps a second at walking pace. He keeps the procedural waddle, which is also the live test that the missing-clip fallback works. The script prints the ground each rigged character actually covers per cycle, measured off the posed mesh; that number is `stride` in `src/data/characters.ts`, and the app's playback rate depends on it matching (0.73–1.03 m, about 0.55 h, not the 0.75 h a knee would buy).

The chain is a per-character profile in the script. Humanoids get four bones (root / spine / chest / head, ~34° cumulative). Doraemon gets two (root / body, 18° at the hips): his head fills the top 55% of his height and any joint inside it kinks the sphere, and the ice-cream cone he holds runs from mouth to shin, so he bows as one rigid block with only the legs blending. The chain's pivot is the bounding-box centre of a thin slab at the first joint — never the vertex centroid, which the dense front-facing arms, face and props drag forward by a quarter metre on Doraemon.

The rig script is idempotent over its own output: re-running it on an already-rigged GLB strips the old armature, vertex groups and stale actions before rebuilding. Export one character with `OBJECTS = ["<id>", "<id>_rig"]` in `export_glb.py`, then `bun run assets:build -- --in <dir-with-only-that-file> --out <tmp>` and copy the result into `public/models/characters/`, so the other characters' binaries stay untouched. Blender 5 note: `action.fcurves` is gone (layered actions); new keyframes default to bezier anyway.

## 4b. Mixamo humanoid rig (Dekisugi shipped, `plans/260912-1356-character-studio-mixamo/`)

The hand-built rig above can bow and step and nothing else — it has a torso and two legs, no arms, hips or neck. A full motion set (idle, run, wave, jump, think, cheer) needs a real humanoid skeleton, so one character at a time goes through Mixamo. **Dekisugi is the pilot**: he is the only one of the six with empty hands and no held prop.

**Step 1 — export the mesh alone (me).**

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-expr \
  "CHAR_ID='dekisugi'; exec(open('scripts/blender/export_mixamo_in.py').read())"
```

`scripts/blender/export_mixamo_in.py` reads `assets/raw/final/characters/<id>.glb`, throws away the armature, its vertex groups, the modifiers and every action, empties the scene first (a headless Blender starts with a cube, a camera and a light) and writes `assets/raw/mixamo-in/<id>.fbx` with the texture embedded. Adobe's auto-rigger fails on a file that holds anything besides the character, which is what the asserts guard: one object, upright, 1–2 m tall, feet at z = 0. Dekisugi comes out 6.3 MB, 45k triangles, 0.56 × 0.48 × 1.42 m.

**Step 2 — auto-rig on mixamo.com (you).** Upload the FBX, place the markers (chin, wrists, elbows, knees, groin), **Skeleton LOD: No fingers** — the sculpts have fist hands with no separated fingers, and asking for finger bones on them yields one bone per hand. Then judge the rig preview at its extremes: play *Cheering* (arms above the head) and *Running* (extreme hip and knee) and look at the shoulder seam, the inner thigh, the neck and collar, and the ankles. Tearing there does not improve later.

Adobe's own requirements, in order of how often they bite: humanoid with distinguishable head/body/arms/legs · T-pose preferred, relaxed A-pose usually accepted, arms and legs **clear of the torso** · no props, wings, tails or large hair · nothing else in the file · no disjoint parts. Dekisugi's arms hang at his sides with a small gap, which is at the edge of that comfort zone. If the rigger refuses him or the shoulders tear, take the next rung: re-pose the arms to ~45° in Blender with a throwaway two-bone-per-arm armature and automatic weights, apply, re-export, re-upload — the pose only has to get the arms off the ribs, because Mixamo re-rigs whatever it is given. Last rung, and only with a user decision: re-sculpt from T-pose references (`bun run gen:refs` already prompts an A-pose; Dekisugi never went through it, `assets/ref/` holds a single supplied `dekisugi.png`).

**Step 3 — download (you).** The character once, then each clip:

| Download | Settings | Save as |
|---|---|---|
| Rigged character | FBX, **With Skin**, T-pose | `assets/raw/mixamo-out/<id>/character.fbx` |
| Each animation | FBX, **Without Skin**, 30 fps, keyframe reduction **none**; **In Place** when the clip offers it | `assets/raw/mixamo-out/<id>/anim/<clip-id>.fbx` |

Clip ids are the sixteen in `src/data/animations.ts`: `idle`, `look-around` (*Looking Around*), `sit` (*Sitting Idle*), `walk`, `run`, `think`, `talk` (*Talking*), `clap` (*Clapping*), `dance` (*Silly Dancing*), `wave`, `welcome`, `nod` (*Head Nod Yes*), `jump`, `laugh` (*Laughing*), `victory` (*Victory*) and `cheer`. The last eight of those picks joined on 2026-09-13. Eight more followed the same evening: two dances every character carries, `house-dancing` (*House Dancing*) and `swing-dancing` (*Swing Dancing*), and one resting clip per character, merged only into that character's GLB and held at home to match `assets/home.jpg` — `sit-wall-laugh` (Gian), `sit-wall-talk` (Suneo), `sit-ground-happy` (Nobita), `stand-happy` (Shizuka), `stand-calm` (Dekisugi), `stand-cheerful` (Doraemon). A merge passes `CLIPS` = the sixteen + the two dances + the character's own clip, and `RODIN_DIR` = the sculpt that character ships from (`dekisugi3`, `suneo2`, `shizuka3`, `jaian3`, `nobita3`, `doraemon3`). With nineteen clips each GLB ships at 1.02–1.20 MB. The files before this merge are in `assets/raw/backup-260913-2150-clips/`. Nobita later gained a twentieth, `sitting-pose` (*Sitting Pose*), which he holds at the gate; he ships at 1.09 MB, and his previous files are in `assets/raw/backup-260913-nobita-before-sitting-pose/`. That download is a still pose, two keys a frame apart, so its glTF clip lasts 0.033 s. The app loops it, which three.js handles as a held pose because the duration is not zero. Render a new clip on its own skeleton before placing it: a clip's name does not say whether it expects a wall, a chair or the floor. `stand-calm` turned out to be a wall lean. The file name **is** the contract with the merge script, so name by id, not by Mixamo's title (`welcome` is Mixamo's *Standing Bow*, and it keeps that name because the app already plays a clip called `welcome`). Keyframe reduction is off because Mixamo's reducer is not loop-safe. "In Place" is a convenience, not a requirement: the merge script strips root travel from the locomotion clips itself.

**The clip set is shared.** The rig is per character, but an animation FBX holds only keyframes on a skeleton whose bone names every auto-rig repeats, so the eight clips are downloaded once and reused. `mixamo_merge.py` reads `anim/` beside the character when it exists and `assets/raw/mixamo-out/<pilot>/anim/` (`CLIP_SOURCE`) otherwise, scaling the `Hips` location track by the ratio of the two skeletons' leg lengths (hip joint to ankle, measured in armature space on the target rig and on the armature inside each clip FBX). That track is in the source rig's units and sized to its legs, so a longer-legged character would otherwise crouch and a shorter one float. Canon height is the wrong ruler: chibi heads take a different share of each character's height, and each auto-rig keeps its own unit scale. Dekisugi's T-pose rig measured 1.113 against the clips baked on his first sculpt.

**Step 4 — merge (me).**

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python-expr \
  "CHAR_ID='dekisugi'; CLIPS=['idle','walk','run','welcome','jump','think']; exec(open('scripts/blender/mixamo_merge.py').read())"
bun run assets:build -- --in <dir holding only that glb> --out <tmp>   # then copy the one file
```

`scripts/blender/mixamo_merge.py` imports the rigged character, normalises it the way `prep_character.py` does (canon height, feet on z = 0, pivot centred), imports each animation FBX, renames its single action (Mixamo calls every take `mixamo.com`) to the clip id, pushes it onto its own NLA track and deletes the spare armature, then exports through `export_glb.py`. Bone names match across every file from one auto-rig, so applying a clip is an assignment, not a retarget; a prefix mismatch (`mixamorig1:`, `mixamorig5:`) is a hard error, because it assigns cleanly and moves nothing. Five things it fixes that Mixamo does not:

- **Facing** is read off the legs (`LeftUpLeg` vs `RightUpLeg`): with up = +Z, a character whose left side is at +X faces −Y, which the exporter turns into the +Z the app wants. `YAW_DEGREES` overrides it.
- **Root travel** is stripped from `walk`/`run`, because `use-walker.ts` owns world travel and Dekisugi's *Walking* download carried 0.97 m of it per cycle — a metre of drift and a snap back every cycle. Pose locations are in FBX units (centimetres), so the test is scaled: a quarter metre of motion is travel, five centimetres is the gait's bob.
- **Clip start** is shifted to frame 0. The glTF exporter writes a key's time as `frame / fps`, so a Mixamo clip keyed from frame 1 ships 33 ms of dead air and stalls at the loop seam.
- **Arm bleed** is clamped: on these chibi sculpts the sweater hem sits at armpit height and Mixamo weights it to `*Shoulder`/`*Arm`, so raising an arm drags the hem out into a flat wedge. Skin further than 7.5% of body height from the arm's own bone chain loses its arm weight to the spine, cross-faded from 3.5% — the same deterministic geometry `rig_welcome.py` weights by. Skin within 7.5% of the hand and finger bones is exempt: the measurement is taken in the T-pose bind, where nothing but the hand comes that close, and an open-handed sculpt's palm edge sits 5–7 cm off the bones. Clamping it left a flap of hand skin trailing behind every arm swing.
- **Fingers** are folded into the hands. A rig downloaded with finger chains ("2 chains" and up) hangs the whole fused Rodin hand off the short index chain, and the shared clips carry finger keys authored on another auto-rig's hand, so the fingers stretched and a spike stood out of the wrist. Every finger group's weight goes to its `*Hand` group and the finger curves are dropped from each clip, so a hand moves as one rigid piece. A No Fingers rig is unaffected.

**What Dekisugi cost.** The first sculpt (`rodin/dekisugi/`) had its sleeves fused to its sides, so any arm above the shoulder stretched a membrane from hem to fist; it shipped six clips without `wave` and `cheer`. On 2026-09-13 it was replaced by a T-pose Rodin sculpt (`rodin/dekisugi2/base_basic_pbr.fbx`, 700k triangles, prepped to 45k at 1.42 m): arms clear of the torso, re-rigged on Mixamo (No Fingers), merged against the same eight downloaded clips with no new downloads. All eight ship, and `wave` and `cheer` hold up with both hands over the head. The arm-bleed clamp still runs and is harmless on a T-pose. 0.64 MB optimised; the walk clip's stride is still 0.97 m. The previous raw and shipped files are kept in `assets/raw/backup-260913-dekisugi-old/`.

Later the same day it was replaced again, by a Rodin **quad-mesh** T-pose sculpt (`rodin/dekisugi3/base_basic_pbr.fbx`, 8k quads = 16k triangles, shipped undecimated). The mesh is low-poly, so the normal map carries the folds; it survived the Mixamo round trip, and `mixamo_merge.py` refills it from `RODIN_DIR` when it does not. The rig was downloaded with finger chains, which get folded into the hands. The same eight clips were reused: the leg-length ratio came out at 1.135, and the lowest point of the mesh stays within −5/+12 mm of the ground through `walk`. With the hips scaled, the stride is 1.07 m, measured from the planted toe's speed. The earlier 0.97 m came from root travel on the source rig, before scaling. 0.64 MB optimised with eight clips. The T-pose sculpt's files are kept in `assets/raw/backup-260913-dekisugi2/`. The eight clips added afterwards were downloaded on the new rig (leg ratio 1.01), and all sixteen weigh 1.01 MB optimised, under the 1.7 MB budget. *Silly Dancing* is the heaviest at 15 s. *Clapping* wanders 0.28 m but ends where it started. *Sitting Idle* reclines on the floor with the seat 6 cm below ground level. The user asked on 2026-09-13 to raise it by 6 cm; the ground clamp below now does that per character.

**Ground clamp.** Rotations transfer exactly between skeletons, proportions do not. After every clip is built, `keep_above_ground` in `mixamo_merge.py` poses the mesh on every frame and raises the `Hips` track by however far its lowest vertex sank below the floor. Frames in the air are never lowered, and sinking under 2 mm is ignored. The lift is carried along world up into the Hips bone's rest frame, so no curve index is guessed. It replaced a fixed per-clip `GROUND_LIFT` after Suneo: his foot bone is 27 cm on a 41 cm leg, against Dekisugi's 19 cm on 49 cm. Every toe-off pushed the long shoe 7–11 cm into the pavement, and the 6 cm sit lift still left him 2.8 cm under. On Dekisugi the clamp reproduces the 6.1 cm sit lift and moves nothing else by more than 0.5 cm.

**Suneo (2026-09-13)** is the second character on the Mixamo rig. His source is a Rodin quad T-pose sculpt (`rodin/suneo2/`, 7.8k quads, prepped to 15.7k triangles) with its own Rodin colours, blue shirt and green shorts. The user chose not to recolour it, so the old `suneo` rule in `recolor-character-texture.py` no longer applies to the shipped model. The rig came with finger chains, which get folded.

The user asked for two changes to his build, both on 2026-09-13. First, he now stands at **1.42 m**, Dekisugi's height, instead of the canon 1.35 m. Second, his proportions are corrected, because at 1.35 m the sculpt read as a short body on big hands and shoes. `PROPORTIONS` in `mixamo_merge.py` stretches his legs ×1.15 between ankle and hip, which makes the head smaller once he is normalised back to height. It also shrinks his hands ×0.8 toward the wrist and his feet ×0.8 toward the floor under the ankle. `reshape()` moves the bind-pose vertices and the edit bones by the same map, blended by skin weight at the wrist and ankle, so the Mixamo rig is reused and nothing is re-uploaded. Snapshot the rest bones before writing any of them: a connected child's head is its parent's tail, so reading while writing moves every shared joint twice, and the shoulders tore out into wings.

All sixteen shared clips ship at 0.86 MB, with leg ratios of 0.95 on the clips from Dekisugi's first rig and 1.067 on the later ones. After the clamp, every clip keeps its lowest point within 2 mm of the ground, except `run` at ±1.5 cm between keys. His `stride` is 1.07 m, Dekisugi's, also by user decision. Source travel × leg ratio estimates 0.92 m, which is the number to try if his feet slide in walk mode. His previous files are in `assets/raw/backup-260913-jaian-suneo/`.

**Shizuka (2026-09-13)** is the third character on the Mixamo rig. Her source is a Rodin quad T-pose sculpt (`rodin/shizuka3/`, 7.7k quads, prepped to 15.5k triangles at the canon 1.38 m), kept in Rodin's pink blouse and blue skirt. No proportion fix was applied. The rig came with finger chains, which get folded. All sixteen shared clips ship at 1.02 MB, with leg ratios of 1.023 and 1.15. The ground clamp raises `sit` 9 cm and everything else at most 2.7 cm. Every clip then keeps its lowest point within 2 mm of the ground, except `run` at ±1 cm. Her `stride` of 0.99 m is estimated as source travel × leg ratio.

The skirt, which phase 5 flagged as a risk, holds through `walk` and `run` with no membrane between the legs. It does ride up into lumps when a thigh lifts high, in the air of `jump` and in the squat of `dance`, because Mixamo weights the hem to the thighs. The fix, if wanted, is to move the skirt's weight toward `Hips` in the merge script. Her previous files are in `assets/raw/backup-260913-shizuka/`.

**Estimating stride.** Take the travel `mixamo_merge.py` prints for `walk` ("… m of root travel removed") and multiply it by the leg ratio of the `walk` clip, the first `hips scale` value. Do not use Dekisugi's 0.97 m: the printed travel is converted with the target rig's own unit scale, and each auto-rig keeps its own. On Dekisugi this estimate came within 3% of a planted-toe measurement.

**Jaian (2026-09-13)** comes from a newer Rodin sculpt (`rodin/jaian3/`, 4.2k vertices). The user uploaded `base_basic_pbr.fbx` straight to Mixamo, which is fine: the merge normalises height itself. Four problems had to be fixed in the merge:
- The Mixamo download wires Rodin's `shaded.png`, a bake with the lighting included, into Emission. The merge now drops any Emission link, and it also zeroes Emission Color and Strength. Unlinking the socket alone leaves it at its default white. The exporter then writes `emissiveFactor [1, 1, 1]`, and Jaian and Nobita first shipped as flat white silhouettes.
- The Normal socket arrived plugged into a Normal Map node with no image behind it. Refilling now checks whether an image actually feeds the socket, not whether the socket is linked, so the `jaian3` diffuse and normal maps are restored.
- The mesh was faceted and too coarse to bend: the stripe zig-zagged on a stride and the hem broke into shards. `SUBDIVIDE = {"jaian": 1}` applies one Catmull-Clark level ahead of the armature modifier, giving 33.8k triangles with interpolated weights. UVs are left unsmoothed: smoothing slid texels across the Rodin atlas seams.
- His belly hangs past the hip joint and Mixamo weights that hem to the thighs. `HEM_TO_HIPS = {"jaian": 0.06}` moves thigh weight above the hip joint to `Hips`, fading out over 6% of height below it.

`jump` and `sit` are clean after that. A few small notches remain on the stripe where it crosses a texture seam, and the collar pulls with the head in `think`.

**Jaian's arms.** His upper arms first shipped creased flat at rest. The cause was the arm-bleed clamp. His sleeve skin sits a median 7% of height from the arm bones, and 18% at the 99th percentile. The default 7.5% drop therefore handed 453 of 1,066 strongly arm-weighted vertices to the spine, and that skin stayed behind when the arm came down from the T-pose. Turning the clamp off rounded the arms but let them suck in his flanks. Widening it to 10/15% everywhere dragged the belly stripe diagonally whenever an arm lifted.

The fix is two bands: `ARM_BLEED = {"jaian": (0.035, 0.075, 0.12, 0.18)}`. The default band applies inboard of the shoulder joint, where flank and chest skin must follow the body. The wide band applies to the sleeve, measured along the upper arm from the `Arm` bone head. The switch ramps over 5% of height past the joint; a hard switch at the joint plane tore a shard out of his flank in `clap`. At rest, the arms are now round with a straight stripe. `cheer` is clean, and `clap` leaves only a small notch at the stripe's edge. The result is 0.99 MB at the canon 1.57 m, leg ratios 1.236 and 1.389, stride about 0.99 m (0.80 × 1.236). His previous files are in `assets/raw/backup-260913-jaian-suneo/`.

**Nobita (2026-09-13)** comes from `rodin/nobita3/` (7.8k vertices, 15.6k triangles, 4K maps). His rig has no finger chains. The same Emission and normal fixes apply; no subdivision or hem fix was needed, and every pose rendered clean, glasses included. The result is 1.28 MB, the heaviest of the six because of the 4K diffuse, at the canon 1.40 m, leg ratios 1.432 and 1.609, stride about 1.02 m (0.71 × 1.432). His previous files are in `assets/raw/backup-260913-nobita/`.

**Doraemon (2026-09-13)** is the sixth character on the Mixamo rig, which phase 5 had expected to fail. His source is `rodin/doraemon3/`, a 4.1k-vertex T-pose sculpt. Both Rodin Doraemons that day grew a second, off-centre tail on the left flank. `scripts/blender/remove_stray_tail.py` removes it before prep:
- It samples the diffuse for every face and groups strongly red faces into connected blobs.
- It deletes the one blob that is behind the body, at hip height and off the spine line, together with one ring of faces around it.
- It fills and relaxes the hole, and gives the patch a blue body texel.
- It aborts unless it finds exactly one stray tail and one centre tail.

The result goes to `rodin/doraemon3/base_notail.fbx`.

Mixamo was sent the raw sculpt (4,128 vertices, stray tail included), not that cleaned file, and the tail shipped. So `STRAY_TAIL = {"doraemon"}` in `mixamo_merge.py` now calls the same `remove_stray_tail()` on the rigged mesh, right after import and before subdivision. It passes `RODIN_DIR/texture_diffuse.png`, because the Mixamo material only carries `shaded.png`. The function's thresholds are fractions of the mesh's own height, so they hold in both frames. Vertices created to close the hole take the rim's averaged skin weights, so the patch moves with the body.

Mixamo rigged him with his arms at 43% of height, clavicles buried inside a ball-shaped body, and Head bone weight on everything from 48% up. Three fixes in `mixamo_merge.py` make him hold together:
- **`SUBDIVIDE`**: one level, 34.1k triangles.
- **`SHOULDER_TO_CHEST`**: the clavicles weighted his flanks from 28% to 49% of height, and the clips shrug them on every step, so all shoulder skin goes to `Spine2`. Narrowing the arm band instead did not help: 0/2%, 2/6% and 3.5/7.5% inboard were all tried. The narrower bands also pulled spikes out of the collar.
- **`HEAD_SPLIT = (0.495, 0.01, 0.45)`**: rigid head above 50.5%, head-free body below 48.5%, and no arm weight on skin above 45% inboard of the shoulder joints. His collar, measured off the texture on the back, runs 45.1–48.9% and his chin starts at 48.5%. Before this fix the collar tore into red shards on every swing.

He ships at 0.98 MB and 1.29 m, with leg ratios of 0.766 and 0.861. Two limits remain. `sit` reclines in mid-air, because his stub legs cannot take the pose and the clamp lifts him 33 cm. `jump` leaves a small shard at the belly. His previous files, and both earlier attempts, are in `assets/raw/backup-260913-doraemon/`.

## 4c. The two parents — sculpt only, no rig

玉子 and のび助 are set dressing inside the house: a sculpt each, no skeleton, no clips, no interaction. Both are authored in `src/data/residents.ts` — where they stand, which way they face, how tall they are, and the one-line brief for the sculpt.

**Built and switched off.** `residentsEnabled` in `residents.ts` is `false` (user's call, 2026-10-31): until the sculpts exist the rooms stand empty, because a stand-in figure at the counter reads as a mistake rather than as a placeholder. The placements below are kept and still tested; turning them back on is that flag plus the two files, with no code to write.

| Step | Who |
|---|---|
| Reference images: `bun run gen:refs -- --subject mother`, same for `father`. No key on this machine — add `--print` and paste the prompt into any image tool | `bun run gen:refs` |
| Image-to-3D on hyper3d.ai, single image, keep the input pose | **(you)** |
| Export GLB, drop it at `public/models/residents/<id>.glb` | **(you)** |
| `bun run assets:build` if the file needs welding | me |

Nothing else is needed: `src/scene/residents.tsx` HEAD-checks the two files, fits whatever arrives to the height in `residents.ts` (scale by bounding box, bottom on the figure's own floor, centred), and turns on shadows. A missing file renders nothing — there is no stand-in to remove later.

Two things worth knowing before the sculpt is ordered. The father is authored **seated**, legs folded, forearms forward at a low table; a standing sculpt cannot be folded down to fit, and the kotatsu hides the legs anyway. The mother is authored **standing**, hands together, in an apron. Rodin exports face −Y (glTF +Z), which is the convention `residents.ts` assumes; a sculpt that arrives facing the other way is turned with `modelYaw` rather than re-exported.

## 5. Surface textures

`scripts/make-textures.py` produces every texture the builders use, into `assets/raw/textures/`:

- **Leaf and blossom cards** are keyed from Gemini clusters (backdrop sampled from the corners, foreground colour bled into transparent texels). `plants_build.py` scatters hundreds of them tangent to each canopy, exported as `alphaMode: MASK` through a Greater Than node on the alpha socket (Blender 5 has no CLIP mode). Cards neither cast nor receive shadows, carry faint emission, and take the same extra skylight as the canopy under them (`foliage.tsx`), so faces turned from the sun stay readable.
- **Material tiles** (stucco, concrete, asphalt, grass, wood) are procedural wrapped fractal noise — seamless by construction — with mean luminance normalised to 0.8 so the palette colour that multiplies them still sets the hue. Grass targets 0.75 instead: it is green enough that 0.8 clips its green channel and washes the bright areas out to yellow. The lawn is a smooth kept-lawn tile of soft darker drifts and a faint grain, repeating every 7.5 m; on every lot the app grows instanced grass blades over it at runtime (`src/scene/lawn-grass.tsx`, placed by `lawn-placement.ts`; ~27k on Nobita's lot, ~27k on each neighbour's), so the tile only shows between blades and past their fade distance. The lawn keep-outs mirror the props in `env_build.py` and the step and AC unit in `neighbours_build.py`, so moving one of those means moving its keep-out too. `python3 scripts/make-textures.py tile-grass` regenerates only the named tiles; seeds are fixed, so a rerun reproduces the same texture. A Gemini source at `assets/ref/tile-*/front.png` is used instead when present. Gemini was rate-limited (429) on both models when the tiles were needed, which is why the procedural path exists. `tile-fabric` (a plain weave of 3 mm threads at 0.3 m per repeat) and `tile-jute` (a basket weave of 19 mm blocks at 0.45 m) are woven from stripe profiles rather than noise, like the plaid: on upholstery and a rug, flat colour reads as moulded plastic from across the room. Laid surfaces use one recipe with three settings: `tile-bathtile` (10 cm glazed tiles, pillowed edges, grey grout), `tile-stonetile` (30 cm mottled stone, fine joints) and `tile-vinyl` (30 cm cushion-vinyl checker). `tile-brushed` is stainless steel, `tile-enamel` baked enamel and porcelain, and `tile-katagarasu` the dimpled Showa patterned glass, whose look lives mostly in its normal map. White and bright tiles keep their own luminance targets in `make-textures.py` so they do not grey the palette colour. `scripts/editor-textures.py` copies the tiles the house uses into `public/textures/editor/`. `tile-plaid`, `tile-clay`, `tile-print`, `tile-glaze`, `tile-vinyl`, `tile-leatherette`, `tile-speckle`, `tile-cardboard` and `tile-leaf` were made for the Blender interior; nothing ships them since it was removed.
- **Cellular tiles** use `worley()` in `make-textures.py`, a jittered-grid distance field that wraps at the tile edge: `tile-leatherette` (the kitchen chairs' pebbled vinyl) draws its grain from the nearest/second-nearest distance gap. The kitchen's other finishes are flecked melamine (`tile-formica`, table) and speckled enamel (`tile-speckle`, gas table); the speckle tile keeps a dark 0.32 mean under a pale palette tint, because a multiply cannot lift specks above its colour.
- **Normal maps** for bark and every tile come from a Sobel filter over luminance.

`scripts/blender/texture_lib.py` is exec'd by `env_build.py`: `TILES` maps palette colour names to a tile, a metres-per-repeat and a normal strength; `tiled_material` builds albedo × colour (exported as `baseColorTexture` × `baseColorFactor`) plus the normal map; `apply_world_uvs` box-projects UVs from world coordinates along each face's dominant axis after all geometry edits, so tiles run continuously across every part without unwrapping. Everything ships as WebP; total `public/models` is under 7 MB.

## 6. Recolouring a texture

Rodin does not always hit the canon palette. `scripts/recolor-character-texture.py` holds one rule table per character and rewrites only the measured HSV regions of the diffuse map, keeping the original shading. It reads the texture straight out of the raw GLB, so no manual extraction step exists.

Applied so far: Gian (yellow shirt → orange, magenta stripe → cream, brown trousers → navy), Suneo (blue shirt → green, teal shorts → brown). The `shizuka` rule (blue skirt → red) belongs to the first sculpt in `rodin/shizuka/`; the shipped model comes from `rodin/shizuka2/`, which Rodin delivered in the canon pink and red, so it is prepped without an override. To fix a future model, add a rule entry with gates measured from its hue histogram, run the script, and swap the image in Blender via `DIFFUSE_OVERRIDE` in `prep_character.py`.

## 7. Optimise

```sh
bun run assets:build   # gltf-transform: weld → simplify guard → resize textures → meshopt
```

The app (`src/scene/model-or-proxy.tsx`) HEAD-checks every model URL at start. Anything missing renders as a placeholder, so partial delivery is fine.

### The house editor's tiles

```sh
bun run editor:textures        # after scripts/make-textures.py
```

The house editor (`/editor`) does not load a GLB: it builds its house in the browser from `src/editor/house/plan.ts`. It maps the same neutral surface tiles the Blender builders use, at the same metres-per-repeat (`src/editor/house/materials.ts` mirrors `texture_lib.py`), so it needs them as plain images. `scripts/editor-textures.py` copies thirteen of them from `assets/raw/textures/` to `public/textures/editor/` as WebP, 1.2 MB in all. Normals stay at 1024: halved, the tatami weave and the plaster grain averaged out to a flat 1–2 KB image.

## Where files live

| Path | Contents | Tracked |
|---|---|---|
| `assets/ref/<subject>/` | Gemini / Z.AI reference PNGs | no — local only, regenerate with `bun run gen:refs` |
| `assets/*.jpg`, `assets/*.png` | House stills and floor plans the plan was measured from | no — local only, third-party reference material |
| `assets/raw/rodin/<subject>/` | Rodin downloads, as delivered | no |
| `assets/raw/final/` | Blender exports, pre-optimisation | no |
| `public/models/` | Optimised GLBs the app loads | yes |
| `public/models/residents/` | The two parents' sculpts; absent means the stand-in holds the place | yes |
| `public/textures/editor/` | Surface tiles the house editor maps | yes |

Current payload: the house's surface tiles 1.25 MB (`public/textures/editor/`), `neighbours.glb` 1.02 MB, `environment.glb` 0.30 MB, `streets.glb` 0.52 MB, six characters 3.48 MB, three props 1.61 MB — 8.2 MB in total. The leg bones and walk clips cost 0.05 MB across all six; Dekisugi's T-pose sculpt with the Mixamo rig and eight clips costs 0.21 MB more than his old two-clip hand rig.

`mixamo_merge.py` writes over `assets/raw/final/characters/<id>.glb`, the same path `prep_character.py` + `rig_welcome.py` produce, so the hand-rigged intermediate for a migrated character is gone after a merge — re-run those two scripts to get it back.

`build-assets.mjs` runs `flatten` and `join` on non-character models before welding, merging their hundreds of parts into one mesh per material. That took the scene from 304 draw calls to 68 with no visual change.
