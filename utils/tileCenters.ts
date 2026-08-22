import type {vec2} from 'linearly'

import {Tile} from './tile'

/**
 * Where the dancer actually is inside its cell, frame by frame.
 *
 * Traced by hand in After Effects over baku's sheet — one null per tile,
 * keyframed across the eight frames of a step — and exported as
 * baku-centers.txt. Coordinates are the fraction across the cell as drawn on
 * screen, with y growing downward like the pattern grid.
 *
 * Every tile is drawn in one canonical form: the dancer enters from the LEFT
 * and leaves toward whatever the tile is named after, which is why the four
 * directional tracks all start at x = 0. TILE_DISPLAY_TABLE bears this out —
 * the inDir=Left row is the only one whose rotation is 0 throughout. Birth is
 * the exception, appearing at the centre and leaving rightward.
 *
 * The artists drew to the same template but not to the same centres, so these
 * stand in for all eight. They place the bubble far better than the middle of
 * the cell did, which is what they are for.
 */
export const TILE_CENTERS: Partial<Record<Tile, vec2[]>> = {
	[Tile.Death]: [
		[0.0, 0.5],
		[0.0637, 0.5],
		[0.1298, 0.5],
		[0.196, 0.5],
		[0.2605, 0.5],
		[0.3243, 0.5],
		[0.3871, 0.5],
		[0.4461, 0.5],
	],
	[Tile.Left]: [
		[0.0, 0.5],
		[0.1418, 0.474],
		[0.2489, 0.4134],
		[0.4189, 0.4091],
		[0.4662, 0.5],
		[0.3483, 0.5563],
		[0.2348, 0.5454],
		[0.1169, 0.5216],
	],
	[Tile.Down]: [
		[0.0, 0.5],
		[0.0781, 0.5],
		[0.1756, 0.5023],
		[0.2732, 0.5415],
		[0.3628, 0.6099],
		[0.4224, 0.7347],
		[0.4781, 0.8396],
		[0.4922, 0.9609],
	],
	[Tile.Right]: [
		[0.0, 0.5],
		[0.1339, 0.4401],
		[0.2678, 0.3958],
		[0.3783, 0.4375],
		[0.4106, 0.5156],
		[0.4957, 0.5234],
		[0.6183, 0.5156],
		[0.7578, 0.5],
	],
	[Tile.Up]: [
		[0.0, 0.5],
		[0.1484, 0.5156],
		[0.2812, 0.5469],
		[0.4141, 0.5469],
		[0.4844, 0.4609],
		[0.4922, 0.3594],
		[0.4922, 0.25],
		[0.5, 0.1172],
	],
	[Tile.Birth]: [
		[0.5078, 0.5],
		[0.5078, 0.5],
		[0.5078, 0.5],
		[0.5078, 0.5],
		[0.5547, 0.5],
		[0.6328, 0.5],
		[0.7109, 0.5],
		[0.8281, 0.5],
	],
}

/** Undoes what tile.frag's rotateUV does, so a drawn point lands on screen */
function unrotate([x, y]: vec2, rotation: number): vec2 {
	switch (rotation & 3) {
		case 1:
			return [1 - y, x]
		case 2:
			return [1 - x, 1 - y]
		case 3:
			return [y, 1 - x]
		default:
			return [x, y]
	}
}

/**
 * The dancer's position within its cell: 0..1 on each axis, y downward.
 * Falls back to the middle for tiles nothing was traced for.
 */
export function tileCenter(
	tile: Tile,
	rotation: number,
	flipVertical: boolean,
	frame: number
): vec2 {
	// tileDisplayToColorValue swaps these when flipped, so the cell actually
	// on screen is the other one and its track is the one to read
	if (flipVertical) {
		if (tile === Tile.Up) tile = Tile.Down
		else if (tile === Tile.Down) tile = Tile.Up
	}

	const track = TILE_CENTERS[tile]
	if (!track) return [0.5, 0.5]

	const drawn = track[frame % track.length]!
	// The shader flips after rotating, so undo them in the opposite order
	const flipped: vec2 = flipVertical ? [drawn[0], 1 - drawn[1]] : drawn

	return unrotate(flipped, rotation)
}
