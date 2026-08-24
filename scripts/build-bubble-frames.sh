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

# The frame stays as individual frames: border-image slices the whole image,
# so it cannot page through a sheet — its boil is four stacked layers
# cross-faded by opacity instead (see .profile-bubble__skin).
extract bubble frame

# The background/mask players get SHEETS (frames left to right), stepped by
# background/mask-position over one decoded image — swapping URLs per frame
# flickered on cold caches.
sheet() {
	ffmpeg -v error -y -i "videos/$1.mov" -vf "tile=4x1" -frames:v 1 \
		-c:v libwebp -lossless 1 "public/bubble/$2.webp"
}

sheet bubble-tail tail
sheet bubble-close close
sheet bubble-web web

# The thumbnail vignette is authored as a luminance mask (white keeps, black
# edges hide). Fold that luma into the alpha channel here, so the CSS can use
# a plain alpha mask — `mask-mode: luminance` only reached Chrome in 120,
# below this project's floor.
ffmpeg -v error -y -i videos/bubble-thumb-mask.mov \
	-filter_complex '[0:v]format=gray,split[a][b];[a][b]alphamerge,tile=4x1' \
	-frames:v 1 -c:v libwebp -lossless 1 public/bubble/thumb-mask.webp

# Solid-colour silhouettes of the frame (its alpha — paper, ink and outline
# as one shape — repainted flat). The launchpad's glowing sheets border-image
# these with `fill`, so the glow's edge is the drawn edge in every browser
# (mask-border never made it past WebKit).
silhouette() {
	ffmpeg -v error -y -f lavfi -i "color=$2:s=1024x1024:r=12" \
		-i videos/bubble.mov \
		-filter_complex '[1:v]alphaextract[a];[0:v][a]alphamerge' \
		-frames:v 4 -start_number 0 -c:v libwebp -lossless 1 \
		"public/bubble/fill-$1_%d.webp"
}

silhouette white white

# The frame's ink alone: the white paper inside the drawing is turned
# transparent (new alpha = alpha x inverted luma), leaving line work that
# can sit ABOVE the coloured sheets without its band of paper covering them.
# Black is the launchpad's resting frame.
ink() {
	ffmpeg -v error -y -f lavfi -i "color=$2:s=1024x1024:r=12" \
		-i videos/bubble.mov \
		-filter_complex \
		'[1:v]alphaextract[a];[1:v]format=gray,negate[nl];[a][nl]blend=all_mode=multiply[na];[0:v][na]alphamerge' \
		-frames:v 4 -start_number 0 -c:v libwebp -lossless 1 \
		"public/bubble/$1_%d.webp"
}

ink frame-ink black

# One ink and one fill colourway per palette colour, lifted from the colour
# title — a queued or dancing pad wears its family's colour. Keep the names
# and hexes in step with FAMILY_INK / PAD_FAMILY in PatternLaunchpad.vue.
for spec in \
	blue:0x2060e0 \
	sky:0x40a0ff \
	mint:0x60ffa0 \
	green:0x40c020 \
	forest:0x008020 \
	pink:0xe060a0 \
	tangerine:0xff8040 \
	yellow:0xe0e040
do
	name=${spec%%:*}
	hex=${spec##*:}
	silhouette "$name" "$hex"
	ink "ink-$name" "$hex"
done

ls -la public/bubble
