#!/bin/sh
# Turn the crayon grain master videos/fade_mask.png (2273x1455, white flecks
# on black) into public/fade-mask.webp: a white image whose alpha is the
# INVERTED luma, floored at 20% (+level) so even the clearest flecks keep a
# breath of the wash. Drawn as-is it is a white veil with near-see-through
# holes where the crayon flecks are — the two fade effects share this one
# file:
#
#   - AboutModal.vue tiles it as the panel's background (the stage glints
#     through the flecks), boiling its position at 12 fps
#   - tile.frag samples its alpha to scrub the unfocused crowd toward the
#     paper instead of the old flat mix toward white
#
# The master is drawn at 2x for HiDPI, so both consumers show it at HALF its
# size — 1136.5x727.5 CSS px per tile (index.vue FADE_MASK_TILE / the CSS
# background-size). 1024x512 because WebGL1 only repeats power-of-two
# textures; the slight squeeze is invisible in noise.
#
# Lossy on purpose, unlike the ink assets: this is noise, not line work.
# alpha-quality 50 quantizes the alpha plane to a third of the lossless
# size with no change a side-by-side could show.
set -e
cd "$(dirname "$0")/.."

magick \
	\( -size 1024x512 xc:white \) \
	\( videos/fade_mask.png -colorspace gray -resize '1024x512!' -negate +level '20%,100%' \) \
	-alpha off -compose CopyOpacity -composite \
	-quality 80 -define webp:alpha-quality=50 \
	public/fade-mask.webp

ls -la public/fade-mask.webp
