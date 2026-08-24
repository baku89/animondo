#!/bin/sh
# Extract the pads' animated icons from the qtrle masters:
#
#   videos/Pad-icons_{name}.mov  400x400, 12 fps, 12F
#     frames 0-3: appear / 4-7: loop / 8-11: disappear
#   -> public/pad-icons/{name}.webp  (one 4800x400 sheet, frames left to right)
#
# One SHEET per icon, not frames: PatternLaunchpad.vue plays them by
# stepping mask-position over a single decoded image — swapping mask URLs
# per frame flickered. The masters are white ink on solid black with no
# alpha; their luma is folded INTO the alpha channel here (as for the
# bubble's thumb-mask) so the CSS can use a plain alpha mask over a colour
# — `mask-mode: luminance` never shipped in Safari. The same sheet still
# serves resting black, queued colour and the beat's white. Several pads
# reuse one master rotated (up/right/left from down, the horizontal lanes
# from the vertical). Lossless WebP for the same reason as every other ink
# asset. Keep PatternLaunchpad.vue and utils/preloadAssets.ts in step with
# the sheets written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/pad-icons
rm -f public/pad-icons/*.webp

for master in videos/Pad-icons_*.mov; do
	name=$(basename "$master" .mov)
	name=${name#Pad-icons_}
	ffmpeg -v error -y -i "$master" -filter_complex \
		'[0:v]format=gray,split[a][b];[a][b]alphamerge,tile=12x1' \
		-frames:v 1 -c:v libwebp -lossless 1 "public/pad-icons/${name}.webp"
done

ls -la public/pad-icons
