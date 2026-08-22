import {useEventListener} from '@vueuse/core'
import type {vec2} from 'linearly'

import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
import {Direction, invertDirection} from '~/utils/tile'

interface Binding {
	pattern: MovePattern
	/** Built around the middle of the grid, so it has to follow the camera */
	centred?: boolean
}

const turn = (p: MovePattern, times: number) => {
	let out = p
	for (let i = 0; i < times; i++) out = Patterns.rotate90(out)
	return out
}

// The families worth remembering keep a mnemonic key. Their duals are absent
// on purpose: pressing the same key again inverts, so c covers both
// clockwise and counter-clockwise, a covers gather and scatter.
const FAMILIES: Record<string, Binding> = {
	c: {pattern: Patterns.clockwise, centred: true},
	a: {pattern: Patterns.gather, centred: true},
	h: {pattern: Patterns.horizontalGather, centred: true},
	v: {pattern: Patterns.verticalGather, centred: true},
	q: {pattern: Patterns.smallClockwise},
	w: {pattern: Patterns.rightAppearVanish},
	s: {pattern: Patterns.verticalSwap},
	x: {pattern: Patterns.horizontalSwap},
	u: {pattern: Patterns.upDown},
	l: {pattern: Patterns.leftRight},
	arrowup: {pattern: Patterns.up},
	arrowright: {pattern: Patterns.right},
	arrowdown: {pattern: Patterns.down},
	arrowleft: {pattern: Patterns.left},
	' ': {pattern: Patterns.empty},
}

// Every remaining key gets a variation, so no key is dead: mashing anything
// always moves the dance somewhere. Rotations and phase shifts of a family
// read as relatives of it; the masked ones shrink the dance to the middle
// and leave the outside standing still.
const VARIATIONS: Binding[] = [
	{pattern: turn(Patterns.rightAppearVanish, 1)},
	{pattern: turn(Patterns.rightAppearVanish, 2)},
	{pattern: turn(Patterns.rightAppearVanish, 3)},
	{pattern: Patterns.offset(Patterns.smallClockwise, [1, 0])},
	{pattern: Patterns.offset(Patterns.smallClockwise, [0, 1])},
	{pattern: Patterns.offset(Patterns.smallClockwise, [1, 1])},
	{pattern: Patterns.offset(Patterns.rightAppearVanish, [2, 0])},
	{pattern: Patterns.offset(Patterns.upDown, [1, 0])},
	{pattern: Patterns.offset(Patterns.leftRight, [0, 1])},
	{pattern: Patterns.offset(Patterns.verticalSwap, [1, 0])},
	{pattern: Patterns.offset(Patterns.horizontalSwap, [0, 1])},
	{pattern: Patterns.radialMask(Patterns.leftRight, 3), centred: true},
	{pattern: Patterns.radialMask(Patterns.clockwise, 1), centred: true},
	{pattern: Patterns.radialMask(Patterns.clockwise, 2), centred: true},
	{pattern: Patterns.radialMask(Patterns.clockwise, 3), centred: true},
	{pattern: Patterns.radialMask(Patterns.clockwise, 5), centred: true},
	{pattern: Patterns.radialMask(Patterns.gather, 1), centred: true},
	{pattern: Patterns.radialMask(Patterns.gather, 2), centred: true},
	{pattern: Patterns.radialMask(Patterns.gather, 3), centred: true},
	{pattern: Patterns.radialMask(Patterns.gather, 5), centred: true},
	{pattern: Patterns.radialMask(Patterns.smallClockwise, 2), centred: true},
	{pattern: Patterns.radialMask(Patterns.smallClockwise, 4), centred: true},
	{pattern: Patterns.radialMask(Patterns.rightAppearVanish, 3), centred: true},
	{pattern: Patterns.radialMask(Patterns.upDown, 4), centred: true},
	{pattern: Patterns.radialMask(Patterns.verticalSwap, 3), centred: true},
	{pattern: Patterns.radialMask(Patterns.horizontalGather, 4), centred: true},
]

const SPARE_KEYS = 'bdefgijkmnoprtyz0123456789'

export const BINDINGS: Record<string, Binding> = {
	...FAMILIES,
	...Object.fromEntries(
		[...SPARE_KEYS].map((key, i) => [key, VARIATIONS[i % VARIATIONS.length]!])
	),
}

const STEP: Partial<Record<Direction, [number, number]>> = {
	[Direction.Up]: [0, -1],
	[Direction.Right]: [1, 0],
	[Direction.Down]: [0, 1],
	[Direction.Left]: [-1, 0],
}

// A dancer survives a pattern forever iff every cell keeps it moving and the
// cell it moves into expects it: out is never None, and the receiving cell's
// in is the side the dancer arrives on. That also rules out two flows feeding
// one cell, so a follow can never be overwritten mid-watch either.
function sustainsDancers(pattern: MovePattern): boolean {
	let ok = true
	pattern.iterate((x, y, m) => {
		if (!ok) return
		const step = STEP[m.out]
		if (!step) {
			ok = false
			return
		}
		if (pattern.get(x + step[0], y + step[1]).in !== invertDirection(m.out)) {
			ok = false
		}
	})
	return ok
}

const sustainsCache = new Map<string, boolean>()

function sustains(key: string, isInverted: boolean): boolean {
	const cacheKey = `${key}:${isInverted}`
	let known = sustainsCache.get(cacheKey)
	if (known === undefined) {
		const base = BINDINGS[key]!.pattern
		// offset() only shifts toroidally, so centring never changes this
		known = sustainsDancers(isInverted ? Patterns.invert(base) : base)
		sustainsCache.set(cacheKey, known)
	}
	return known
}

export function usePatternControl(
	centreCell: () => vec2,
	isFollowing: () => boolean = () => false
) {
	// What has been asked for, waiting for the next step to pick it up
	let pendingKey = 'c'
	let inverted = false
	// The most recent choice a followed dancer can live through
	let safeKey = 'c'
	let safeInverted = false

	useEventListener('keydown', (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return

		const key = event.key.toLowerCase()
		if (!(key in BINDINGS)) return
		event.preventDefault()

		// Pressing the same key again flips the pattern rather than restating
		// it, which is how each family reaches its dual.
		const nextInverted = key === pendingKey ? !inverted : false

		// While someone is being watched, refuse any dance that would swallow
		// them — the gathers, the appear/vanish waves, the rests.
		if (isFollowing() && !sustains(key, nextInverted)) return

		pendingKey = key
		inverted = nextInverted
	})

	// Read once per automaton step. Presses are never acted on where they
	// arrive, which quantises them to the beat and collapses a flurry inside
	// one step down to whatever it ended on.
	function takePattern(): MovePattern {
		// A lethal pattern may already be running when a dancer is tapped;
		// fall back to the last survivable choice until the follow ends.
		if (isFollowing() && !sustains(pendingKey, inverted)) {
			pendingKey = safeKey
			inverted = safeInverted
		} else if (sustains(pendingKey, inverted)) {
			safeKey = pendingKey
			safeInverted = inverted
		}

		const binding = BINDINGS[pendingKey]!
		const pattern = inverted
			? Patterns.invert(binding.pattern)
			: binding.pattern

		if (!binding.centred) return pattern

		// Drawn around the middle of the grid, so without this the dance sits
		// wherever the visitor last panned away from.
		const [cx, cy] = centreCell()
		return Patterns.offset(pattern, [
			Math.round(cx - Patterns.size.width / 2),
			Math.round(cy - Patterns.size.height / 2),
		])
	}

	return {takePattern}
}
