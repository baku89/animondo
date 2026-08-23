import {useEventListener} from '@vueuse/core'
import type {vec2} from 'linearly'

import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
import {Direction, invertDirection} from '~/utils/tile'

interface Binding {
	/** A function deals a fresh pattern on every press */
	pattern: MovePattern | (() => MovePattern)
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
	// Meandering chains, re-dealt on every press
	'1': {pattern: () => Patterns.shuffle(Patterns.upDown)},
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

const SPARE_KEYS = 'bdefgijkmnoprtyz023456789'

// Rotations the launchpad's appear/vanish pad cycles through. The names can
// never come out of event.key, so they stay unreachable from the keyboard.
const PAD_VARIANTS: Record<string, Binding> = {
	rav90: {pattern: turn(Patterns.rightAppearVanish, 1)},
	rav180: {pattern: turn(Patterns.rightAppearVanish, 2)},
	rav270: {pattern: turn(Patterns.rightAppearVanish, 3)},
}

export const BINDINGS: Record<string, Binding> = {
	...FAMILIES,
	...Object.fromEntries(
		[...SPARE_KEYS].map((key, i) => [key, VARIATIONS[i % VARIATIONS.length]!])
	),
	...PAD_VARIANTS,
}

// The launchpad mirrors the keyboard: each pad walks a small cycle of key
// bindings. A repeated tap turns the family (u -> l) where turning means
// something, and reaches the dual through the same-key inversion where it
// doesn't (clockwise, gather, the straight flows).
export interface Pad {
	id: string
	keys: string[]
}

export const PADS: Pad[] = [
	{id: 'clockwise', keys: ['c']},
	{id: 'gather', keys: ['a']},
	{id: 'smallClockwise', keys: ['q']},
	{id: 'axisGather', keys: ['h', 'v']},
	{id: 'lanes', keys: ['u', 'l']},
	{id: 'appearVanish', keys: ['w', 'rav90', 'rav180', 'rav270']},
	{id: 'shuffle', keys: ['1']},
	{id: 'up', keys: ['arrowup']},
	{id: 'right', keys: ['arrowright']},
	{id: 'down', keys: ['arrowdown']},
	{id: 'left', keys: ['arrowleft']},
]

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
	const binding = BINDINGS[key]!

	// A dealing binding rolls a new pattern each time; judge a fresh deal
	// instead of caching one
	if (typeof binding.pattern === 'function') {
		const base = binding.pattern()
		return sustainsDancers(isInverted ? Patterns.invert(base) : base)
	}

	const cacheKey = `${key}:${isInverted}`
	let known = sustainsCache.get(cacheKey)
	if (known === undefined) {
		// offset() only shifts toroidally, so centring never changes this
		known = sustainsDancers(
			isInverted ? Patterns.invert(binding.pattern) : binding.pattern
		)
		sustainsCache.set(cacheKey, known)
	}
	return known
}

// Everything the autonomous drift may draw from. Inversion, rotation and a
// toroidal shift are applied on top, so this covers scatter and every
// re-anchored variant without listing them. The swaps are left out: two
// dancers crossing through each other read as a smudge, so they only run
// when someone asks for them by key (s / x).
const AUTO_BASES = [
	Patterns.clockwise,
	Patterns.gather,
	Patterns.horizontalGather,
	Patterns.verticalGather,
	Patterns.smallClockwise,
	Patterns.rightAppearVanish,
	Patterns.upDown,
	Patterns.leftRight,
	Patterns.up,
	Patterns.right,
	Patterns.down,
	Patterns.left,
]

// Shuffling only bites where lanes pass each other, so it deals from its
// own crossing-rich seeds instead of reworking whatever the drift drew.
// upDown covers leftRight through the rotations applied below.
const SHUFFLE_SEEDS = [Patterns.upDown, Patterns.smallClockwise]

const randomInt = (min: number, max: number) =>
	min + Math.floor(Math.random() * (max - min + 1))

function randomPattern(following: boolean): MovePattern {
	for (let attempt = 0; attempt < 24; attempt++) {
		// The shuffle enters the draw as one more base, re-rolled every deal
		let pattern =
			Math.random() < 1 / (AUTO_BASES.length + 1)
				? Patterns.shuffle(
						SHUFFLE_SEEDS[randomInt(0, SHUFFLE_SEEDS.length - 1)]!
					)
				: AUTO_BASES[randomInt(0, AUTO_BASES.length - 1)]!
		if (Math.random() < 0.5) pattern = Patterns.invert(pattern)
		for (let turns = randomInt(0, 3); turns > 0; turns--) {
			pattern = Patterns.rotate90(pattern)
		}
		pattern = Patterns.offset(pattern, [
			randomInt(0, Patterns.size.width - 1),
			randomInt(0, Patterns.size.height - 1),
		])

		// A watched dancer must survive whatever the drift deals out
		if (!following || sustainsDancers(pattern)) return pattern
	}
	return Patterns.clockwise
}

export function usePatternControl(
	centreCell: () => vec2,
	isFollowing: () => boolean = () => false,
	// While true (the launchpad is open) the piece is played by hand: the
	// drift never wanders, whatever stands keeps running until the next tap
	isHolding: () => boolean = () => false,
	// Keys are ignored until this turns true (the opening hands the stage
	// over). Otherwise the Space that starts the piece at the title screen
	// would also queue the rest and still the first free turns.
	isEnabled: () => boolean = () => true
) {
	// What has been asked for, waiting for the next step to pick it up
	let pendingKey = 'c'
	let inverted = false
	// The most recent choice a followed dancer can live through
	let safeKey = 'c'
	let safeInverted = false

	// The piece drifts through random patterns on its own; a key press pins
	// the manual choice for a while, then the drift resumes.
	const MANUAL_HOLD = 8
	let sincePress = Infinity
	let auto: {pattern: MovePattern; sustains: boolean; left: number} | null =
		null

	// A dealing binding (see Binding) rolls once per press, then holds that
	// deal through the manual window so it can actually be watched.
	let pressSeq = 0
	let dealt: {key: string; seq: number; pattern: MovePattern} | null = null

	// --- Launchpad state, for the UI to watch ---
	// The pad waiting for the next step to pick it up, the pad whose pattern
	// is currently dancing, and a counter that ticks the moment a queued pad
	// is taken up — the cue for its flash.
	const queuedPadId = ref<string | null>(null)
	const activePadId = ref<string | null>(null)
	const activationSeq = ref(0)
	let padCycle: {id: string; index: number} | null = null
	let takenSeq = 0

	function press(key: string, repeatInverts = true): boolean {
		// Pressing the same key again flips the pattern rather than restating
		// it, which is how each family reaches its dual.
		const nextInverted = repeatInverts && key === pendingKey ? !inverted : false

		// While someone is being watched, refuse any dance that would swallow
		// them — the gathers, the appear/vanish waves, the rests.
		if (isFollowing() && !sustains(key, nextInverted)) return false

		pendingKey = key
		inverted = nextInverted
		sincePress = 0
		pressSeq++
		return true
	}

	useEventListener('keydown', (event: KeyboardEvent) => {
		if (!isEnabled()) return
		if (event.metaKey || event.ctrlKey || event.altKey) return

		const key = event.key.toLowerCase()
		if (!(key in BINDINGS)) return
		event.preventDefault()

		if (press(key)) {
			// The keyboard takes over from whichever pad was queued
			queuedPadId.value = null
			padCycle = null
		}
	})

	// A launchpad tap. Tapping the same pad again advances its cycle; a first
	// tap always lands on the family's plain face, even when the keyboard
	// left the same key pending (repeatInverts false).
	function tapPad(id: string) {
		const pad = PADS.find(p => p.id === id)
		if (!pad) return

		const isRepeat = padCycle?.id === id
		const index = isRepeat ? (padCycle!.index + 1) % pad.keys.length : 0
		if (!press(pad.keys[index]!, isRepeat)) return

		padCycle = {id, index}
		queuedPadId.value = id
	}

	// Read once per automaton step. Presses are never acted on where they
	// arrive, which quantises them to the beat and collapses a flurry inside
	// one step down to whatever it ended on.
	function takePattern(): MovePattern {
		const following = isFollowing()
		const holding = isHolding()

		// Outside the manual window, wander: hold each random pattern for a
		// few turns, then deal another. The launchpad light goes out and its
		// cycles start over. In tap mode nothing counts down and nothing is
		// re-dealt: the pattern standing when the pads opened keeps running
		// (unless a followed dancer can no longer survive it).
		if (holding ? sincePress >= MANUAL_HOLD : sincePress++ >= MANUAL_HOLD) {
			activePadId.value = null
			padCycle = null
			if (
				!auto ||
				(following && !auto.sustains) ||
				(!holding && --auto.left <= 0)
			) {
				const pattern = randomPattern(following)
				auto = {
					pattern,
					sustains: sustainsDancers(pattern),
					left: randomInt(2, 4),
				}
			}
			return auto.pattern
		}

		// A lethal pattern may already be running when a dancer is tapped;
		// fall back to the last survivable choice until the follow ends.
		if (following && !sustains(pendingKey, inverted)) {
			pendingKey = safeKey
			inverted = safeInverted
		} else if (sustains(pendingKey, inverted)) {
			safeKey = pendingKey
			safeInverted = inverted
		}

		// The first take after a press is the seam the launchpad flashes on:
		// the queued pad's light comes on here. pressSeq moves once per press,
		// so a flurry inside one step still flashes once.
		if (takenSeq !== pressSeq) {
			takenSeq = pressSeq
			if (queuedPadId.value !== null) {
				activePadId.value = queuedPadId.value
				queuedPadId.value = null
				activationSeq.value++
			}
		}

		const binding = BINDINGS[pendingKey]!

		let base: MovePattern
		if (typeof binding.pattern === 'function') {
			if (dealt?.key !== pendingKey || dealt.seq !== pressSeq) {
				dealt = {key: pendingKey, seq: pressSeq, pattern: binding.pattern()}
			}
			base = dealt.pattern
		} else {
			base = binding.pattern
		}

		const pattern = inverted ? Patterns.invert(base) : base

		if (!binding.centred) return pattern

		// Drawn around the middle of the grid, so without this the dance sits
		// wherever the visitor last panned away from.
		const [cx, cy] = centreCell()
		return Patterns.offset(pattern, [
			Math.round(cx - Patterns.size.width / 2),
			Math.round(cy - Patterns.size.height / 2),
		])
	}

	return {takePattern, tapPad, queuedPadId, activePadId, activationSeq}
}
