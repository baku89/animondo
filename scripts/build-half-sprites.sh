#!/bin/sh
# Half-resolution sprites for the mobile atlas path (768x512, all-intra
# H.264, same 3x2 grid x 8 frames). The atlas renderer decodes every frame
# once at startup and throws the decoder away, so keyint=1 keeps any frame
# one chunk + one flush away, exactly like the full-size masters.
# Regenerate whenever public/sprites/*.mp4 change.
set -e
cd "$(dirname "$0")/.."

mkdir -p public/sprites-half
for src in public/sprites/*.mp4; do
	dst="public/sprites-half/$(basename "$src")"
	ffmpeg -v error -y -i "$src" \
		-vf scale=768:512:flags=lanczos \
		-c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p \
		-x264-params keyint=1:scenecut=0 \
		-an -movflags +faststart \
		"$dst"
done

ls -la public/sprites-half/
