#!/usr/bin/env bash
# Rebuild public/icons/*.webp from videos/circle-icon_*.mov.
#
# Unlike the title, these are not a black-ink mask: the glyph is white and the
# outline carries both black and white, so the colour channels matter and the
# sheet keeps full RGBA.
#
# 128px cells. The button is 2.5rem, which is 120px on a 3x screen, so this has
# a little headroom and no more. Lossless, because WebP keeps alpha lossless
# even in its lossy mode — on alpha-dominated drawings like these, quality 80
# buys only ~14% and spends it on fringing along the ink.
#
# Scaling happens in premultiplied space; scaling straight alpha pulls the
# transparent pixels' colour into the edges and haloes the drawing.
set -euo pipefail

cd "$(dirname "$0")/.."

CELL=128
OUT=public/icons
mkdir -p "$OUT"

for src in videos/circle-icon_*.mov; do
	name=$(basename "$src" .mov)
	frames=$(ffprobe -v error -select_streams v:0 \
		-show_entries stream=nb_frames -of csv=p=0 "$src")

	# Squarish sheet, filled row-major
	cols=$(python3 -c "import math;print(math.ceil(math.sqrt($frames)))")
	rows=$(python3 -c "import math;print(math.ceil($frames / $cols))")

	ffmpeg -v error -i "$src" -vf \
		"format=rgba,premultiply=inplace=1,scale=$CELL:$CELL:flags=lanczos,unpremultiply=inplace=1,tile=${cols}x${rows}" \
		-frames:v 1 -c:v libwebp -lossless 1 -y "$OUT/$name.webp"

	echo "$name: $frames frames, ${cols}x${rows} grid -> $(du -h "$OUT/$name.webp" | cut -f1)"
done
