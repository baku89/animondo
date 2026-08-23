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

ls -la public/bubble
