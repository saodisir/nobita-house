"""Swap the procedural surface tiles for scanned CC0 materials from ambientCG.

Usage: /usr/bin/python3 scripts/import-real-textures.py

The house tints one neutral tile per material (`src/editor/house/materials.ts`), so a replacement
has to stay neutral or the colour ends up applied twice. Each scanned colour map is therefore
reduced to luminance and re-scaled to the mean luminance of the tile it replaces: the scene keeps
its existing light balance, and only the frequency content changes — grain, weave, brick joints,
pores instead of noise.

Normal maps are taken as-is (OpenGL convention, which is what three.js expects) and stay at 1K:
the material spec already sets the strength per surface.

Source assets are ambientCG, CC0. Credit is not required, but the list is here so the provenance
survives the swap.

    stucco      <- Plaster001
    concrete    <- Concrete048
    wood        <- Wood051
    tatami      <- Tatami001
    katagarasu  <- RoofingTiles013A
"""
import io
import os
import sys
import tempfile
import urllib.request
import zipfile

from PIL import Image, ImageChops, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "textures", "editor")

MAP = {
    "stucco": "Plaster001",
    "concrete": "Concrete048",
    "wood": "Wood051",
    "tatami": "Tatami001",
    "katagarasu": "RoofingTiles013A",
}

# Mean and standard deviation of the tile each scan replaces, measured before the swap: the scene's
# light is balanced against the mean, and the model's flatness against the deviation. Both have to
# land on the same numbers or the swap is a relight rather than a re-texture.
TARGETS = {
    "stucco": (205.0, 9.0),
    "concrete": (206.0, 9.0),
    "wood": (217.0, 12.0),
    "tatami": (213.0, 10.0),
    "katagarasu": (230.0, 11.0),
}

SIZE = 1024
CACHE = os.path.join(tempfile.gettempdir(), "ambientcg")


def fetch(asset: str) -> str:
    """Download the 1K JPG bundle once and return the cached zip path."""
    os.makedirs(CACHE, exist_ok=True)
    dest = os.path.join(CACHE, f"{asset}_1K-JPG.zip")
    if os.path.exists(dest) and os.path.getsize(dest) > 1_000_000:
        return dest
    url = f"https://ambientcg.com/get?file={asset}_1K-JPG.zip"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as fh:
        fh.write(resp.read())
    return dest


def read_member(zip_path: str, suffix: str) -> Image.Image:
    with zipfile.ZipFile(zip_path) as zf:
        name = next(n for n in zf.namelist() if n.endswith(suffix))
        with zf.open(name) as fh:
            return Image.open(io.BytesIO(fh.read())).convert("RGB")


def neutralise(img: Image.Image, target_mean: float, target_std: float) -> Image.Image:
    """Grey the scan, drop its stains, and land it on the brightness and contrast it replaces.

    A raw scan carries two very different signals: fine grain, which is what makes a surface read as
    real, and big soft blotches, which at 1 m repeat are read as stains and as an obvious tiling
    pattern. Only the first is wanted, so the scan is high-passed — a heavy blur subtracted from
    itself — which removes everything coarser than a few centimetres and keeps the weave, the
    pores, the brick joints.
    """
    grey = img.convert("L").resize((SIZE, SIZE), Image.LANCZOS)
    low = grey.filter(ImageFilter.GaussianBlur(SIZE * 0.06))
    high = ImageChops.subtract(grey, low, 1, 128)  # (grey - low) + 128

    stat = ImageStat.Stat(high)
    mean, std = stat.mean[0], stat.stddev[0]
    if std < 1:
        sys.exit("blank scan")
    gain = target_std / std
    grey = high.point(lambda v: max(0, min(255, round((v - mean) * gain + target_mean))))
    return grey.convert("RGB")


def main() -> None:
    for tile, asset in MAP.items():
        zip_path = fetch(asset)
        colour = read_member(zip_path, "_Color.jpg")
        normal = read_member(zip_path, "_NormalGL.jpg")

        albedo_path = os.path.join(OUT, f"{tile}-albedo.webp")
        target_mean, target_std = TARGETS[tile]

        albedo = neutralise(colour, target_mean, target_std)
        albedo.save(albedo_path, "WEBP", quality=88, method=6)

        normal = normal.resize((SIZE, SIZE), Image.LANCZOS)
        normal.save(os.path.join(OUT, f"{tile}-normal.webp"), "WEBP", quality=90, method=6)

        print(f"{tile:<12} <- {asset:<18} mean {target_mean:.0f} sd {target_std:.0f}")


if __name__ == "__main__":
    main()
