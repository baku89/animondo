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

// Named bindings the pads (and a few surviving mnemonic keys) refer to.
// Most writing keys now reach these through KEY_PADS — the physical-layout
// blocks below — rather than by mnemonic; the names stay because PADS and
// the sustain checks address patterns by them.
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
	z: {pattern: Patterns.zigzag},
	// m as in Moore: the closed-loop Hilbert walk
	m: {pattern: Patterns.hilbert},
	// Meandering chains, re-dealt on every press
	'1': {pattern: () => Patterns.shuffle(Patterns.upDown)},
	// The corner key rolls the dice: a fresh drift-style deal every press
	'`': {pattern: () => randomPattern(false).pattern},
}

// The one key the pad blocks leave over: the | sticking out past the
// rotated block rolls the dice, like the backquote at the other corner
const EDGE_KEYS: Record<string, Binding> = {
	'\\': {pattern: () => randomPattern(false).pattern},
}

// Bindings only the launchpad's pads cycle through. The names can never
// come out of event.key, so they stay unreachable from the keyboard. The
// rings are the opening's own motif — the masked clockwise growing out of
// the middle — named here rather than borrowed from the spare-key
// variations, whose order is free to change.
const PAD_VARIANTS: Record<string, Binding> = {
	rav90: {pattern: turn(Patterns.rightAppearVanish, 1)},
	rav180: {pattern: turn(Patterns.rightAppearVanish, 2)},
	rav270: {pattern: turn(Patterns.rightAppearVanish, 3)},
	// The spin pad walks its 2x2 blocks through their four phases instead of
	// reversing: (1,0) -> (1,1) -> (0,1) -> back to q's (0,0)
	scw10: {pattern: Patterns.offset(Patterns.smallClockwise, [1, 0])},
	scw11: {pattern: Patterns.offset(Patterns.smallClockwise, [1, 1])},
	scw01: {pattern: Patterns.offset(Patterns.smallClockwise, [0, 1])},
	zig90: {pattern: turn(Patterns.zigzag, 1)},
	zig180: {pattern: turn(Patterns.zigzag, 2)},
	zig270: {pattern: turn(Patterns.zigzag, 3)},
	// Scatter-first duals for the pads: births lead, and the gathers — whose
	// dancers die into the middle — only come as the deliberate repeat
	scatterAll: {pattern: Patterns.scatter, centred: true},
	scatterH: {pattern: Patterns.horizontalScatter, centred: true},
	scatterV: {pattern: Patterns.verticalScatter, centred: true},
}

export const BINDINGS: Record<string, Binding> = {
	...FAMILIES,
	...EDGE_KEYS,
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
	// Scatter leads (a repeat inverts into the gather): the pads keep the
	// dancers' deaths off the first tap. The keyboard's a/h/v stay
	// gather-first for whoever knows what they are asking for.
	{id: 'scatter', keys: ['scatterAll']},
	// Repeats phase the 2x2 blocks around a cell-sized square loop rather
	// than reversing the spin (the keyboard's q still inverts)
	{id: 'smallClockwise', keys: ['q', 'scw10', 'scw11', 'scw01']},
	{id: 'axisScatter', keys: ['scatterH', 'scatterV']},
	// The lanes, one pad per axis; a repeat inverts the flow
	{id: 'upDown', keys: ['u']},
	{id: 'leftRight', keys: ['l']},
	{id: 'appearVanish', keys: ['w', 'rav90', 'rav180', 'rav270']},
	{id: 'shuffle', keys: ['1']},
	// The closed Hilbert walk: the whole crowd one snaking chain, reversed
	// by a repeat
	{id: 'hilbert', keys: ['m']},
	// Staircase chains; repeated taps turn the diagonal
	{id: 'zigzag', keys: ['z', 'zig90', 'zig180', 'zig270']},
	{id: 'up', keys: ['arrowup']},
	{id: 'right', keys: ['arrowright']},
	{id: 'down', keys: ['arrowdown']},
	{id: 'left', keys: ['arrowleft']},
]

// The keyboard IS the pad grid, four blocks of it: the left-hand block
// mirrors the pads' top four rows key for key, the same shape one hand to
// the right plays each pad inverted (4 gathers where 1 scatters), a third
// hand plays it turned a quarter (7 scatters sideways-first), and the
// board's right edge turns it the OTHER way — its short rows simply run
// out of keys (the home row ends at ' and the bottom at /). The arrows'
// own keys cover the bottom pad row; Space, Enter and Shift+Enter
// (handled in the key listener) flip and turn whatever is running.
const KEY_ROWS = ['123', 'qwe', 'asd', 'zxc']
const INVERTED_KEY_ROWS = ['456', 'rty', 'fgh', 'vbn']
const ROTATED_KEY_ROWS = ['789', 'uio', 'jkl', 'm,.']
const COUNTER_ROTATED_KEY_ROWS = ['0-=', 'p[]', ";'", '/']
// Keep in step with GRID in PatternLaunchpad.vue
const PAD_ROWS = [
	['scatter', 'smallClockwise', 'axisScatter'],
	['appearVanish', 'upDown', 'leftRight'],
	['shuffle', 'clockwise', 'hilbert'],
	['zigzag', 'up', 'right'],
]

const KEY_PADS: Record<string, {id: string; inverted: boolean; turns?: number}> =
	{}
for (const [r, row] of PAD_ROWS.entries()) {
	for (const [c, id] of row.entries()) {
		KEY_PADS[KEY_ROWS[r]![c]!] = {id, inverted: false}
		KEY_PADS[INVERTED_KEY_ROWS[r]![c]!] = {id, inverted: true}
		KEY_PADS[ROTATED_KEY_ROWS[r]![c]!] = {id, inverted: false, turns: 1}
		const counter = COUNTER_ROTATED_KEY_ROWS[r]![c]
		if (counter) KEY_PADS[counter] = {id, inverted: false, turns: -1}
	}
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

// Everything the autonomous drift may draw from, each tagged with the pad
// it answers to. Inversion, rotation and a toroidal shift are applied on
// top, so this covers scatter and every re-anchored variant without
// listing them. The swaps are left out: two dancers crossing through each
// other read as a smudge, so they only run when someone asks for them by
// key (s / x).
const AUTO_BASES: {pattern: MovePattern; tag: string}[] = [
	{pattern: Patterns.clockwise, tag: 'clockwise'},
	{pattern: Patterns.gather, tag: 'gather'},
	{pattern: Patterns.horizontalGather, tag: 'hGather'},
	{pattern: Patterns.verticalGather, tag: 'vGather'},
	{pattern: Patterns.smallClockwise, tag: 'spin'},
	{pattern: Patterns.rightAppearVanish, tag: 'rav'},
	{pattern: Patterns.upDown, tag: 'upDown'},
	{pattern: Patterns.leftRight, tag: 'leftRight'},
	{pattern: Patterns.hilbert, tag: 'hilbert'},
	{pattern: Patterns.zigzag, tag: 'zigzag'},
	{pattern: Patterns.up, tag: 'up'},
	{pattern: Patterns.right, tag: 'right'},
	{pattern: Patterns.down, tag: 'down'},
	{pattern: Patterns.left, tag: 'left'},
]

// Shuffling only bites where lanes pass each other, so it deals from its
// own crossing-rich seeds instead of reworking whatever the drift drew.
// upDown covers leftRight through the rotations applied below.
const SHUFFLE_SEEDS = [Patterns.upDown, Patterns.smallClockwise]

const randomInt = (min: number, max: number) =>
	min + Math.floor(Math.random() * (max - min + 1))

/** A drift deal, with the pad face it answers to (id, cycle stop,
 * inversion) so the launchpad can light and orient that pad unprompted */
interface AutoDeal {
	pattern: MovePattern
	pad: {id: string; index: number; inverted: boolean} | null
	/** Anchored families (the gathers, the turns): re-centre on the camera
	 * at take time, exactly as their manual bindings do. Without this a
	 * randomly offset scatter could split off-screen and read as a plain
	 * directional flow — while its pad claimed "spread". */
	centred: boolean
}

// The drift bases whose look lives at an anchor point. The flows, lanes,
// waves and walks are translation-invariant on the torus, so they keep
// their random offset.
const CENTRED_TAGS = new Set(['clockwise', 'gather', 'hGather', 'vGather'])

// Directions in rotate90 order (a right flow turns into an up flow)
const ROTATED_ARROWS = ['up', 'left', 'down', 'right']

// Which pad face a drift deal amounts to. Rotation does nothing to the
// radial families; the gathers land on the scatter-first pads with their
// inversion flipped; the flows fold rotation and inversion into which
// arrow (or lane axis, or wave heading) is actually running.
function autoPadFace(
	tag: string,
	inverted: boolean,
	rotations: number
): AutoDeal['pad'] {
	switch (tag) {
		case 'clockwise':
			return {id: 'clockwise', index: 0, inverted}
		case 'gather':
			return {id: 'scatter', index: 0, inverted: !inverted}
		case 'hGather':
		case 'vGather': {
			const axis = ((tag === 'vGather' ? 1 : 0) + rotations) % 2
			return {id: 'axisScatter', index: axis, inverted: !inverted}
		}
		case 'spin':
			return {id: 'smallClockwise', index: 0, inverted}
		case 'rav':
			return {
				id: 'appearVanish',
				index: (rotations + (inverted ? 2 : 0)) % 4,
				inverted: false,
			}
		case 'hilbert':
			// A rotated walk is still the walk; the pad only knows its mirror
			return {id: 'hilbert', index: 0, inverted}
		case 'zigzag':
			// Inverting the staircase runs it up-left — the same face a half
			// turn shows, so both fold into the cycle's stop
			return {
				id: 'zigzag',
				index: (rotations + (inverted ? 2 : 0)) % 4,
				inverted: false,
			}
		case 'upDown':
		case 'leftRight': {
			const axis = ((tag === 'leftRight' ? 1 : 0) + rotations) % 2
			// A half turn reverses the lanes just as the inversion does
			const flipped = inverted !== rotations >= 2
			return {
				id: axis === 0 ? 'upDown' : 'leftRight',
				index: 0,
				inverted: flipped,
			}
		}
		case 'up':
		case 'left':
		case 'down':
		case 'right': {
			const start = ROTATED_ARROWS.indexOf(tag)
			const id =
				ROTATED_ARROWS[(start + rotations + (inverted ? 2 : 0)) % 4]!
			return {id, index: 0, inverted: false}
		}
		case 'shuffle':
			return {id: 'shuffle', index: 0, inverted}
	}
	return null
}

function randomPattern(following: boolean): AutoDeal {
	for (let attempt = 0; attempt < 24; attempt++) {
		// The shuffle enters the draw as one more base, re-rolled every deal
		const base =
			Math.random() < 1 / (AUTO_BASES.length + 1)
				? {
						pattern: Patterns.shuffle(
							SHUFFLE_SEEDS[randomInt(0, SHUFFLE_SEEDS.length - 1)]!
						),
						tag: 'shuffle',
					}
				: AUTO_BASES[randomInt(0, AUTO_BASES.length - 1)]!
		let pattern = base.pattern
		const inverted = Math.random() < 0.5
		if (inverted) pattern = Patterns.invert(pattern)
		const rotations = randomInt(0, 3)
		for (let turns = rotations; turns > 0; turns--) {
			pattern = Patterns.rotate90(pattern)
		}
		// Anchored families stay put for the take-time centring; a random
		// shift would as likely park their middle off-screen (offset only
		// moves the anchor toroidally, so sustains is unaffected either way)
		const centred = CENTRED_TAGS.has(base.tag)
		if (!centred) {
			pattern = Patterns.offset(pattern, [
				randomInt(0, Patterns.size.width - 1),
				randomInt(0, Patterns.size.height - 1),
			])
		}

		// A watched dancer must survive whatever the drift deals out
		if (!following || sustainsDancers(pattern)) {
			return {pattern, pad: autoPadFace(base.tag, inverted, rotations), centred}
		}
	}
	return {
		pattern: Patterns.clockwise,
		pad: {id: 'clockwise', index: 0, inverted: false},
		centred: true,
	}
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
	// Enter's quarter turns, stacked on the pending face until the next press
	let extraTurns = 0
	// The most recent choice a followed dancer can live through
	let safeKey = 'c'
	let safeInverted = false

	// The piece drifts through random patterns on its own; a key press pins
	// the manual choice for a while, then the drift resumes.
	const MANUAL_HOLD = 8
	let sincePress = Infinity
	let auto: {
		pattern: MovePattern
		pad: AutoDeal['pad']
		centred: boolean
		sustains: boolean
		left: number
	} | null = null

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

	// Where the queued/active pad stands in its cycle — which of its keys,
	// and whether the same-key repeat has inverted it — so the launchpad can
	// draw its icon turned and flipped the way the pattern actually runs.
	// Null once the keyboard or the drift takes over.
	const padCycleState = ref<{
		id: string
		index: number
		inverted: boolean
	} | null>(null)

	function press(key: string, repeatInverts = true): boolean {
		// Pressing the same key again flips the pattern rather than restating
		// it, which is how each family reaches its dual
		const nextInverted = repeatInverts && key === pendingKey ? !inverted : false

		// While someone is being watched, refuse any dance that would swallow
		// them — the gathers, the appear/vanish waves, the rests.
		if (isFollowing() && !sustains(key, nextInverted)) return false

		pendingKey = key
		inverted = nextInverted
		extraTurns = 0
		sincePress = 0
		pressSeq++
		return true
	}

	// A press that states its face outright — the key and the inversion both
	// named, nothing toggling. The physical-layout blocks speak this way:
	// their inversion lives in WHICH block was struck, so repeats restate.
	function pressExact(key: string, exactInverted: boolean): boolean {
		if (isFollowing() && !sustains(key, exactInverted)) return false
		pendingKey = key
		inverted = exactInverted
		extraTurns = 0
		sincePress = 0
		pressSeq++
		return true
	}

	// Queue a pad at a given stop of its cycle, lighting it for the UI
	function surfacePad(id: string, index: number, exactInverted: boolean) {
		const pad = PADS.find(p => p.id === id)
		if (!pad) return
		if (!pressExact(pad.keys[index]!, exactInverted)) return
		padCycle = {id, index}
		padCycleState.value = {id, index, inverted: exactInverted}
		queuedPadId.value = id
	}

	// Space: whatever is running flips into its dual, pad light and all
	function invertCurrent() {
		if (isFollowing() && !sustains(pendingKey, !inverted)) return
		inverted = !inverted
		sincePress = 0
		pressSeq++
		if (padCycle) {
			padCycleState.value = {...padCycle, inverted}
			queuedPadId.value = padCycle.id
		}
	}

	// Enter: a quarter turn (Shift+Enter, and the right-edge key block, turn
	// the other way). Families whose tap cycle IS rotation advance their
	// cycle; an arrow walks to the next arrow; the lanes swap axes;
	// everything else turns the pattern itself and keeps its face.
	function rotateCurrent(direction = 1) {
		const pad = padCycle ? PADS.find(p => p.id === padCycle!.id) : undefined
		if (pad && LINKED_ARROWS.has(pad.id)) {
			// The face folds inversion into a heading; turn the heading
			const heading = inverted
				? ROTATED_ARROWS[(ROTATED_ARROWS.indexOf(pad.id) + 2) % 4]!
				: pad.id
			const next =
				ROTATED_ARROWS[
					(ROTATED_ARROWS.indexOf(heading) + direction + 4) % 4
				]!
			surfacePad(next, 0, false)
			return
		}
		if (pad && (pad.id === 'upDown' || pad.id === 'leftRight')) {
			surfacePad(pad.id === 'upDown' ? 'leftRight' : 'upDown', 0, inverted)
			return
		}
		if (pad && pad.keys.length > 1) {
			const length = pad.keys.length
			surfacePad(pad.id, (padCycle!.index + direction + length) % length, inverted)
			return
		}
		if (isFollowing() && !sustains(pendingKey, inverted)) return
		extraTurns = (extraTurns + direction + 4) % 4
		sincePress = 0
		pressSeq++
		if (padCycle) queuedPadId.value = padCycle.id
	}

	useEventListener('keydown', (event: KeyboardEvent) => {
		if (!isEnabled()) return
		if (event.metaKey || event.ctrlKey || event.altKey) return
		// A held key machine-guns keydowns; only deliberate presses play
		// (re-queueing every OS repeat kept cancelling the beat's white bow)
		if (event.repeat) return

		const key = event.key.toLowerCase()

		// Space flips whatever is running; Enter gives it a quarter turn,
		// Shift+Enter the counter-turn
		if (key === ' ') {
			event.preventDefault()
			invertCurrent()
			return
		}
		if (key === 'enter') {
			event.preventDefault()
			rotateCurrent(event.shiftKey ? -1 : 1)
			return
		}

		// The writing keys play the pad grid by physical position; a mapped
		// key surfaces its pad — queued like a tap, so the launchpad (open,
		// or its closed-mode ghost) floats it and flashes it on the takeup
		const mapped = KEY_PADS[key]
		if (mapped) {
			event.preventDefault()
			surfacePad(mapped.id, 0, mapped.inverted)
			// The turned blocks: the plain face, given Enter's quarter turn
			// (or the counter-turn, from the right edge)
			if (mapped.turns) rotateCurrent(mapped.turns)
			return
		}

		if (!(key in BINDINGS)) return
		event.preventDefault()

		// A held or hammered arrow keeps its direction: Space reverses it
		if (press(key, !key.startsWith('arrow'))) {
			const pad = PADS.find(p => p.keys.includes(key))
			if (pad) {
				const index = pad.keys.indexOf(key)
				padCycle = {id: pad.id, index}
				padCycleState.value = {id: pad.id, index, inverted}
				queuedPadId.value = pad.id
			} else {
				// The spare variations and the surviving mnemonics clear
				// the stage
				queuedPadId.value = null
				padCycle = null
				padCycleState.value = null
			}
		}
	})

	// The 2x2 arrow pads: they never invert — a repeated arrow restates its
	// direction (the opposite arrow is right there; Space still reverses
	// anything, arrows included), and Enter's rotation walks this ring.
	const LINKED_ARROWS = new Set(['up', 'right', 'down', 'left'])

	// A launchpad tap. Tapping the same pad again advances its cycle; a first
	// tap always lands on the family's plain face, even when the keyboard
	// left the same key pending (repeatInverts false).
	function tapPad(id: string) {
		const pad = PADS.find(p => p.id === id)
		if (!pad) return

		const isRepeat = padCycle?.id === id
		const index = isRepeat ? (padCycle!.index + 1) % pad.keys.length : 0
		if (!press(pad.keys[index]!, isRepeat && !LINKED_ARROWS.has(id))) return

		padCycle = {id, index}
		padCycleState.value = {id, index, inverted}
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
			if (
				!auto ||
				(following && !auto.sustains) ||
				(!holding && --auto.left <= 0)
			) {
				const deal = randomPattern(following)
				auto = {
					pattern: deal.pattern,
					pad: deal.pad,
					centred: deal.centred,
					sustains: sustainsDancers(deal.pattern),
					left: randomInt(2, 4),
				}
			}

			// The drift's deal answers to a pad: light that pad, oriented the
			// way the pattern actually runs, and seed the cycle and the
			// pending key so a tap on it continues from what is showing
			// (every drift base maps to a pad, so the light never goes dark)
			const face = auto.pad
			activePadId.value = face?.id ?? null
			padCycleState.value = face
			padCycle = face ? {id: face.id, index: face.index} : null
			if (face) {
				const key = PADS.find(p => p.id === face.id)?.keys[face.index]
				if (key) {
					pendingKey = key
					inverted = face.inverted
					extraTurns = 0
				}
			}

			if (!auto.centred) return auto.pattern

			// Anchored deals follow the camera, exactly as their manual
			// bindings would — the lit pad then shows on screen what it says
			const [cx, cy] = centreCell()
			return Patterns.offset(auto.pattern, [
				Math.round(cx - Patterns.size.width / 2),
				Math.round(cy - Patterns.size.height / 2),
			])
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

		let pattern = inverted ? Patterns.invert(base) : base
		// Enter's quarter turns ride on top of whatever face is running
		for (let i = 0; i < extraTurns; i++) pattern = Patterns.rotate90(pattern)

		if (!binding.centred) return pattern

		// Drawn around the middle of the grid, so without this the dance sits
		// wherever the visitor last panned away from.
		const [cx, cy] = centreCell()
		return Patterns.offset(pattern, [
			Math.round(cx - Patterns.size.width / 2),
			Math.round(cy - Patterns.size.height / 2),
		])
	}

	return {
		takePattern,
		tapPad,
		queuedPadId,
		activePadId,
		activationSeq,
		padCycleState,
		/** Has the visitor ever steered — any key or pad press? The opening
		 * choreography checks this each turn and cedes the floor. */
		hasPressed: () => pressSeq > 0,
	}
}
