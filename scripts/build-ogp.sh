#!/bin/sh
# Compose public/ogp.png (1200x630) from the title sprite.
#
# The title never settles — every frame of the waiting loop (22-30) is a boil
# with some letters half-erased — so no single frame reads as the full title.
# Stacking the ink of three loop frames unions their strokes: every letter
# appears, drawn a few times slightly apart, like an onion-skinned sketch.
#
# Keep nuxt.config.ts in step: the og:image URL and its width/height there
# describe the file written here.
set -e
cd "$(dirname "$0")/.."

crop() {
	row=$(($1 / 7))
	col=$(($1 % 7))
	echo "crop=838:214:$((col * 838)):$((row * 214))"
}

ffmpeg -v error -y \
	-f lavfi -i color=white:s=1200x630 -i public/title-sprite.webp \
	-filter_complex "\
[1:v]$(crop 22)[a];[1:v]$(crop 25)[b];[1:v]$(crop 28)[c];\
[0:v][a]overlay=(W-w)/2:(H-h)/2:format=auto[x];\
[x][b]overlay=(W-w)/2:(H-h)/2:format=auto[y];\
[y][c]overlay=(W-w)/2:(H-h)/2:format=auto" \
	-frames:v 1 public/ogp.png

ls -la public/ogp.png
