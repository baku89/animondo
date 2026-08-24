#!/bin/sh
# Extract the hand-drawn tooltip SHEETS from the qtrle masters:
#
#   videos/tooltip_bubble.mov  809x456, 12 fps -> public/tooltip/bubble.webp
#                              (8F sheet: 0-3 appear from the tail, 4-7 loop;
#                              the master holds a 9th frame that stays unused)
#   videos/tooltip_{label}_{en,ja}.mov  809x456, 12 fps, 4F loop
#     -> public/tooltip/{label}_{lang}.webp
#     (labels: sound-on, sound-off, about, pads, explore_pc,
#     explore_mobile, click-me, tap-me — click-me speaks to fine
#     pointers, tap-me to coarse)
#
# One SHEET per animation, frames left to right: the components play them
# by stepping background-position over a single decoded image — swapping
# image URLs per frame flickered on cold caches.
#
# The bubble's tail roots at the bottom-left. NudgeTooltip.vue flips it
# per corner (vertically for the sound toggle top-left, 180° for the ?
# top-right, as drawn for the pads button bottom-left); the explore and
# tap-me tooltips use it as drawn, hanging over a dancer. The label masters
# share the bubble's canvas and are drawn for their tooltip's orientation,
# so laying one over its bubble lines up 1:1 — the labels themselves are
# NEVER flipped. Lossless WebP for the same reason as every other ink
# asset. Keep the tooltip components, the preload lists in pages/index.vue
# and utils/preloadAssets.ts in step with the sheets written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/tooltip
rm -f public/tooltip/*.webp

ffmpeg -v error -y -i videos/tooltip_bubble.mov -vf "select='lt(n\,8)',tile=8x1" \
	-frames:v 1 -c:v libwebp -lossless 1 public/tooltip/bubble.webp

label() {
	ffmpeg -v error -y -i "videos/tooltip_$1.mov" -vf "tile=4x1" -frames:v 1 \
		-c:v libwebp -lossless 1 "public/tooltip/$1.webp"
}

for lang in en ja; do
	label "sound-on_$lang"
	label "sound-off_$lang"
	label "about_$lang"
	label "pads_$lang"
	label "explore_pc_$lang"
	label "explore_mobile_$lang"
	label "click-me_$lang"
	label "tap-me_$lang"
done

ls -la public/tooltip
