#!/usr/bin/env python3
"""
generate_assets.py
------------------
Creates the multimedia assets used by the prototype so the project is fully
self-contained (no copyrighted audio or artwork, no network needed):

  * assets/audio/*.wav  - short synthesised demo tracks (one per track)
  * assets/img/*.svg    - playlist cover artwork

Run from the project root:   python3 tools/generate_assets.py
"""
import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "assets", "audio")
IMG_DIR = os.path.join(ROOT, "assets", "img")
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)

SAMPLE_RATE = 16000   # 16 kHz keeps files small (~250 KB each) but clear enough for a demo
DURATION = 8.0        # seconds per demo track

# Note frequencies (Hz) for a few simple scales, built from a root note.
def scale(root, steps):
    return [root * 2 ** (s / 12) for s in steps]

MAJOR = [0, 2, 4, 5, 7, 9, 11, 12]
MINOR = [0, 2, 3, 5, 7, 8, 10, 12]
PENTA = [0, 2, 4, 7, 9, 12]

# One entry per track: file name, root frequency, scale, notes-per-second, waveform
TRACKS = [
    ("midnight-study",   220.00, PENTA, 2.0, "sine"),
    ("quiet-rain",       196.00, MINOR, 1.5, "sine"),
    ("golden-hour-drive", 261.63, MAJOR, 3.0, "tri"),
    ("city-lights",      293.66, MAJOR, 3.5, "tri"),
    ("low-orbit",         98.00, MINOR, 2.0, "saw"),
    ("night-pulse",      110.00, MINOR, 4.0, "saw"),
    ("porch-light",      246.94, PENTA, 1.75, "sine"),
    ("slow-river",       174.61, PENTA, 1.25, "sine"),
]

def wave_sample(kind, phase):
    """Return one sample of the chosen waveform for a phase in cycles."""
    p = phase % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * p)
    if kind == "tri":
        return 4 * abs(p - 0.5) - 1
    return 2 * p - 1  # saw

def make_track(name, root, steps, nps, kind):
    rng = random.Random(name)            # deterministic: same name -> same melody
    freqs = scale(root, steps)
    note_len = int(SAMPLE_RATE / nps)
    total = int(SAMPLE_RATE * DURATION)
    samples = []
    phase = 0.0
    freq = freqs[0]
    for i in range(total):
        pos = i % note_len
        if pos == 0:                      # start of a new note: pick the next pitch
            freq = rng.choice(freqs)
        # Simple attack/decay envelope so notes do not click
        t = pos / note_len
        env = min(1.0, t / 0.05) * (1.0 - t) ** 0.6
        phase += freq / SAMPLE_RATE
        value = wave_sample(kind, phase) * env * 0.35
        # Add a quiet octave-down drone for body
        value += math.sin(2 * math.pi * (root / 2) * i / SAMPLE_RATE) * 0.08
        # Fade whole track in/out
        fade = min(1.0, i / 800, (total - i) / 800)
        samples.append(int(max(-1, min(1, value * fade)) * 32767))
    path = os.path.join(AUDIO_DIR, f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(struct.pack("<%dh" % len(samples), *samples))
    return path

# Cover art: simple gradient + shapes, defined per playlist.
COVERS = {
    "focus-flow":    ("#1d4e89", "#00b4d8", "circles"),
    "sunrise-pop":   ("#ff7b54", "#ffd460", "sun"),
    "deep-bass":     ("#3a0ca3", "#f72585", "bars"),
    "acoustic-calm": ("#2d6a4f", "#b7e4c7", "waves"),
}

def make_cover(slug, c1, c2, motif):
    shapes = ""
    if motif == "circles":
        shapes = "".join(
            f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" fill-opacity="0.14"/>'
            for x, y, r in [(90, 110, 70), (200, 80, 45), (170, 200, 85), (60, 230, 35)])
    elif motif == "sun":
        shapes = ('<circle cx="150" cy="150" r="70" fill="#fff" fill-opacity="0.35"/>'
                  '<circle cx="150" cy="150" r="105" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="6"/>')
    elif motif == "bars":
        shapes = "".join(
            f'<rect x="{30 + i * 32}" y="{250 - h}" width="22" height="{h}" rx="4" fill="#fff" fill-opacity="0.22"/>'
            for i, h in enumerate([60, 130, 90, 190, 150, 110, 170, 80]))
    else:  # waves
        shapes = "".join(
            f'<path d="M0 {y} Q 75 {y - 30} 150 {y} T 300 {y}" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="6"/>'
            for y in (120, 160, 200, 240))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="{slug} cover art">'
           f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="{c1}"/><stop offset="1" stop-color="{c2}"/></linearGradient></defs>'
           f'<rect width="300" height="300" fill="url(#g)"/>{shapes}</svg>')
    path = os.path.join(IMG_DIR, f"{slug}.svg")
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)
    return path

if __name__ == "__main__":
    for t in TRACKS:
        print("audio:", make_track(*t))
    for slug, (c1, c2, motif) in COVERS.items():
        print("cover:", make_cover(slug, c1, c2, motif))
