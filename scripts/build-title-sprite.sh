#!/usr/bin/env bash
# Rebuild public/title-sprite.webp from videos/animondo_title.mov.
#
# The source is coloured ink with an alpha channel (it used to be black-only,
# when this script forced the RGB to black against stray white — the colours
# pass through untouched now). We crop to the union of the ink's bounding box
# across every frame and lay the 49 frames out as a 7x7 sheet.
#
# Lossless WebP: lossy encoding would buy little here and pay for it with
# ringing along the ink edges. The sheet keeps its alpha so the page can use
# it as a plain background-image — no alpha-in-video codec, and no CSS mask,
# whose default alpha mode would read an opaque sheet as "show everything".
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
	"[0:v]format=rgba,crop=$CROP,tile=7x7[out]" \
	-map "[out]" -frames:v 1 -c:v libwebp -lossless 1 -y "$OUT"

echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
