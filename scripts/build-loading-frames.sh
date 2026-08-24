#!/bin/sh
# Extract the hand-drawn loading icon from the qtrle master:
#
#   videos/loading.mov  326x232, 12 fps, 9F loop -> public/loading/loading_{0..8}.webp
#
# Shown on the title screen while the asset manifest downloads
# (TitleSequence.vue). Lossless WebP for the same reason as every other ink
# asset. Keep TitleSequence.vue in step with the frames written here.
set -e
cd "$(dirname "$0")/.."
mkdir -p public/loading

ffmpeg -v error -y -i videos/loading.mov \
	-start_number 0 -c:v libwebp -lossless 1 public/loading/loading_%d.webp

ls -la public/loading
