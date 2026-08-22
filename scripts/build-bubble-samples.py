#!/usr/bin/env python3
"""Generate the 9-slice speech-bubble drawing template and placeholder frames.

The bubble border is rendered with CSS border-image (see pages/index.vue), so
one square drawing yields the four corners, the repeating edges and the white
fill. This script produces:

  videos/bubble-template.png       guides to draw the real frames over
  videos/bubble-tail-template.png  same, for the tail
  public/bubble/frame_{0..2}.webp  placeholder boil frames (procedural wiggle)
  public/bubble/tail_{0..2}.webp   placeholder tail frames

Layout contract — every number here must match pages/index.vue:

  frame: 1024x1024, border-image-slice 128, shown at border-width 16px (1/8,
  so a 2x screen still samples the source at 4:1). The outline's centreline
  runs 64px in from the image edge with 64px corner radii, which makes the
  straight/arc junctions coincide with the slice lines. Those are the
  "gates": the stroke must cross every slice line straight, at nominal
  width, with no displacement — then the corner slices, the edge tiles and
  the round-repetition all connect for any bubble size. Anywhere else the
  line may wiggle freely. The centre slice is stretched to fill the bubble,
  so it must stay flat white.

  tail: 256x256, drawn pointing down, apex near the bottom; the white fill
  masks the border line running behind it (same trick as a paper cut-out).

Requires Pillow (pip install pillow); frames are saved as lossless WebP.
"""

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent

SIZE = 1024
SLICE = 128
INSET = 64  # centreline distance from the image edge
RADIUS = 64  # corner radius of the centreline
STROKE = 20  # nominal ink width
DISP = 16  # max wiggle displacement along the normal
WVAR = 7  # max ink-width variation
GATE = 48  # arc-length over which the wiggle eases out toward a gate
SS = 2  # supersampling factor
FRAMES = 3

TAIL_SIZE = 256
# The base sits near the top of the canvas so the tail only just reaches
# into the bubble's border band instead of sinking into the balloon; the
# CSS offset in pages/index.vue is tuned to this.
TAIL_APEX = (128, 244)
TAIL_BASE = [(52, 20), (204, 20)]
TAIL_STROKE = 18

# The centreline path: per quadrant a straight run followed by a quarter
# arc, walked clockwise starting at the top-left slice line.
L = SIZE - 2 * INSET - 2 * RADIUS
ARC = math.pi * RADIUS / 2
PERIMETER = 4 * (L + ARC)

GATES = [k * (L + ARC) + o for k in range(4) for o in (0.0, L)]


def path_point(s):
	"""Nominal centreline at arc length s: (x, y, nx, ny), normal outward."""
	s %= PERIMETER
	k, u = int(s // (L + ARC)), s % (L + ARC)

	if u < L:
		x, y, nx, ny = INSET + RADIUS + u, INSET, 0.0, -1.0
	else:
		theta = -math.pi / 2 + (u - L) / RADIUS
		nx, ny = math.cos(theta), math.sin(theta)
		x, y = SIZE - SLICE + RADIUS * nx, SLICE + RADIUS * ny

	# Rotate k quarter turns clockwise about the centre
	c = SIZE / 2
	for _ in range(k):
		x, y = c - (y - c), c + (x - c)
		nx, ny = -ny, nx
	return x, y, nx, ny


def gate_window(s):
	"""1 far from every gate, easing to 0 at the gates themselves."""
	d = min(min(abs(s - g), PERIMETER - abs(s - g)) for g in GATES)
	t = min(d / GATE, 1.0)
	return t * t * (3 - 2 * t)


def periodic_noise(rng, terms=7, kmin=8, kmax=40):
	"""Random smooth noise with period PERIMETER, normalized to [-1, 1]."""
	comp = [
		(rng.uniform(0.4, 1.0) / (1 + i) ** 0.7, rng.randint(kmin, kmax),
			rng.uniform(0, math.tau))
		for i in range(terms)
	]

	def raw(s):
		return sum(a * math.sin(math.tau * k * s / PERIMETER + p) for a, k, p in comp)

	peak = max(abs(raw(i * PERIMETER / 997)) for i in range(997)) or 1.0
	return lambda s: raw(s) / peak


def stroke_polyline(draw, points, scale):
	"""Ink a variable-width polyline as overlapping round dabs."""
	for x, y, w in points:
		r = w / 2 * scale
		draw.ellipse((x * scale - r, y * scale - r, x * scale + r, y * scale + r),
			fill=(0, 0, 0, 255))


def render_frame(seed):
	rng = random.Random(seed)
	disp = periodic_noise(rng)
	wvar = periodic_noise(rng)

	outline = []
	n = int(PERIMETER / 2)
	for i in range(n):
		s = i * PERIMETER / n
		x, y, nx, ny = path_point(s)
		g = gate_window(s)
		off = DISP * disp(s) * g
		outline.append((x + nx * off, y + ny * off, STROKE + WVAR * wvar(s) * g))

	# Transparent pixels carry white so the LANCZOS downscale doesn't pull a
	# dark halo around the fill's edge.
	img = Image.new('RGBA', (SIZE * SS, SIZE * SS), (255, 255, 255, 0))
	d = ImageDraw.Draw(img)
	d.polygon([(x * SS, y * SS) for x, y, _ in outline], fill=(255, 255, 255, 255))
	stroke_polyline(d, outline, SS)
	return img.resize((SIZE, SIZE), Image.LANCZOS)


def tail_edge(rng, p0, p1, samples=60):
	"""One slanted tail edge, wiggled but pinned at both endpoints."""
	ex, ey = p1[0] - p0[0], p1[1] - p0[1]
	length = math.hypot(ex, ey)
	ux, uy = ex / length, ey / length
	nx, ny = -uy, ux

	comp = [(rng.uniform(1.2, 2.8), rng.uniform(1.5, 3), rng.uniform(0, math.tau))
		for _ in range(2)]
	pts = []
	for i in range(samples + 1):
		t = i / samples
		w = math.sin(math.pi * t)
		off = sum(a * math.sin(math.tau * f * t + p) for a, f, p in comp) * w
		pts.append((
			p0[0] + ux * t * length + nx * off,
			p0[1] + uy * t * length + ny * off,
			TAIL_STROKE + rng.uniform(-1, 1) * 2,
		))
	return pts


def render_tail(seed):
	rng = random.Random(seed + 100)
	left = tail_edge(rng, TAIL_BASE[0], TAIL_APEX)
	right = tail_edge(rng, TAIL_BASE[1], TAIL_APEX)

	img = Image.new('RGBA', (TAIL_SIZE * SS, TAIL_SIZE * SS), (255, 255, 255, 0))
	d = ImageDraw.Draw(img)
	# White fill first (the base edge stays unstroked — it hides inside the
	# bubble), then ink on the two slanted edges only.
	fill = [(x * SS, y * SS) for x, y, _ in left] \
		+ [(x * SS, y * SS) for x, y, _ in reversed(right)]
	d.polygon(fill, fill=(255, 255, 255, 255))
	stroke_polyline(d, left, SS)
	stroke_polyline(d, right, SS)
	return img.resize((TAIL_SIZE, TAIL_SIZE), Image.LANCZOS)


def load_fonts():
	try:
		return (ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 30),
			ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 15))
	except OSError:
		fallback = ImageFont.load_default()
		return fallback, fallback


CYAN = (90, 190, 255, 255)
MAGENTA = (240, 60, 170, 255)
GRAY = (205, 205, 205, 255)
DARK = (120, 120, 120, 255)


def render_template():
	img = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 255))
	d = ImageDraw.Draw(img)
	font, _ = load_fonts()

	for v in (SLICE, SIZE - SLICE):
		d.line(((v, 0), (v, SIZE)), fill=CYAN, width=2)
		d.line(((0, v), (SIZE, v)), fill=CYAN, width=2)

	# Nominal centreline to trace over
	n = int(PERIMETER / 2)
	for i in range(n):
		x, y, _, _ = path_point(i * PERIMETER / n)
		r = STROKE / 2
		d.ellipse((x - r, y - r, x + r, y + r), fill=GRAY)

	# Gates: the stroke must pass through these bars straight
	for g in GATES:
		x, y, nx, ny = path_point(g)
		tx, ty = -ny, nx
		d.polygon([
			(x + sx * tx * 28 + sy * nx * 10, y + sx * ty * 28 + sy * ny * 10)
			for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))
		], outline=MAGENTA, width=3)

	d.multiline_text((SIZE / 2, SIZE / 2),
		'1024 x 1024 — slice 128 (cyan) — shown at border-width 16px (1/8)\n'
		'grey: nominal centreline, 64px in from the edge, ink ~20px wide\n'
		'magenta gates: cross straight at nominal width — wiggle freely elsewhere\n'
		'keep this centre square flat white — it gets stretched',
		fill=DARK, font=font, anchor='mm', align='center', spacing=16)
	return img


def render_tail_template():
	img = Image.new('RGBA', (TAIL_SIZE, TAIL_SIZE), (255, 255, 255, 255))
	d = ImageDraw.Draw(img)
	_, small = load_fonts()

	# The bubble's border band runs behind this strip when the tail is
	# placed; the fill must stay white through it so it masks the line.
	for v in (14, 128):
		d.line(((0, v), (TAIL_SIZE, v)), fill=CYAN, width=1)

	for p0, p1 in ((TAIL_BASE[0], TAIL_APEX), (TAIL_BASE[1], TAIL_APEX)):
		d.line((p0, p1), fill=GRAY, width=TAIL_STROKE)
	d.line((TAIL_BASE[0], TAIL_BASE[1]), fill=CYAN, width=1)

	d.multiline_text((TAIL_SIZE / 2, 20),
		'256 x 256, tip down — ink the two slants only;\n'
		'white fill must stay solid across the cyan band',
		fill=DARK, font=small, anchor='mm', align='center', spacing=4)
	return img


def main():
	out = ROOT / 'public' / 'bubble'
	out.mkdir(exist_ok=True)

	for i in range(FRAMES):
		render_frame(i + 1).save(out / f'frame_{i}.webp', lossless=True)
		render_tail(i + 1).save(out / f'tail_{i}.webp', lossless=True)
		print(f'frame_{i}.webp / tail_{i}.webp')

	render_template().save(ROOT / 'videos' / 'bubble-template.png')
	render_tail_template().save(ROOT / 'videos' / 'bubble-tail-template.png')
	print('templates -> videos/bubble-template.png, videos/bubble-tail-template.png')


if __name__ == '__main__':
	main()
