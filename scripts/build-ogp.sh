#!/bin/sh
# Compose public/ogp.jpg (1200x630) from the video thumbnail.
#
# The thumb is the recording's 16:9 still (videos/Animondo_260824_thumb.jpg,
# 1280x720): scaled to 1200 wide, then centre-cropped to the OGP's 1200x630
# (22px trimmed off top and bottom). JPEG, not PNG — the crayon texture
# compresses far better and crawlers are fine with it.
#
# Keep nuxt.config.ts in step: the og:image URL and its width/height there
# describe the file written here.
set -e
cd "$(dirname "$0")/.."

ffmpeg -v error -y \
	-i videos/Animondo_260824_thumb.jpg \
	-vf "scale=1200:675,crop=1200:630" \
	-frames:v 1 -q:v 3 public/ogp.jpg

ls -la public/ogp.jpg
