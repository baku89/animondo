#!/bin/sh
# Extract the hand-drawn language-switch SHEETS from the qtrle masters:
#
#   videos/lang_en.mov      256x128, 12 fps, 4F loop -> public/lang/en.webp
#   videos/lang_ja.mov      256x128, 12 fps, 4F loop -> public/lang/ja.webp
#   videos/lang_circle.mov  256x128, 12 fps, 8F      -> public/lang/circle.webp
#                           (0-3 draw-in, 4-7 loop — see LocaleSwitch.vue)
#
# One SHEET per animation, frames left to right, played by stepping
# background-position — swapping image URLs per frame flickered on cold
# caches. The circle shares the words' canvas, so laying it over a word
# circles it 1:1. Lossless WebP for the same reason as every other ink
# asset. Keep LocaleSwitch.vue and utils/preloadAssets.ts in step with the
# sheets written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/lang
rm -f public/lang/*.webp

sheet() {
	ffmpeg -v error -y -i "videos/lang_$1.mov" -vf "tile=$2x1" -frames:v 1 \
		-c:v libwebp -lossless 1 "public/lang/$1.webp"
}

sheet en 4
sheet ja 4
sheet circle 8

ls -la public/lang
