#!/bin/sh
# Extract the hand-drawn tooltip frames from the qtrle masters:
#
#   videos/tooltip_bubble.mov       809x456, 12 fps -> public/tooltip/bubble_{0..7}.webp
#                                   (0-3 appear from the tail, 4-7 loop;
#                                   the master holds a 9th frame that stays unused)
#   videos/tooltip_sound-on_en.mov  809x456, 12 fps, 4F loop -> public/tooltip/sound-on_en_{0..3}.webp
#   videos/tooltip_sound-on_ja.mov  809x456, 12 fps, 4F loop -> public/tooltip/sound-on_ja_{0..3}.webp
#   videos/tooltip_explore_{pc,mobile}_{en,ja}.mov  809x456, 12 fps, 4F loop
#                                   -> public/tooltip/explore_{pc,mobile}_{en,ja}_{0..3}.webp
#
# The bubble's tail roots at the bottom-left. SoundTooltip.vue flips it
# vertically so the tail points up at the sound toggle; ExploreTooltip.vue
# uses it as drawn, hanging over a dancer. The label masters share the
# bubble's canvas and are drawn for their tooltip's orientation (sound-on
# for the flipped bubble, explore for the upright one), so laying one over
# its bubble lines up 1:1 — the labels themselves are NEVER flipped.
# Lossless WebP for the same reason as every other ink asset. Keep the two
# tooltip components and the preload lists in pages/index.vue in step with
# the frames written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/tooltip

ffmpeg -v error -y -i videos/tooltip_bubble.mov -frames:v 8 \
	-start_number 0 -c:v libwebp -lossless 1 public/tooltip/bubble_%d.webp

for lang in en ja; do
	ffmpeg -v error -y -i "videos/tooltip_sound-on_$lang.mov" \
		-start_number 0 -c:v libwebp -lossless 1 "public/tooltip/sound-on_${lang}_%d.webp"
	for device in pc mobile; do
		ffmpeg -v error -y -i "videos/tooltip_explore_${device}_${lang}.mov" \
			-start_number 0 -c:v libwebp -lossless 1 \
			"public/tooltip/explore_${device}_${lang}_%d.webp"
	done
done

ls -la public/tooltip
