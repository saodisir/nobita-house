"""Copy the surface tiles the house editor uses into public/, as WebP.

Usage: python3 scripts/editor-textures.py

The tiles are the ones `scripts/make-textures.py` writes into `assets/raw/textures/` (git-ignored,
so run that first on a fresh clone). The editor builds its house in the browser from plan data and
maps these tiles in world metres (`src/editor/house/materials.ts`), so it needs them as plain image
files rather than baked into a GLB. Both maps stay at their source size: halving the normals
averaged the tatami weave and the plaster grain away to a flat 1–2 KB image.
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "raw", "textures")
OUT = os.path.join(ROOT, "public", "textures", "editor")

TILES = (
    "stucco", "concrete", "wood", "tatami", "fabric", "jute", "bathtile", "stonetile",
    "brushed", "enamel", "formica", "katagarasu", "shoji", "cardboard", "bookcloth", "clay", "glaze",
    "leaf",
)

missing = [t for t in TILES if not os.path.exists(os.path.join(SRC, f"tile-{t}-albedo.jpg"))]
if missing:
    sys.exit(f"missing tiles in {SRC}: {', '.join(missing)} — run scripts/make-textures.py first")

os.makedirs(OUT, exist_ok=True)
total = 0
for tile in TILES:
    for kind, ext in (("albedo", "jpg"), ("normal", "png")):
        img = Image.open(os.path.join(SRC, f"tile-{tile}-{kind}.{ext}")).convert("RGB")
        dest = os.path.join(OUT, f"{tile}-{kind}.webp")
        img.save(dest, "WEBP", quality=88, method=6)
        total += os.path.getsize(dest)
print(f"{len(TILES) * 2} files, {total / 1024 / 1024:.2f} MB -> {os.path.relpath(OUT, ROOT)}")
