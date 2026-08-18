#!/usr/bin/env python3
"""Print the crop needed to trim videos/animondo_title.mov to its ink.

ffmpeg's cropdetect is not usable here: on this clip it reported
834:208:122:136, which cuts 3px off the leading "A" and 5px vertically. This
walks the alpha plane of every frame instead and takes the exact union.

Usage: scripts/title-sprite-bbox.py [source.mov]
"""
import subprocess
import sys

src = sys.argv[1] if len(sys.argv) > 1 else 'videos/animondo_title.mov'

probe = subprocess.run(
    ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
     'stream=width,height,nb_frames', '-of', 'csv=p=0', src],
    capture_output=True, text=True, check=True).stdout.strip().split(',')
w, h, n = int(probe[0]), int(probe[1]), int(probe[2])

alpha = subprocess.run(
    ['ffmpeg', '-v', 'error', '-i', src, '-vf', 'format=rgba,alphaextract',
     '-f', 'rawvideo', '-'],
    capture_output=True, check=True).stdout
assert len(alpha) == w * h * n, (len(alpha), w * h * n)

minx, maxx, miny, maxy = w, -1, h, -1
for f in range(n):
    base = f * w * h
    for y in range(h):
        row = alpha[base + y * w: base + (y + 1) * w]
        if max(row) == 0:
            continue
        miny, maxy = min(miny, y), max(maxy, y)
        left = next(i for i, v in enumerate(row) if v)
        right = w - 1 - next(i for i, v in enumerate(reversed(row)) if v)
        minx, maxx = min(minx, left), max(maxx, right)

bw, bh = maxx - minx + 1, maxy - miny + 1
print(f'ink bbox: {bw}x{bh} at +{minx}+{miny}')
print(f'CROP={bw + bw % 2}:{bh + bh % 2}:{minx}:{miny}')
