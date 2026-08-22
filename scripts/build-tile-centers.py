#!/usr/bin/env python3
"""Regenerate utils/tileCenters.ts from the After Effects null export.

baku-centers.txt is six nulls, keyframed by hand over the eight frames of a
step, each sitting on a dancer's centre in one cell of the 3x2 sheet. The
layers come out of AE topmost-first, which is the reverse of the sheet order:

    vanish, left, down, right, up, appear

Usage: scripts/build-tile-centers.py [baku-centers.txt]
"""
import io
import re
import sys

CELL = 512
# name, and the cell it was drawn over, per the sheet layout in CLAUDE.md
CELLS = [('Death', 2, 1), ('Left', 1, 1), ('Down', 0, 1),
         ('Right', 2, 0), ('Up', 1, 0), ('Birth', 0, 0)]

src = sys.argv[1] if len(sys.argv) > 1 else 'baku-centers.txt'
blocks = io.open(src, encoding='utf-8', errors='replace').read().split(
    'Transform\tPosition')[1:]
if len(blocks) != len(CELLS):
    raise SystemExit(f'expected {len(CELLS)} nulls, found {len(blocks)}')

tracks = {}
for (name, col, row), block in zip(CELLS, blocks):
    points = []
    for line in block.strip().splitlines():
        m = re.match(r'\s*(\d+)\s+([-\d.]+)\s+([-\d.]+)', line)
        if not m:
            continue
        x = (float(m.group(2)) - col * CELL) / CELL
        y = (float(m.group(3)) - row * CELL) / CELL
        # The shader samples the middle 50% of each cell, so rebase onto that
        points.append((round(x * 2 - 0.5, 4), round(y * 2 - 0.5, 4)))
    if len(points) != 8:
        raise SystemExit(f'{name}: expected 8 keyframes, found {len(points)}')
    tracks[name] = points

NL = chr(10)
entries = []
for name, _, _ in CELLS:
    body = (',' + NL + '\t\t').join(f'[{x}, {y}]' for x, y in tracks[name])
    entries.append(f'\t[Tile.{name}]: [{NL}\t\t{body},{NL}\t],')

out = io.open('utils/tileCenters.ts', encoding='utf-8').read()
head, _, rest = out.partition('> = {' + NL)
_, _, tail = rest.partition(NL + '}' + NL)
io.open('utils/tileCenters.ts', 'w', encoding='utf-8').write(
    head + '> = {' + NL + NL.join(entries) + NL + '}' + NL + tail)
print(f'wrote utils/tileCenters.ts from {src}')
