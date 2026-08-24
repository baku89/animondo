#!/bin/sh
# Extract the hand-drawn "click/tap to play" label SHEETS from the qtrle
# masters:
#
#   videos/label_click-to-play_{en,ja}.mov  387x122, 12 fps, 4F loop
#   videos/label_tap-to-play_{en,ja}.mov    -> public/label/{click,tap}-to-play_{lang}.webp
#
# One SHEET per label, frames left to right, played by stepping
# background-position — swapping image URLs per frame flickered on cold
# caches. Shown under the title screen's play button (TitleSequence.vue);
# which one a visitor sees follows their language and their pointer (coarse
# taps, fine clicks). Lossless WebP for the same reason as every other ink
# asset. Keep TitleSequence.vue and utils/preloadAssets.ts in step with the
# sheets written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/label
rm -f public/label/*.webp

for verb in click tap; do
	for lang in en ja; do
		ffmpeg -v error -y -i "videos/label_${verb}-to-play_${lang}.mov" \
			-vf "tile=4x1" -frames:v 1 -c:v libwebp -lossless 1 \
			"public/label/${verb}-to-play_${lang}.webp"
	done
done

ls -la public/label
