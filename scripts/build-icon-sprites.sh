#!/usr/bin/env bash
# Rebuild public/icons/*.webp from videos/circle-icon_*.mov.
#
# Unlike the title, these are not a black-ink mask: the glyph is white and the
# outline carries both black and white, so the colour channels matter and the
# sheet keeps full RGBA.
#
# 256px cells: the largest of these is the 8rem play button, which wants
# exactly 256px on a 2x screen. A 3x phone gets a 1.3x upscale, where the icon
# is physically small anyway. Going to 320 would cost another 265 KB on the
# outline alone.
# Lossless, because WebP keeps alpha lossless
# even in its lossy mode — on alpha-dominated drawings like these, quality 80
# buys only ~14% and spends it on fringing along the ink.
#
# Scaling happens in premultiplied space; scaling straight alpha pulls the
# transparent pixels' colour into the edges and haloes the drawing.
set -euo pipefail

cd "$(dirname "$0")/.."

CELL=256
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

# The YouTube outline (the unsupported screen's play frame) is the one
# non-square master: 1000x800, so its cells keep that 5:4 at the same 256px
# height as the round outline's. CircleIcon contain-fits each layer, so the
# square play glyph still lands centred inside it.
src=videos/youtube_outline.mov
frames=$(ffprobe -v error -select_streams v:0 \
	-show_entries stream=nb_frames -of csv=p=0 "$src")
cols=$(python3 -c "import math;print(math.ceil(math.sqrt($frames)))")
rows=$(python3 -c "import math;print(math.ceil($frames / $cols))")

ffmpeg -v error -i "$src" -vf \
	"format=rgba,premultiply=inplace=1,scale=$((CELL * 5 / 4)):$CELL:flags=lanczos,unpremultiply=inplace=1,tile=${cols}x${rows}" \
	-frames:v 1 -c:v libwebp -lossless 1 -y "$OUT/youtube_outline.webp"

echo "youtube_outline: $frames frames, ${cols}x${rows} grid -> $(du -h "$OUT/youtube_outline.webp" | cut -f1)"
