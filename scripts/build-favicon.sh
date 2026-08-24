#!/bin/sh
# Favicons and home-screen icons from the crayon master
# (videos/favicon.png, 512x512 with alpha).
#
#   favicon.png            32px, alpha kept — the browser tab
#   apple-touch-icon.png  180px, flattened on white — iOS paints BLACK
#                         behind a transparent touch icon, so never ship
#                         alpha here
#   icon-192/512.png      flattened on white — Android's home screen, via
#                         manifest.webmanifest (a plain link tag is not
#                         enough there)
#
# Keep nuxt.config.ts (head links, theme-color) and
# public/manifest.webmanifest in step with the files written here.
set -e
cd "$(dirname "$0")/.."

SRC=videos/favicon.png

# Alpha kept: tabs sit on the browser's own chrome
ffmpeg -v error -y -i "$SRC" -vf "scale=32:32" public/favicon.png

# Flattened on the page's white for the home screens
flat() {
	ffmpeg -v error -y \
		-f lavfi -i "color=white:s=${1}x${1}" -i "$SRC" \
		-filter_complex "[1:v]scale=${1}:${1}[icon];[0:v][icon]overlay=0:0:format=auto,format=rgb24" \
		-frames:v 1 "$2"
}
flat 180 public/apple-touch-icon.png
flat 192 public/icon-192.png
flat 512 public/icon-512.png

ls -la public/favicon.png public/apple-touch-icon.png public/icon-192.png public/icon-512.png
