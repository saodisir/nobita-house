#!/usr/bin/env python3
"""Synthesise the diorama's looped background track.

Run:  python3 scripts/make-background-music.py
Writes: public/audio/background-music.mp3

This is original, self-synthesised audio: a slow four-chord pad with a soft bell
melody. There are no samples, no third-party recordings and no melody quoted
from any existing work. It replaces an earlier commercial OST recording that
must not be redistributed in a public repository.

The track is built to loop exactly. Every frequency is quantised to an integer
number of cycles over LOOP seconds, and every envelope is periodic over the
same span, so the last sample continues into the first without a click. It
uses numpy, the same dependency scripts/make-textures.py already needs.
"""

import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "audio" / "background-music.mp3"

SAMPLE_RATE = 22050
LOOP = 48.0
N = int(SAMPLE_RATE * LOOP)
t = np.arange(N, dtype=np.float64) / SAMPLE_RATE
TWO_PI = 2.0 * math.pi


def quantise(hz: float) -> float:
    """Snap a pitch to a whole number of cycles over the loop."""
    return round(hz * LOOP) / LOOP


# Four chords, each 12 s of the loop: C, Am, F, G. Only fundamentals and their
# octaves, so the pad stays warm rather than sounding like an organ.
CHORDS = (
    (130.81, 164.81, 196.00),
    (110.00, 164.81, 220.00),
    (87.31, 130.81, 174.61),
    (98.00, 146.83, 196.00),
)

# A C-major pentatonic bell melody. -1 is a rest; the last slot rests so no
# decay tail is left hanging at the loop point.
REST = -1
MELODY = (
    4, 2, 0, REST, 3, 5, 4, REST,
    2, 3, 5, 7, 4, REST, 2, 0,
    5, 4, 3, REST, 2, 4, 6, REST,
    7, 5, 4, 3, 2, REST, 0, REST,
)
SCALE = (261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25)


def render() -> np.ndarray:
    pad = np.zeros(N, dtype=np.float64)
    for i, notes in enumerate(CHORDS):
        # cos(2*pi*(t - i*LOOP/4)/LOOP), clipped to its positive half. The four
        # lobes are a quarter turn apart, so cos^2(theta) + cos^2(theta-pi/2)
        # = 1: adjacent chords crossfade and the total gain never dips.
        weight = np.clip(np.cos(TWO_PI * (t - i * LOOP / 4) / LOOP), 0.0, None) ** 2
        tremolo = 1.0 - 0.18 * (1.0 - np.cos(TWO_PI * 3 * t / LOOP + i * 0.7)) / 2
        for j, hz in enumerate(notes):
            amp = 0.11 / (1 + 0.25 * j) * weight * tremolo
            pad += amp * np.sin(TWO_PI * quantise(hz) * t + 0.3 * j)
            pad += 0.25 * amp * np.sin(TWO_PI * quantise(2 * hz) * t + 0.8 * j)

    bells = np.zeros(N, dtype=np.float64)
    slot = LOOP / len(MELODY)
    length = int(slot * SAMPLE_RATE)
    u = np.arange(length, dtype=np.float64) / length
    local_t = u * slot
    # Zero at both slot edges (no click), quick attack, exponential decay.
    envelope = np.sin(math.pi * u) ** 0.6 * np.exp(-2.6 * u)
    for j, degree in enumerate(MELODY):
        if degree == REST:
            continue
        hz = quantise(SCALE[degree])
        tone = (
            np.sin(TWO_PI * hz * local_t)
            + 0.28 * np.sin(TWO_PI * quantise(2 * hz) * local_t)
            + 0.09 * np.sin(TWO_PI * quantise(3 * hz) * local_t)
        )
        start = j * length
        bells[start:start + length] += 0.16 * envelope * tone

    mix = pad + bells
    mix *= 1.0 - 0.08 * (1.0 - np.cos(TWO_PI * t / LOOP))
    mix *= 0.72 / np.max(np.abs(mix))
    return mix


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SystemExit("ffmpeg is required to encode the MP3")

    mix = render()
    print(f"loop={LOOP:.0f}s  peak={np.max(np.abs(mix)):.3f}  "
          f"seam delta={abs(mix[0] - mix[-1]):.6f}")

    pcm = np.int16(np.clip(mix, -1.0, 1.0) * 32767)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as handle:
        wav_path = Path(handle.name)
    try:
        with wave.open(str(wav_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(pcm.tobytes())

        subprocess.run(
            [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(wav_path),
                "-codec:a", "libmp3lame", "-b:a", "96k",
                "-ar", str(SAMPLE_RATE), "-ac", "1",
                "-map_metadata", "-1", "-id3v2_version", "0",
                "-write_id3v1", "0",
                str(OUT),
            ],
            check=True,
        )
    finally:
        wav_path.unlink(missing_ok=True)

    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
