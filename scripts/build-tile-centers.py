#!/usr/bin/env python3
"""Regenerate the per-artist block of utils/tileCenters.ts.

Input: the JSON written by scripts/export-tile-centers.jsx — every
"*_centers" comp in the AE project, its nulls sampled over the eight frames
of a step. Which cell of the 3x2 sheet a null sits over decides which tile
it tracks; layer names (with their "up 2" duplicate suffixes) are ignored.
Appear/vanish need no per-artist centres — the shared trace in
tileCenters.ts covers them.

Usage: scripts/build-tile-centers.py tile-centers.json
"""
import json
import sys
from pathlib import Path

TILE_BY_CELL = {
	(0, 0): 'Birth', (1, 0): 'Up', (2, 0): 'Right',
	(0, 1): 'Down', (1, 1): 'Left', (2, 1): 'Death',
}
TILE_ORDER = ['Birth', 'Up', 'Right', 'Down', 'Left', 'Death']
NL = '\n'

src = Path(sys.argv[1] if len(sys.argv) > 1 else 'tile-centers.json')
data = json.loads(src.read_text(encoding='utf-8'))

artist_entries = []
for artist in sorted(data):
	comp = data[artist]
	cell_w = comp['width'] / 3
	cell_h = comp['height'] / 2

	tracks = {}
	for layer in comp['layers']:
		pts = layer['points']
		mx = sum(p[0] for p in pts) / len(pts)
		my = sum(p[1] for p in pts) / len(pts)
		cell = (int(mx // cell_w), int(my // cell_h))
		tile = TILE_BY_CELL.get(cell)
		if tile is None:
			raise SystemExit(f'{artist}/{layer["name"]}: outside the 3x2 sheet')
		if tile in tracks:
			raise SystemExit(f'{artist}: two nulls over the {tile} cell')

		points = []
		for x, y in pts:
			nx = (x - cell[0] * cell_w) / cell_w
			ny = (y - cell[1] * cell_h) / cell_h
			# The shader samples the middle 50% of each cell; rebase onto it
			points.append((round(nx * 2 - 0.5, 4), round(ny * 2 - 0.5, 4)))
		tracks[tile] = points

	lines = []
	for tile in TILE_ORDER:
		if tile not in tracks:
			continue
		body = (',' + NL + '\t\t\t').join(f'[{x}, {y}]' for x, y in tracks[tile])
		lines.append(f'\t\t[Tile.{tile}]: [{NL}\t\t\t{body},{NL}\t\t],')
	artist_entries.append(f'\t{artist}: {{{NL}' + NL.join(lines) + f'{NL}\t}},')

ts = Path('utils/tileCenters.ts')
out = ts.read_text(encoding='utf-8')
BEGIN = '\t// BEGIN GENERATED — scripts/build-tile-centers.py\n'
END = '\t// END GENERATED\n'
head, found_begin, rest = out.partition(BEGIN)
_, found_end, tail = rest.partition(END)
if not found_begin or not found_end:
	raise SystemExit('generation markers not found in utils/tileCenters.ts')
ts.write_text(
	head + BEGIN + NL.join(artist_entries) + NL + END + tail, encoding='utf-8'
)
print(f'wrote utils/tileCenters.ts: {", ".join(sorted(data))}')
