#!/usr/bin/env bash
# Rebuild public/title-sprite.webp from videos/animondo_title.mov.
#
# The source is black ink with an alpha channel. We force the colour to pure
# black (transparent areas carry stray white), crop to the union of the ink's
# bounding box across every frame, and lay the 49 frames out as a 7x7 sheet.
#
# Lossless WebP costs about 285 KB, only ~50 KB more than a VP9 mask video
# would: a near-binary mask compresses spatially about as well as it does
# temporally, and lossy encoding would buy that 50 KB with ringing along the
# ink edges. Constant-black RGB compresses away to nothing, so keeping the
# colour channels costs the same as shipping the alpha alone.
#
# The sheet keeps its alpha so the page can use it as a plain background-image
# — no alpha-in-video codec, and no CSS mask, whose default alpha mode would
# read an opaque greyscale sheet as "show everything".
set -euo pipefail

cd "$(dirname "$0")/.."

SRC=videos/animondo_title.mov
OUT=public/title-sprite.webp

# Bounding box of every non-zero alpha pixel across the whole clip, padded to
# even dimensions. Recompute with scripts/title-sprite-bbox.py if the source
# is re-exported — ffmpeg's cropdetect gets this wrong (it clipped 3px of the
# leading "A" and 5px vertically).
CROP=838:214:119:134

ffmpeg -v error -i "$SRC" -filter_complex \
	"[0:v]format=rgba,crop=$CROP,split=2[c][a];\
	 [c]lutrgb=r=0:g=0:b=0[rgb];\
	 [a]alphaextract[al];\
	 [rgb][al]alphamerge,tile=7x7[out]" \
	-map "[out]" -frames:v 1 -c:v libwebp -lossless 1 -y "$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
