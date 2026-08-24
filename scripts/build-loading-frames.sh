#!/bin/sh
# Extract the hand-drawn loading icon SHEET from the qtrle master:
#
#   videos/loading.mov  326x232, 12 fps, 9F loop -> public/loading/loading.webp
#
# One SHEET, frames left to right, played by stepping background-position —
# swapping image URLs per frame flickered on cold caches. Shown on the title
# screen while the asset manifest downloads (TitleSequence.vue). Lossless
# WebP for the same reason as every other ink asset. Keep TitleSequence.vue
# in step with the sheet written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/loading
rm -f public/loading/*.webp

ffmpeg -v error -y -i videos/loading.mov -vf "tile=9x1" -frames:v 1 \
	-c:v libwebp -lossless 1 public/loading/loading.webp

ls -la public/loading
