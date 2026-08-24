#!/bin/sh
# Extract the hand-drawn speech-bubble boil frames from the qtrle masters:
#
#   videos/bubble.mov       1024x1024, 12 fps -> public/bubble/frame_{0..}.webp
#   videos/bubble-tail.mov   256x256,  12 fps -> public/bubble/tail_{0..}.webp
#   videos/bubble-close.mov    80x80,  12 fps -> public/bubble/close_{0..}.webp
#   videos/bubble-web.mov     300x97,  12 fps -> public/bubble/web_{0..}.webp
#   videos/bubble-thumb-mask.mov 1006x566    -> public/bubble/thumb-mask_{0..}.webp
#
# Lossless WebP, same reasoning as the title sprite: the ink is the picture,
# and the 128px slices are shown at 16px anyway. Keep pages/index.vue in
# step — the preload list and the bubble-*-boil keyframes must name exactly
# the frames written here, and the animation duration is frame count / 12 fps.
#
# The drawing contract (slices, gates, tail line level) lives in
# scripts/build-bubble-samples.py, which also renders the templates the
# masters are drawn over.
set -e
cd "$(dirname "$0")/.."

extract() {
	ffmpeg -v error -y -i "videos/$1.mov" \
		-start_number 0 -c:v libwebp -lossless 1 "public/bubble/$2_%d.webp"
}

extract bubble frame
extract bubble-tail tail
extract bubble-close close
extract bubble-web web

# The thumbnail vignette is authored as a luminance mask (white keeps, black
# edges hide). Fold that luma into the alpha channel here, so the CSS can use
# a plain alpha mask — `mask-mode: luminance` only reached Chrome in 120,
# below this project's floor.
ffmpeg -v error -y -i videos/bubble-thumb-mask.mov \
	-filter_complex '[0:v]format=gray,split[a][b];[a][b]alphamerge' \
	-start_number 0 -c:v libwebp -lossless 1 public/bubble/thumb-mask_%d.webp

# Solid-colour silhouettes of the frame (its alpha — paper, ink and outline
# as one shape — repainted flat). The launchpad's glowing sheets border-image
# these with `fill`, so the glow's edge is the drawn edge in every browser
# (mask-border never made it past WebKit). Keep the colours in step with
# PatternLaunchpad.vue ($pad-orange).
silhouette() {
	ffmpeg -v error -y -f lavfi -i "color=$2:s=1024x1024:r=12" \
		-i videos/bubble.mov \
		-filter_complex '[1:v]alphaextract[a];[0:v][a]alphamerge' \
		-frames:v 4 -start_number 0 -c:v libwebp -lossless 1 \
		"public/bubble/fill-$1_%d.webp"
}

silhouette orange 0xff6a00
silhouette white white

# The frame's ink alone: the white paper inside the drawing is turned
# transparent (new alpha = alpha x inverted luma), leaving line work that
# can sit ABOVE the coloured sheets without its band of paper covering them.
# Black is the launchpad's always-on frame; orange marks the waiting pad.
ink() {
	ffmpeg -v error -y -f lavfi -i "color=$2:s=1024x1024:r=12" \
		-i videos/bubble.mov \
		-filter_complex \
		'[1:v]alphaextract[a];[1:v]format=gray,negate[nl];[a][nl]blend=all_mode=multiply[na];[0:v][na]alphamerge' \
		-frames:v 4 -start_number 0 -c:v libwebp -lossless 1 \
		"public/bubble/$1_%d.webp"
}

ink frame-ink black
ink ink-orange 0xff6a00

ls -la public/bubble
