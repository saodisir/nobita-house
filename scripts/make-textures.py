"""Turn the generated source images into game textures.

- tile-*: seamless material tiles for the house, wall, road, lawn and wood. Mean luminance
  is normalised to a light target so the palette colour that multiplies them in the shader
  still decides the final hue; a Sobel normal map is derived from each.

- leaf-cluster / blossom-cluster: key the background out (sampled from the image corners, so
  a white or black backdrop both work), soften the edge, write RGBA with the foreground
  colour bled outward so bilinear filtering never fringes. Output 1024 px.
- bark: derive a tangent-space normal map from luminance with a Sobel filter, plus a
  downscaled albedo.

Outputs land in assets/raw/textures/ and are read by scripts/blender/plants_build.py.

    python3 scripts/make-textures.py              # everything
    python3 scripts/make-textures.py tile-grass   # only the named tiles
"""

import os
import sys
import zlib

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets/ref")
OUT = os.path.join(ROOT, "assets/raw/textures")
os.makedirs(OUT, exist_ok=True)


def key_cluster(name, size=1024):
    img = Image.open(os.path.join(SRC, name, "front.png")).convert("RGB").resize((size, size), Image.LANCZOS)
    rgb = np.asarray(img).astype(np.float32) / 255.0
    corners = np.concatenate([rgb[:24, :24].reshape(-1, 3), rgb[:24, -24:].reshape(-1, 3),
                              rgb[-24:, :24].reshape(-1, 3), rgb[-24:, -24:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    delta = np.linalg.norm(rgb - bg, axis=2)
    # Anything within `lo` of the backdrop is background; fully opaque beyond `hi`.
    lo, hi = 0.10, 0.32
    alpha = np.clip((delta - lo) / (hi - lo), 0.0, 1.0)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))) / 255.0
    # Bleed foreground colour into transparent texels so mip/bilinear edges stay clean.
    fg = rgb.copy()
    mask = alpha > 0.05
    for _ in range(6):
        blurred = np.asarray(Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))) / 255.0
        fg = np.where(mask[..., None], fg, blurred)
    rgba = np.dstack([fg, alpha])
    Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA").save(os.path.join(OUT, f"{name}.png"))
    print(f"{name}: keyed, bg={np.round(bg, 2)}, opaque {mask.mean() * 100:.1f}%")


def bark_maps(size=1024, strength=2.4):
    img = Image.open(os.path.join(SRC, "bark", "front.png")).convert("RGB").resize((size, size), Image.LANCZOS)
    img.save(os.path.join(OUT, "bark-albedo.jpg"), quality=88)
    lum = np.asarray(img.convert("L")).astype(np.float32) / 255.0
    lum = np.asarray(Image.fromarray((lum * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))) / 255.0
    gx = np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1)
    gy = np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(lum)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.dstack([nx / length, ny / length, nz / length]) * 0.5 + 0.5
    Image.fromarray((normal * 255).round().astype(np.uint8)).save(os.path.join(OUT, "bark-normal.png"))
    print("bark: albedo + normal written")


def sobel_normal(lum, strength):
    gx = np.roll(lum, -1, axis=1) - np.roll(lum, 1, axis=1)
    gy = np.roll(lum, -1, axis=0) - np.roll(lum, 1, axis=0)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(lum)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.dstack([nx / length, ny / length, nz / length]) * 0.5 + 0.5


def periodic_noise(size, cells, rng, stretch=1.0):
    """Smooth value noise that wraps at the tile edge, so every repeat is seamless.

    A plain resize clamps at the border, so the last texel row never blends back into the
    first and every repeat shows a seam. The grid is padded with its own opposite edge and
    only the original cell span is resampled, which makes the result exactly periodic."""
    rows, cols = cells, max(1, int(cells / stretch))
    pad = 3
    grid = np.pad(rng.random((rows, cols)).astype(np.float32), pad, mode="wrap")
    up = Image.fromarray(grid).resize((size, size), Image.BICUBIC,
                                      box=(pad, pad, pad + cols, pad + rows))
    return np.asarray(up).astype(np.float32)


def fractal(size, rng, base_cells=8, octaves=5, gain=0.5, stretch=1.0):
    out = np.zeros((size, size), np.float32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        cells = base_cells * (2 ** o)
        if cells > size:
            break
        out += periodic_noise(size, cells, rng, stretch) * amp
        total += amp
        amp *= gain
    return out / total


def worley(size, cells, rng, jitter=0.7):
    """Distances to the nearest and second-nearest of one jittered point per cell, wrapping at
    the tile edge. `d2 - d1` is zero on a cell boundary, which is what draws a pebble grain."""
    pts = 0.5 + (rng.random((cells, cells, 2)) - 0.5) * jitter
    g = np.arange(size, dtype=np.float32) * cells / size
    x, y = np.meshgrid(g, g)
    cx, cy = np.floor(x).astype(int), np.floor(y).astype(int)
    d1 = np.full((size, size), np.inf, np.float32)
    d2 = np.full((size, size), np.inf, np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx, ny = cx + dx, cy + dy
            p = pts[ny % cells, nx % cells]
            d = np.hypot(x - (nx + p[..., 0]), y - (ny + p[..., 1]))
            d2 = np.where(d < d1, d1, np.minimum(d2, d))
            d1 = np.minimum(d1, d)
    return d1, d2


def procedural_tile(name, size=1024):
    """Seamless material tiles built from wrapped noise; used when no generated source exists."""
    # crc32, not hash(): str hashing is salted per process, so the tile changed on every run.
    rng = np.random.default_rng(zlib.crc32(name.encode()))
    if name == "tile-stucco":
        n = fractal(size, rng, 32, 5, 0.55)
        rgb = np.dstack([n * 0.10 + 0.86, n * 0.10 + 0.85, n * 0.10 + 0.82])
    elif name == "tile-concrete":
        n = fractal(size, rng, 8, 6, 0.5)
        pores = (fractal(size, rng, 128, 2, 0.5) > 0.78).astype(np.float32) * 0.08
        v = 0.78 + (n - 0.5) * 0.16 - pores
        rgb = np.dstack([v, v * 0.995, v * 0.98])
    elif name == "tile-asphalt":
        speck = fractal(size, rng, 256, 2, 0.6)
        mottle = fractal(size, rng, 6, 3, 0.5)
        v = 0.60 + (speck - 0.5) * 0.30 + (mottle - 0.5) * 0.10
        rgb = np.dstack([v, v, v * 1.02])
    elif name == "tile-grass":
        # A kept lawn: soft darker drifts carry the variation, blades are only a faint grain.
        # Variation only darkens from a ceiling whose green sits at 1.0, so no texel clips and
        # the bright areas stay green instead of washing out to yellow.
        mottle = fractal(size, rng, 3, 3, 0.5)
        m = (mottle - mottle.min()) / np.ptp(mottle)
        grain = fractal(size, rng, 128, 2, 0.5, stretch=0.5)
        v = 1.0 - 0.16 * m ** 2 - (grain - grain.min()) / np.ptp(grain) * 0.05
        rgb = np.dstack([v * 0.83, v, v * 0.58])
    elif name == "tile-wood":
        grain = fractal(size, rng, 6, 5, 0.55, stretch=0.06)
        rings = np.sin((grain * 14.0 + np.linspace(0, 6.0, size)[None, :]) * np.pi) * 0.5 + 0.5
        v = 0.74 + (grain - 0.5) * 0.18 - rings * 0.07
        rgb = np.dstack([v * 1.06, v * 0.93, v * 0.76])
    elif name == "tile-tatami":
        # Woven rush: a fine warp running one way, a slow weft the other, and a long drift so
        # a whole mat never looks like one flat swatch. The weave is directional on purpose —
        # `layTatami` in src/editor/house/build-shell.ts turns mats a quarter turn to lay each one
        # along its length, and the grain has to show it.
        warp = np.sin(np.linspace(0, 2 * np.pi * 220, size)[None, :]) * 0.5 + 0.5
        weft = np.sin(np.linspace(0, 2 * np.pi * 26, size)[:, None]) * 0.5 + 0.5
        drift = fractal(size, rng, 4, 3, 0.5)
        v = 0.80 + (warp - 0.5) * 0.09 + (weft - 0.5) * 0.05 + (drift - 0.5) * 0.10
        rgb = np.dstack([v * 1.02, v, v * 0.74])
    elif name == "tile-plaid":
        # The kotatsu quilt's tartan. Built from stripe masks rather than noise: a check is
        # made of hard edges at fixed spacings, and every noise-based attempt reads as a
        # stain. Two sets crossing at right angles, plus a faint diagonal weave so the cloth
        # does not look printed.
        x = np.linspace(0, 1, size, endpoint=False)[None, :]
        y = np.linspace(0, 1, size, endpoint=False)[:, None]

        def stripes(t):
            mask = np.zeros_like(t)
            for period, offset, width, amp in ((0.25, 0.0, 0.052, 0.30),
                                               (0.25, 0.125, 0.020, 0.20),
                                               (0.125, 0.0625, 0.008, 0.11)):
                phase = ((t - offset) % period) / period
                # Half-width each side of the line, so `width` is the band's full size.
                inside = np.minimum(phase, 1.0 - phase) < 0.5 * width / period
                mask = np.maximum(mask, amp * inside)
            return mask

        sx, sy = stripes(x), stripes(y)
        # A crossing is darker than either stripe but lighter than their sum, which is what
        # overlapping dyed threads actually do.
        v = 1.0 - (sx + sy) + sx * sy * 0.55
        weave = (np.sin((x + y) * np.pi * 140) * 0.5 + 0.5) * 0.035
        v = np.clip(v - weave, 0.30, 1.0)
        rgb = np.dstack([v * 1.03, v * 0.88, v * 0.68])
    elif name == "tile-shoji":
        # Rice paper: an almost flat sheet with fibres in it. Nearly featureless by design —
        # the shoji frame is geometry, and a busy paper would fight the tatami next to it.
        fibres = fractal(size, rng, 200, 2, 0.5, stretch=0.25)
        cloud = fractal(size, rng, 5, 3, 0.5)
        v = 0.93 + (fibres - 0.5) * 0.05 + (cloud - 0.5) * 0.04
        rgb = np.dstack([v, v * 0.99, v * 0.94])
    elif name == "tile-fabric":
        # Upholstery: a plain weave of ~3 mm threads at 0.3 m per repeat (96 a tile). Each
        # crossing shows whichever thread is on top, so the cloth has a real over-under
        # texture instead of a grid of lines; slubs run along the weft and a slow mottle keeps
        # a sofa-sized panel from looking printed. Neutral grey: the palette colour sets hue.
        x = np.linspace(0, 1, size, endpoint=False)[None, :] * 96
        y = np.linspace(0, 1, size, endpoint=False)[:, None] * 96
        over = (np.floor(x) + np.floor(y)) % 2
        warp = np.sin(np.pi * np.mod(x, 1.0))
        weft = np.sin(np.pi * np.mod(y, 1.0))
        thread = np.where(over > 0, warp, weft)
        slub = fractal(size, rng, 96, 2, 0.5, stretch=6.0)
        mottle = fractal(size, rng, 4, 3, 0.5)
        v = 0.70 + thread * 0.16 + (slub - 0.5) * 0.10 + (mottle - 0.5) * 0.06
        rgb = np.dstack([v, v, v])
    elif name == "tile-jute":
        # A basket-weave jute rug: 24 blocks a tile, three flat strands to a block, blocks
        # alternating horizontal and vertical. The strands carry fibre streaks along their own
        # direction and a per-block shade, which is what makes it read as natural fibre.
        x = np.linspace(0, 1, size, endpoint=False)[None, :] * 24
        y = np.linspace(0, 1, size, endpoint=False)[:, None] * 24
        across = (np.floor(x) + np.floor(y)) % 2 > 0
        strand = np.where(across, np.sin(np.pi * np.mod(y * 3, 1.0)),
                          np.sin(np.pi * np.mod(x * 3, 1.0)))
        fibre_x = fractal(size, rng, 192, 2, 0.5, stretch=8.0)
        fibre_y = fractal(size, rng, 192, 2, 0.5, stretch=0.125)
        fibre = np.where(across, fibre_x, fibre_y)
        block = periodic_noise(size, 24, rng)
        block = block[(np.floor(y).astype(int) * size // 24) % size,
                      (np.floor(x).astype(int) * size // 24) % size]
        v = 0.56 + np.power(strand, 0.7) * 0.30 + (fibre - 0.5) * 0.16 + (block - 0.5) * 0.10
        rgb = np.dstack([v * 1.04, v, v * 0.86])
    elif name == "tile-clay":
        # Terracotta: fired clay grain, dark grog specks and light ones, the horizontal rings
        # a pot keeps from the wheel, and pale blooms where salts have come through the
        # unglazed wall. Rows are height on a pot's side once `world_uvs` projects it, so the
        # rings run round the pot. The first version was so even that a pot read as painted.
        grain = fractal(size, rng, 16, 5, 0.5)
        dark = (fractal(size, rng, 256, 2, 0.5) > 0.74).astype(np.float32)
        light = (fractal(size, rng, 256, 2, 0.5) > 0.78).astype(np.float32)
        y = np.linspace(0, 1, size, endpoint=False)[:, None]
        wobble = fractal(size, rng, 4, 2, 0.5)
        rings = np.sin((y * 22 + wobble * 0.6) * 2 * np.pi) * 0.045
        bloom = np.clip((fractal(size, rng, 5, 4, 0.55) - 0.55) * 4.0, 0, 1) * 0.6
        v = 0.74 + (grain - 0.5) * 0.26 + rings - dark * 0.12 + light * 0.08
        rgb = np.dstack([v + bloom * 0.10, v * 0.95 + bloom * 0.14, v * 0.88 + bloom * 0.16])
    elif name == "tile-glaze":
        # Stoneware under a clear glaze: iron specks through the body, a soft pooling mottle,
        # and nothing directional — a mug is thrown, and glaze hides the rings.
        mottle = fractal(size, rng, 6, 4, 0.5)
        specks = (fractal(size, rng, 320, 2, 0.5) > 0.80).astype(np.float32)
        v = 0.86 + (mottle - 0.5) * 0.10 - specks * 0.22
        rgb = np.dstack([v, v * 0.98, v * 0.95])
    elif name in ("tile-bathtile", "tile-stonetile", "tile-vinyl"):
        # Three laid floors and walls, one recipe: square units, a grout joint, a shade per
        # unit, and a finish inside it. The bathroom has 10 cm glazed tiles four to a 0.4 m
        # repeat with their edges softly pillowed; the genkan 30 cm stone tiles two to 0.6 m
        # with a mottled face and fine joints; the kitchen 30 cm cushion-vinyl squares, a
        # faint checker with a pressed joint and no grout colour at all.
        units, joint, joint_v, face = {
            "tile-bathtile": (4, 0.022, 0.60, "glaze"),
            "tile-stonetile": (2, 0.010, 0.55, "stone"),
            "tile-vinyl": (2, 0.006, 0.80, "vinyl"),
        }[name]
        x = np.linspace(0, 1, size, endpoint=False)[None, :] * units
        y = np.linspace(0, 1, size, endpoint=False)[:, None] * units
        fx, fy = np.mod(x, 1.0), np.mod(y, 1.0)
        edge = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
        grout = edge < joint
        shade = rng.random((units, units))[np.floor(y).astype(int) % units,
                                           np.floor(x).astype(int) % units]
        mottle = fractal(size, rng, 8, 4, 0.5)
        if face == "glaze":
            v = 0.84 + (shade - 0.5) * 0.06 + np.clip(edge / 0.08, 0, 1) * 0.05 + (mottle - 0.5) * 0.03
        elif face == "stone":
            speck = (fractal(size, rng, 256, 2, 0.5) > 0.78).astype(np.float32)
            v = 0.78 + (shade - 0.5) * 0.10 + (mottle - 0.5) * 0.18 - speck * 0.08
        else:
            checker = (np.floor(x) + np.floor(y)) % 2
            v = 0.82 + (checker - 0.5) * 0.05 + (mottle - 0.5) * 0.05
        v = np.where(grout, joint_v, v)
        rgb = np.dstack([v, v, v])
    elif name == "tile-brushed":
        # Brushed stainless: long streaks along one direction and almost nothing else. The
        # worktop and the sink are where a Showa kitchen shows its steel.
        streak = fractal(size, rng, 256, 3, 0.5, stretch=16.0)
        mottle = fractal(size, rng, 4, 3, 0.5)
        v = 0.80 + (streak - 0.5) * 0.14 + (mottle - 0.5) * 0.05
        rgb = np.dstack([v, v, v * 1.01])
    elif name == "tile-enamel":
        # Fired enamel and vitreous china: a slow, barely-there cloud and a fine orange peel
        # in the normal map. Anything stronger reads as dirt on a white tub.
        cloud = fractal(size, rng, 6, 4, 0.5)
        peel = fractal(size, rng, 160, 2, 0.5)
        v = 0.90 + (cloud - 0.5) * 0.04 + (peel - 0.5) * 0.03
        rgb = np.dstack([v, v, v])
    elif name == "tile-cardboard":
        # Kraft board: fibre flecks, a soft mottle, and the flutes of the corrugation
        # showing through the liner as faint stripes 5 mm apart at 0.3 m a repeat.
        y = np.linspace(0, 1, size, endpoint=False)[:, None]
        flutes = np.sin(y * 2 * np.pi * 60) * 0.025
        fibre = fractal(size, rng, 192, 2, 0.5, stretch=4.0)
        mottle = fractal(size, rng, 6, 3, 0.5)
        v = 0.78 + flutes + (fibre - 0.5) * 0.10 + (mottle - 0.5) * 0.08
        rgb = np.dstack([v * 1.03, v, v * 0.92])
    elif name == "tile-bookcloth":
        # Buckram, the cloth a Showa hardback's spine is bound in, at 0.15 m a repeat: ~1 mm
        # threads over and under (150 a tile), finer than the upholstery weave, with rubbed
        # streaks running down the spine where hands pull it off the shelf, and a mottle so a
        # row of spines in one tint does not read as one flat board.
        x = np.linspace(0, 1, size, endpoint=False)[None, :] * 150
        y = np.linspace(0, 1, size, endpoint=False)[:, None] * 150
        over = (np.floor(x) + np.floor(y)) % 2
        thread = np.where(over > 0, np.sin(np.pi * np.mod(x, 1.0)), np.sin(np.pi * np.mod(y, 1.0)))
        rub = fractal(size, rng, 24, 3, 0.5, stretch=0.08)
        mottle = fractal(size, rng, 5, 3, 0.5)
        v = 0.72 + thread * 0.12 + (rub - 0.5) * 0.16 + (mottle - 0.5) * 0.08
        rgb = np.dstack([v, v, v * 0.97])
    elif name == "tile-print":
        # A magazine page at 0.2 m per repeat: two justified columns of 4 mm lines, ragged
        # paragraph ends, and a headline in the first column. Words are bars, which is what
        # print is at the distance anyone sees it from; the paper under them has a fibre.
        paper = fractal(size, rng, 64, 3, 0.5)
        v = 0.95 + (paper - 0.5) * 0.04
        v = np.broadcast_to(v, (size, size)).copy()
        for c0, c1 in ((0.06, 0.47), (0.53, 0.94)):
            y = 0.06
            if c0 < 0.5:
                for _ in range(2):
                    r0, r1 = int(y * size), int((y + 0.018) * size)
                    v[r0:r1, int(c0 * size):int(rng.uniform(0.30, 0.44) * size)] = 0.30
                    y += 0.03
                y += 0.01
            while y < 0.93:
                r0, r1 = int(y * size), int((y + 0.009) * size)
                end = c1 if rng.random() > 0.14 else c0 + (c1 - c0) * rng.uniform(0.3, 0.8)
                x = c0 + (0.02 if rng.random() < 0.1 else 0.0)
                while x < end - 0.01:
                    x1 = min(x + rng.uniform(0.012, 0.055), end)
                    v[r0:r1, int(x * size):int(x1 * size)] = 0.42 + rng.uniform(-0.05, 0.05)
                    x = x1 + 0.011
                y += 0.02
        rgb = np.dstack([v, v * 0.99, v * 0.96])
    elif name == "tile-katagarasu":
        # Showa patterned glass (型板ガラス): a hex field of shallow domes pressed into one face.
        # The albedo barely moves; the Sobel normal of the domes is what makes the pane
        # sparkle and blur whatever is behind it. 16 x 18 domes a tile, periodic both ways.
        nx, ny = 16, 18
        x = np.linspace(0, 1, size, endpoint=False)[None, :]
        y = np.linspace(0, 1, size, endpoint=False)[:, None]

        def nearest(ox, oy):
            fx = np.mod(x * nx - ox + 0.5, 1.0) - 0.5
            fy = np.mod(y * ny / 2 - oy + 0.5, 1.0) - 0.5
            return np.hypot(fx / nx, fy * 2 / ny)

        d = np.minimum(nearest(0.0, 0.0), nearest(0.5, 0.5))
        r = 0.55 / nx
        dome = np.clip(1 - (d / r) ** 2, 0, 1)
        v = 0.80 + dome * 0.16 - np.exp(-(((d - r) / (0.10 * r)) ** 2)) * 0.10
        rgb = np.dstack([v, v, v])
    elif name == "tile-leaf":
        # One leaf, mapped per blade by `leafy_plant` (u across, v from stalk to tip): a pale
        # midrib, lateral veins sweeping toward the tip, a lighter centre and a fine cell
        # texture. Not a repeating tile; seamlessness does not matter here.
        x = np.linspace(0, 1, size)[None, :]
        y = 1.0 - np.linspace(0, 1, size)[:, None]
        d = np.abs(x - 0.5)
        midrib = np.exp(-((d / 0.012) ** 2))
        q = np.mod((y - d * 1.3) * 9, 1.0)
        vein = np.exp(-((np.minimum(q, 1 - q) / 0.035) ** 2)) * (d > 0.015) * np.clip(1 - d * 1.8, 0, 1)
        centre = np.clip(1 - d * 2, 0, 1)
        cells = fractal(size, rng, 64, 3, 0.5)
        v = 0.58 + centre ** 0.5 * 0.16 + midrib * 0.30 + vein * 0.22 + (cells - 0.5) * 0.08
        rgb = np.dstack([v * 0.96, v, v * 0.86])
    elif name == "tile-formica":
        # The kitchen table's Showa melamine top: a cream sheet scattered with millimetre
        # flecks, some warm grey, some blue-grey, a few paler than the ground, over a slow
        # cloud. Flecks carry their own hue; the palette colour sets the cream.
        cloud = fractal(size, rng, 5, 3, 0.5)
        dark = (fractal(size, rng, 200, 2, 0.5) > 0.82).astype(np.float32)
        cool = (fractal(size, rng, 200, 2, 0.5) > 0.83).astype(np.float32)
        pale = (fractal(size, rng, 160, 2, 0.5) > 0.80).astype(np.float32)
        v = 0.90 + (cloud - 0.5) * 0.04 + pale * 0.06
        rgb = np.dstack([v, v * 0.99, v * 0.97])
        rgb = rgb * (1 - dark[..., None] * np.array([0.18, 0.20, 0.23]))
        rgb = rgb * (1 - cool[..., None] * np.array([0.22, 0.17, 0.11]))
    elif name == "tile-leatherette":
        # Vinyl upholstery on the kitchen chairs: a pressed pebble grain, 48 pebbles a tile
        # (4 mm at 0.2 m a repeat), each domed and separated by a soft valley rather than a
        # line — a crisp outline reads as crazed glaze. The valleys are dark so the Sobel
        # normal sinks them; the sheen is the material's roughness, not the tile's.
        d1, d2 = worley(size, 48, rng, jitter=0.9)
        valley = np.exp(-(((d2 - d1) / 0.13) ** 2))
        dome = 1.0 - np.clip(d1 / 0.8, 0, 1) ** 2
        fine = fractal(size, rng, 256, 2, 0.5)
        mottle = fractal(size, rng, 4, 3, 0.5)
        v = 0.74 + dome * 0.10 - valley * 0.14 + (fine - 0.5) * 0.05 + (mottle - 0.5) * 0.06
        rgb = np.dstack([v, v, v])
    elif name == "tile-speckle":
        # Speckled black enamel on the gas table: a dark ground with sparse pale specks. Kept
        # dark in the tile and lit by a pale palette colour, because a multiply can darken a
        # tint but never lift specks above it.
        mottle = fractal(size, rng, 6, 3, 0.5)
        fine = (fractal(size, rng, 320, 2, 0.5) > 0.84).astype(np.float32)
        coarse = (fractal(size, rng, 140, 2, 0.5) > 0.87).astype(np.float32)
        v = 0.28 + (mottle - 0.5) * 0.05 + np.maximum(fine * 0.45, coarse * 0.58)
        rgb = np.dstack([v, v * 1.01, v * 1.04])
    else:
        raise ValueError(name)
    return np.clip(rgb, 0, 1)


def tile(name, size=1024, target_mean=0.80, strength=2.0):
    src = os.path.join(SRC, name, "front.png")
    if os.path.exists(src):
        img = Image.open(src).convert("RGB").resize((size, size), Image.LANCZOS)
        rgb = np.asarray(img).astype(np.float32) / 255.0
    else:
        rgb = procedural_tile(name, size)
    lum = rgb.mean()
    rgb = np.clip(rgb * (target_mean / max(lum, 1e-3)), 0, 1)
    Image.fromarray((rgb * 255).round().astype(np.uint8)).save(os.path.join(OUT, f"{name}-albedo.jpg"), quality=86)
    grey = np.asarray(Image.fromarray((rgb * 255).astype(np.uint8)).convert("L")
                      .filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255.0
    Image.fromarray((sobel_normal(grey, strength) * 255).round().astype(np.uint8)).save(
        os.path.join(OUT, f"{name}-normal.png"))
    print(f"{name}: albedo normalised from mean {lum:.2f} to {target_mean}, normal written")


TILE_NAMES = (
    "tile-stucco",
    "tile-concrete",
    "tile-asphalt",
    "tile-grass",
    "tile-wood",
    "tile-tatami",
    "tile-shoji",
    "tile-plaid",
    "tile-fabric",
    "tile-jute",
    "tile-clay",
    "tile-print",
    "tile-katagarasu",
    "tile-leaf",
    "tile-glaze",
    "tile-bathtile",
    "tile-stonetile",
    "tile-vinyl",
    "tile-brushed",
    "tile-enamel",
    "tile-cardboard",
    "tile-bookcloth",
    "tile-formica",
    "tile-leatherette",
    "tile-speckle",
)
# Grass is strongly green, so the shared 0.80 luminance target would push its green channel
# past 1.0 and clip; 0.75 is the highest target at which its ceiling stays unclipped.
# Shoji paper is meant to read as the brightest surface in the room, so it keeps its own, and
# so do the magazine page and the patterned glass.
# Enamel, glazed tile, steel and the table's melamine are white or bright finishes:
# normalising them to 0.8 would grey the tub, the lavatory, the bathroom walls and the table.
# The gas table's speckle is the opposite: a dark tile under a pale tint, so it keeps its own
# low mean rather than being lifted into grey.
TARGET_MEAN = {"tile-grass": 0.75, "tile-shoji": 0.92, "tile-print": 0.88, "tile-katagarasu": 0.90,
               "tile-enamel": 0.94, "tile-bathtile": 0.88, "tile-brushed": 0.86,
               "tile-formica": 0.90, "tile-speckle": 0.32}

# Fleck, speck and pebble fields are all high-frequency noise, which WebP cannot compress:
# at 1024 the three kitchen tiles cost ~0.95 MB and 33 MB of GPU memory for three small
# objects. At 512 a texel is still under a millimetre on the table and 0.4 mm on a chair.
# The book cloth's 1 mm threads are the same case: at 512 a thread still spans 3.4 texels.
TILE_SIZE = {"tile-formica": 512, "tile-leatherette": 512, "tile-speckle": 512, "tile-bookcloth": 512}

# Named tiles regenerate just those; no arguments rebuilds every texture.
requested = sys.argv[1:]
if not requested:
    key_cluster("leaf-cluster")
    key_cluster("blossom-cluster")
    bark_maps()
for tile_name in requested or TILE_NAMES:
    tile(tile_name, size=TILE_SIZE.get(tile_name, 1024), target_mean=TARGET_MEAN.get(tile_name, 0.80))
