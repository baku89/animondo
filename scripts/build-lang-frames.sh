#!/bin/sh
# Extract the hand-drawn language-switch frames from the qtrle masters:
#
#   videos/lang_en.mov      256x128, 12 fps, 4F loop -> public/lang/en_{0..3}.webp
#   videos/lang_ja.mov      256x128, 12 fps, 4F loop -> public/lang/ja_{0..3}.webp
#   videos/lang_circle.mov  256x128, 12 fps, 8F      -> public/lang/circle_{0..7}.webp
#                           (0-3 draw-in, 4-7 loop — see AboutModal.vue)
#
# The circle shares the words' canvas, so laying it over a word circles it
# 1:1. Lossless WebP for the same reason as every other ink asset. Keep
# AboutModal.vue in step: the lang-*-boil / lang-circle-* keyframes and the
# preload list name exactly the frames written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/lang

extract() {
	ffmpeg -v error -y -i "videos/lang_$1.mov" \
		-start_number 0 -c:v libwebp -lossless 1 "public/lang/$1_%d.webp"
}

extract en
extract ja
extract circle

ls -la public/lang
