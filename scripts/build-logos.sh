#!/bin/sh
# Turn the hand-drawn partner-logos master videos/logos.mov (964x582,
# 12 fps, 4F boil) into public/logos.webp — a single ANIMATED WebP, unlike
# the frame-set assets: the logos are one plain loop with no appear/exit
# states to sequence, so an <img> that loops by itself (AboutModal.vue)
# beats a CSS keyframe cycle. Lossless for the same reason as every other
# ink asset.
set -e
cd "$(dirname "$0")/.."

ffmpeg -v error -y -i videos/logos.mov \
	-c:v libwebp_anim -lossless 1 -loop 0 -r 12 \
	public/logos.webp

ls -la public/logos.webp
