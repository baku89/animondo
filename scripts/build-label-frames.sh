#!/bin/sh
# Extract the hand-drawn "click/tap to play" labels from the qtrle masters:
#
#   videos/label_click-to-play_{en,ja}.mov  387x122, 12 fps, 4F loop
#   videos/label_tap-to-play_{en,ja}.mov    -> public/label/{click,tap}-to-play_{lang}_{0..3}.webp
#
# Shown under the title screen's play button (TitleSequence.vue); which one a
# visitor sees follows their language and their pointer (coarse taps, fine
# clicks). Lossless WebP for the same reason as every other ink asset. Keep
# TitleSequence.vue in step with the frames written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/label

for verb in click tap; do
	for lang in en ja; do
		ffmpeg -v error -y -i "videos/label_${verb}-to-play_${lang}.mov" \
			-start_number 0 -c:v libwebp -lossless 1 \
			"public/label/${verb}-to-play_${lang}_%d.webp"
	done
done

ls -la public/label
