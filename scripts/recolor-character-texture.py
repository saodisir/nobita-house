"""Recolour a Rodin character texture to the canon Doraemon palette.

Rodin does not always hit the canon outfit colours. Each rule rewrites one measured HSV
region of the diffuse map while keeping the original shading, so the result still reads as
the same sculpt. Region gates were measured from the actual textures (hue histograms in
plans/260910-1419-*/phase-04-character-pipeline.md); skin, hair and shoes sit outside the
gates and are untouched.

Masks are computed from the source image before any rule is applied, so one rule's output
can never leak into another rule's gate.

Usage:
    python3 scripts/recolor-character-texture.py gian
    python3 scripts/recolor-character-texture.py shizuka suneo
    python3 scripts/recolor-character-texture.py --all

Reads the base colour straight out of `assets/raw/rodin/<folder>/base_basic_pbr.glb`
(or a loose `texture_diffuse.png` when present). Writes `assets/raw/<id>-diffuse-canon.png`.
"""

import io
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# One entry per character that needs correction. hue is (lo, hi) degrees on the SOURCE image;
# to_hue re-centres the region, spread keeps a fraction of the original hue variation.
RULES = {
    "gian": {
        "folder": "gian",
        "regions": [
            {"name": "shirt -> canon orange", "hue": (25, 75), "sat_min": 0.60, "val_min": 0.45,
             "to_hue": 27.0, "spread": 0.30, "sat_mul": 1.02, "val_mul": 0.97},
            {"name": "stripe -> cream", "hue": (280, 345), "sat_min": 0.20,
             "to_hue": 46.0, "sat_mul": 0.30, "sat_max_out": 0.30, "val_mul": 1.30},
            {"name": "trousers -> navy", "hue": (5, 35), "sat_min": 0.70, "val_max": 0.45,
             "to_hue": 219.0, "sat_mul": 0.62, "sat_clamp": (0.35, 0.75), "val_mul": 1.25},
        ],
    },
    "shizuka": {
        "folder": "shizuka",
        "regions": [
            # Measured: skirt = hue 195-245 at sat ~0.7; blouse pink (320-360) and skin (20-40)
            # sit well outside the gate.
            {"name": "skirt -> canon red", "hue": (195, 245), "sat_min": 0.45,
             "to_hue": 6.0, "spread": 0.20, "sat_mul": 0.95, "val_mul": 1.02},
        ],
    },
    "suneo": {
        "folder": "suneo",
        "regions": [
            # Measured: shirt = hue 190-230 sat ~0.6 val ~0.8; shorts = teal 138-186 sat ~0.7.
            # Yellow shoes (40-60) and skin (20-40) stay out of both gates.
            {"name": "shirt -> canon green", "hue": (188, 232), "sat_min": 0.40,
             "to_hue": 122.0, "spread": 0.25, "sat_mul": 0.88, "val_mul": 0.96},
            {"name": "shorts -> brown", "hue": (138, 186), "sat_min": 0.40,
             "to_hue": 28.0, "spread": 0.20, "sat_mul": 0.80, "sat_clamp": (0.35, 0.70),
             "val_mul": 1.15},
        ],
    },
}


def read_base_color(folder):
    loose = os.path.join(ROOT, "assets/raw/rodin", folder, "texture_diffuse.png")
    if os.path.exists(loose):
        return Image.open(loose).convert("RGB")
    glb = os.path.join(ROOT, "assets/raw/rodin", folder, "base_basic_pbr.glb")
    with open(glb, "rb") as f:
        f.read(12)
        chunk_len, _ = struct.unpack("<II", f.read(8))
        gltf = json.loads(f.read(chunk_len))
        bin_len, _ = struct.unpack("<II", f.read(8))
        blob = f.read(bin_len)
    material = gltf["materials"][0]
    source = gltf["textures"][material["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]
    view = gltf["bufferViews"][gltf["images"][source]["bufferView"]]
    offset = view.get("byteOffset", 0)
    return Image.open(io.BytesIO(blob[offset:offset + view["byteLength"]])).convert("RGB")


def to_hsv(arr):
    mx = arr.max(2)
    mn = arr.min(2)
    delta = mx - mn
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    hue = np.zeros_like(mx)
    lit = delta > 1e-6
    safe = np.maximum(delta, 1e-6)
    sel = (mx == r) & lit
    hue[sel] = (60.0 * ((g - b) / safe))[sel] % 360.0
    sel = (mx == g) & lit
    hue[sel] = (60.0 * (2.0 + (b - r) / safe))[sel]
    sel = (mx == b) & lit
    hue[sel] = (60.0 * (4.0 + (r - g) / safe))[sel]
    sat = np.where(mx > 0, delta / np.maximum(mx, 1e-6), 0.0)
    return hue, sat, mx


def to_rgb(hue, sat, val):
    h6 = (hue % 360.0) / 60.0
    i = np.floor(h6).astype(np.int32) % 6
    f = h6 - np.floor(h6)
    p = val * (1 - sat)
    q = val * (1 - sat * f)
    t = val * (1 - sat * (1 - f))
    r = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [val, q, p, p, t, val])
    g = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, val, val, q, p, p])
    b = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, val, val, q])
    return np.clip(np.stack([r, g, b], axis=-1), 0, 1)


def recolor(character):
    spec = RULES[character]
    rgb = np.asarray(read_base_color(spec["folder"])).astype(np.float32) / 255.0
    hue, sat, val = to_hsv(rgb)
    src_hue, src_sat, src_val = hue.copy(), sat.copy(), val.copy()
    total = hue.size

    for region in spec["regions"]:
        lo, hi = region["hue"]
        mask = (src_hue >= lo) & (src_hue <= hi)
        mask &= src_sat > region.get("sat_min", 0.0)
        if "val_min" in region:
            mask &= src_val >= region["val_min"]
        if "val_max" in region:
            mask &= src_val < region["val_max"]
        if not mask.any():
            print(f"  {character}: {region['name']} matched nothing", file=sys.stderr)
            continue
        spread = region.get("spread", 0.0)
        centre = float(np.median(src_hue[mask]))
        hue[mask] = region["to_hue"] + (src_hue[mask] - centre) * spread
        new_sat = src_sat[mask] * region.get("sat_mul", 1.0)
        lo_s, hi_s = region.get("sat_clamp", (0.0, region.get("sat_max_out", 1.0)))
        sat[mask] = np.clip(new_sat, lo_s, hi_s)
        val[mask] = np.clip(src_val[mask] * region.get("val_mul", 1.0), 0, 1)
        print(f"  {character}: {region['name']:24s} {mask.sum() * 100 / total:5.1f}% of pixels")

    out = (to_rgb(hue, sat, val) * 255.0).round().astype(np.uint8)
    dest = os.path.join(ROOT, "assets/raw", f"{character}-diffuse-canon.png")
    Image.fromarray(out).save(dest)
    print(f"  wrote {os.path.relpath(dest, ROOT)}")


targets = sys.argv[1:]
if targets == ["--all"]:
    targets = list(RULES)
if not targets or any(t not in RULES for t in targets):
    print(f"usage: recolor-character-texture.py [--all | {' | '.join(RULES)}]", file=sys.stderr)
    raise SystemExit(1)
for name in targets:
    recolor(name)
