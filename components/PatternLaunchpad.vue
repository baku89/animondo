<template>
	<div ref="root">
		<!-- The frames and fills, multiplied into the stage so they read as
			standing BEHIND the dancers' ink; the icons ride a second grid
			above, compositing normally, so they stay in front. -->
		<div
			class="pattern-launchpad"
			:class="{
				'pattern-launchpad--closed': !open && !closing && !waking,
				'pattern-launchpad--leaving': closing,
				'pattern-launchpad--waking': waking,
				'pattern-launchpad--settled': waveSettled,
			}"
		>
			<template v-for="(cell, i) in GRID" :key="i">
			<!-- animation-delay as an inline LONGHAND, not a --delay custom
				property inside the animation shorthand: WebKit re-parses
				var()-carrying animation declarations on style recalc and
				restarts them — pads froze half-scaled and blinked on iOS.
				Inline beats the shorthand's delay reset, and the leave wave
				(same bands) inherits it too. -->
			<button
				v-if="cell"
				class="pattern-launchpad__pad"
				:class="{
					'pattern-launchpad__pad--quiet': padQuiet(cell.id),
					'pattern-launchpad__pad--ghost': padGhost(cell.id),
				}"
				:data-pad="cell.id"
				:style="{animationDelay: `${delayOf(i)}s`}"
				:aria-label="cell.id"
				@pointerdown="$emit('tap', cell.id)"
				@pointerenter="onPadEnter(cell.id)"
				@pointerleave="onPadLeave(cell.id)"
			>
				<!-- The inner wrapper is what the beat pulses (centre origin);
					the button itself carries the corner-wave scale (bottom-left
					origin) — the two must not share a transform-origin -->
				<span class="pattern-launchpad__inner">
					<!-- The opening reveal: crayon-veil paper (and, for the
						pads still waiting on a drawn icon, the label) shows,
						then steps away, leaving the bare frames. --closed
						strips every animation, so leaving it re-arms this
						one — it replays on each opening, no remount needed. -->
					<span
						class="pattern-launchpad__face pattern-launchpad__face--intro"
						:style="{animationDelay: `${delayOf(i) + 0.5}s`}"
					>
						<span
							class="pattern-launchpad__sheet pattern-launchpad__sheet--paper"
						>
							<span
								v-for="f in 4"
								:key="`paper-${f}`"
								class="pattern-launchpad__ply pattern-launchpad__ply--filled"
								:class="`pattern-launchpad__ply--${f - 1}`"
								:style="{borderImageSource: plySource('fill-white', f - 1)}"
							/>
						</span>
						<span v-if="!cell.hasIcon" class="pattern-launchpad__label">{{
							cell.label
						}}</span>
					</span>
					<!-- The beat lands: a grained orange fill, gone again in a
						few steps. Keyed to the beat, so the dancing pattern's pad
						re-blinks on every turn, not only on its activation. -->
					<span
						v-if="cell.id === activePad"
						:key="`flash-${beatSeq}`"
						class="pattern-launchpad__face pattern-launchpad__face--flash"
					>
						<span
							class="pattern-launchpad__sheet pattern-launchpad__sheet--flash"
						>
							<span
								v-for="f in 4"
								:key="`fill-${f}`"
								class="pattern-launchpad__ply pattern-launchpad__ply--filled"
								:class="`pattern-launchpad__ply--${f - 1}`"
								:style="{
									borderImageSource: plySource(
										`fill-${familyOf(cell.id)}`,
										f - 1
									),
								}"
							/>
						</span>
						<span
							v-if="!cell.hasIcon"
							class="pattern-launchpad__label pattern-launchpad__label--knockout"
						>{{ cell.label }}</span>
					</span>
					<!-- The drawn frame never leaves the screen; its ink rides
						above the sheets, as on the real bubble. Each colourway
						is four standing layers turned by opacity (swapping
						border-image sources flickered on cold caches), and the
						state only flips which set shows: black at rest, the
						pad's family colour while queued or dancing. -->
					<span
						class="pattern-launchpad__frame"
						:class="{
							'pattern-launchpad__frame--lit':
								cell.id === queuedPad ||
								cell.id === flashingPad ||
								cell.id === activePad,
						}"
					>
						<span
							class="pattern-launchpad__frame-set pattern-launchpad__frame-set--black"
						>
							<span
								v-for="f in 4"
								:key="`ink-${f}`"
								class="pattern-launchpad__ply"
								:class="`pattern-launchpad__ply--${f - 1}`"
								:style="{borderImageSource: plySource('frame-ink', f - 1)}"
							/>
						</span>
						<span
							class="pattern-launchpad__frame-set pattern-launchpad__frame-set--color"
						>
							<span
								v-for="f in 4"
								:key="`color-${f}`"
								class="pattern-launchpad__ply"
								:class="`pattern-launchpad__ply--${f - 1}`"
								:style="{
									borderImageSource: plySource(
										`ink-${familyOf(cell.id)}`,
										f - 1
									),
								}"
							/>
						</span>
					</span>
					<!-- The tapped pad's label, until the beat -->
					<span
						v-if="cell.id === queuedPad && !cell.hasIcon"
						class="pattern-launchpad__face"
					>
						<span class="pattern-launchpad__label">{{ cell.label }}</span>
					</span>
				</span>
			</button>
			<!-- The empty corner cell: anywhere around the ☓ leaves pads mode
				too (the ☓ button itself stays the accessible control) -->
			<span
				v-else
				class="pattern-launchpad__escape"
				@pointerdown="$emit('close')"
			/>
			</template>
		</div>
		<!-- The icon layer: the same grid again, above the stage and
			compositing normally. Ghosting and the entrance wave mirror the
			back grid's; hits fall through to the buttons beneath. -->
		<div
			class="pattern-launchpad pattern-launchpad--fore"
			:class="{
				'pattern-launchpad--closed': !open && !closing && !waking,
				'pattern-launchpad--leaving': closing,
				'pattern-launchpad--waking': waking,
				'pattern-launchpad--settled': waveSettled,
			}"
			aria-hidden="true"
		>
			<template v-for="(cell, i) in GRID" :key="`fore-${i}`">
				<span
					v-if="cell"
					class="pattern-launchpad__pad"
					:class="{'pattern-launchpad__pad--ghost': padGhost(cell.id)}"
					:data-pad="cell.id"
					:style="{animationDelay: `${delayOf(i)}s`}"
				>
					<span class="pattern-launchpad__inner">
						<!-- The animated icon: the intro, the hover, the wait
							(the family's ink, orange once queued) and the beat's
							white exit, one copy playing one sheet frame at a
							time. Rotation turns one master into the whole arrow
							family. -->
						<span
							v-if="cell.hasIcon"
							class="pattern-launchpad__icons"
							:style="{transform: icons[cell.id]?.transform}"
						>
							<span
								v-if="iconPosition(cell.id)"
								class="pattern-launchpad__icon"
								:style="{
									maskImage: icons[cell.id]?.sheet || undefined,
									maskPosition: iconPosition(cell.id) ?? undefined,
									backgroundColor: iconColor(cell.id),
								}"
							/>
						</span>
					</span>
				</span>
				<span v-else />
			</template>
		</div>
	</div>
</template>

<script setup lang="ts">
import {onKeyStroke, useIntervalFn, useMediaQuery} from '@vueuse/core'

import {PADS} from '~/composables/usePatternControl'

const props = defineProps<{
	/** Pads mode: the full grid. Closed, the component stands by invisibly
	 * and only surfaces a keyboard-queued pad as a ghost. */
	open: boolean
	queuedPad: string | null
	activePad: string | null
	activationSeq: number
	/** Where the queued/active pad stands in its cycle (usePatternControl) */
	padCycle: {id: string; index: number; inverted: boolean} | null
	beatSeq: number
}>()

const emit = defineEmits<{(e: 'tap', id: string): void; (e: 'close'): void}>()

// Esc leaves pads mode, the same key that closes the About panel
onKeyStroke('Escape', () => {
	if (props.open) emit('close')
})

const root = useTemplateRef<HTMLElement>('root')

// Every image the boils step through, decoded up front and pinned for the
// component's lifetime. The bytes are already local (preloadAssets), but an
// animation stepping onto a not-yet-DECODED image blanks for a frame — the
// flicker on entrance.
const BOIL_URLS = [
	...[
		'frame-ink',
		'fill-white',
		...[
			'blue',
			'sky',
			'mint',
			'green',
			'forest',
			'pink',
			'tangerine',
			'yellow',
		].flatMap(family => [`ink-${family}`, `fill-${family}`]),
	].flatMap(name => [0, 1, 2, 3].map(i => `/animondo/bubble/${name}_${i}.webp`)),
	// The icon sheets too: a mask on an undecoded image blanks just like a
	// background would
	...[
		'clockwise',
		'down',
		'gather',
		'hilbert',
		'lane-vertical',
		'pinch',
		'scatter',
		'shuffle',
		'spin',
		'spread-horizontal',
		'wave',
		'zigzag',
	].map(name => `/animondo/pad-icons/${name}.webp`),
]
const warmed: HTMLImageElement[] = []

onMounted(() => {
	for (const url of BOIL_URLS) {
		const image = new Image()
		image.src = url
		image.decode().catch(() => {})
		warmed.push(image)
	}
})

// While the flash face burns (its 0.4s animation), the pad's frame stays
// orange too; afterwards it falls back to black ink. Keyed off the
// activation, so a queued pad hands its orange frame straight to the flash
// with no black flicker between.
const FLASH_MS = 400
const flashingPad = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined

// Stand-ins until each pad gets its own drawn icon
const LABELS: Record<string, string> = {
	clockwise: 'circle',
	scatter: 'scatter',
	smallClockwise: 'spin',
	axisScatter: 'spread',
	upDown: 'lanes ↕',
	leftRight: 'lanes ↔',
	appearVanish: 'waves',
	shuffle: 'shuffle',
	hilbert: 'hilbert',
	zigzag: 'zigzag',
	up: '↑',
	right: '→',
	down: '↓',
	left: '←',
}

// The pads' animated icons (scripts/build-pad-icons.sh): which master each
// pad plays and how far to turn it — one drawn arrow serves the whole
// family. `step` is how many degrees each stop of the pad's tap cycle adds;
// `invert` is what the same-key repeat's inversion looks like (a flow
// reverses by half a turn, a spiral or a walk by its mirror). The icon
// follows padCycle, so a hover after the pattern fired shows the
// orientation actually dancing. A pad absent here falls back to its label.
const PAD_ICONS: Record<
	string,
	{
		asset: string
		rotate: number
		step?: number
		invert?: 'rotate' | 'mirror' | 'flip'
		/** A drawn dual played instead of a transform when the cycle stands
		 * inverted (gather for scatter, pinch for the spread) */
		invertAsset?: string
	}
> = {
	clockwise: {asset: 'clockwise', rotate: 0, invert: 'mirror'},
	// The inversion has its own drawing: arrows falling into the middle
	scatter: {asset: 'scatter', rotate: 0, invertAsset: 'gather'},
	// The spin's TAP cycle is phase shifts (direction unchanged), but the
	// keyboard's inverted block genuinely reverses it — mirror for that
	smallClockwise: {asset: 'spin', rotate: 0, invert: 'mirror'},
	// Patterns.rotate90 turns right into up — counter-clockwise — so the
	// cycling icons step by -90; the inversion (a gather) plays the drawn
	// pinch, turned by the same step
	axisScatter: {
		asset: 'spread-horizontal',
		rotate: 0,
		step: -90,
		invertAsset: 'pinch',
	},
	// Drawn flowing right, like the rightAppearVanish it fires
	appearVanish: {asset: 'wave', rotate: 0, step: -90},
	// A 180 would only swap the lanes' columns; the vertical flip is what
	// reverses each arrow's flow
	upDown: {asset: 'lane-vertical', rotate: 0, invert: 'flip'},
	leftRight: {asset: 'lane-vertical', rotate: 90, invert: 'flip'},
	shuffle: {asset: 'shuffle', rotate: 0, invert: 'mirror'},
	hilbert: {asset: 'hilbert', rotate: 0, invert: 'mirror'},
	zigzag: {asset: 'zigzag', rotate: 0, step: -90},
	down: {asset: 'down', rotate: 0, invert: 'rotate'},
	up: {asset: 'down', rotate: 180, invert: 'rotate'},
	left: {asset: 'down', rotate: 90, invert: 'rotate'},
	right: {asset: 'down', rotate: 270, invert: 'rotate'},
}

function pad(id: string) {
	const found = PADS.find(p => p.id === id)
	if (!found) throw new Error(`Unknown pad: ${id}`)
	return {id, label: LABELS[id] ?? id, hasIcon: id in PAD_ICONS}
}

// Row-major, 3 × 5. The bottom-left cell stays empty — the ☓ button that
// closes the launchpad lives there. The arrows sit as their own 2 × 2 block
// in the turning order they flow in, the two lane pads two rows above it,
// and clockwise holds the dead centre of the grid.
const GRID: (ReturnType<typeof pad> | null)[] = [
	pad('scatter'),
	pad('smallClockwise'),
	pad('axisScatter'),
	pad('appearVanish'),
	pad('upDown'),
	pad('leftRight'),
	pad('shuffle'),
	pad('clockwise'),
	pad('hilbert'),
	pad('zigzag'),
	pad('up'),
	pad('right'),
	null,
	pad('left'),
	pad('down'),
]

// The open/close wave walks L-shaped bands out of the bottom-left corner
// (Chebyshev distance from the ☓'s cell) — one drawn frame (1/12 s) per band,
// so the wave lives on the same 12 fps grid as every other animation here
const WAVE_STEP = 1 / 12

function delayOf(i: number) {
	const row = Math.floor(i / 3)
	const col = i % 3
	return (Math.max(col, 4 - row) - 1) * WAVE_STEP
}

// Every beat, the queued pad AND the active one pulse: a scale pop about
// their own centre, stepped back over 24 fps frames (twice the drawn clock —
// pure motion reads too choppy at 12). Driven through the Web Animations API
// so it composes with (instead of fighting) the CSS `scale` of the
// open/close wave.
watch(
	() => props.beatSeq,
	() => {
		if (!root.value) return
		const pads = new Set([props.queuedPad, props.activePad])
		for (const id of pads) {
			if (!id) continue
			pulsePad(id)
		}

		// EVERY beat of the dancing pattern bows its icon out in white —
		// not just the first (activationSeq only moves at the takeup); the
		// ticker re-lights it while the pad stays active
		const state = icons[props.activePad ?? '']
		if (state && state.phase !== 'beat') {
			state.phase = 'beat'
			state.frame = 8
			state.wait = 0
		}
	}
)

function pulsePad(id: string) {
	// Both grids carry the pad (frames behind, icon in front): pop them in
	// step so the drawing never splits
	const inners = root.value?.querySelectorAll(
		`.pattern-launchpad__pad[data-pad="${id}"] .pattern-launchpad__inner`
	)
	inners?.forEach(inner => pulseInner(inner))
}

function pulseInner(inner: Element) {
	// One frame of wind-up shy of the peak, then the peak, then an ease-out
	// tail — the pop reads as a bounce rather than a decay. PULSE_MAX is the
	// whole curve's reach past rest; the fractions keep its shape. The
	// easing sits ON each keyframe: WAAPI's options-level easing spans the
	// whole animation, which held the first value and skipped every step
	// between.
	// Four frames on the drawn 12 fps clock: wind-up, peak, and two of tail
	const PULSE_MAX = 0.08
	const steps = [0.75, 1, 0.4, 0.1, 0].map((k, index, curve) => ({
		transform: `scale(${1 + k * PULSE_MAX})`,
		easing: index < curve.length - 1 ? 'step-end' : undefined,
	}))
	inner.animate(steps, {duration: (1000 / 12) * (steps.length - 1)})
}

// --- The animated icons ---
// Every icon master is 12 frames on the drawn clock: 0-3 appear, 4-7 loop,
// 8-11 disappear. One ticker walks every pad's little machine:
//   intro   the pads-mode reveal — each icon plays once, head to vanish,
//           riding the corner wave's band
//   enter   appear, into…
//   loop    …the held loop: while hovered (where hover exists), or — in
//           orange — while queued for the beat
//   exit    disappear (hover left, or the queue moved on)
//   beat    the queued icon plays its disappear, painted white
const ICON_FRAMES = 12

const hoverCapable = useMediaQuery('(hover: hover)')

interface IconState {
	phase: 'none' | 'intro' | 'enter' | 'loop' | 'exit' | 'beat'
	frame: number
	/** Ticks still to hold before showing (the intro's wave band) */
	wait: number
	colored: boolean
	/** The transform actually on screen — refreshed only as the icon
	 * (re)enters, so a turn never lands on a standing drawing */
	transform: string
	/** The sheet on screen — frozen with the transform, so an inversion's
	 * asset swap (see invertAsset) never lands on a standing drawing */
	sheet: string
}

const icons = reactive<Record<string, IconState>>(
	Object.fromEntries(
		Object.keys(PAD_ICONS).map(id => [
			id,
			{
				phase: 'none',
				frame: 0,
				wait: 0,
				colored: false,
				transform: '',
				sheet: '',
			},
		])
	)
)

watch(
	() => props.activationSeq,
	() => {
		flashingPad.value = props.activePad
		clearTimeout(flashTimer)
		flashTimer = setTimeout(() => (flashingPad.value = null), FLASH_MS)
		// The icon's white bow rides the beatSeq watch above, which covers
		// the takeup beat and every later one alike
	}
)

// Pads mode switched on: dropping --closed re-arms every CSS animation
// (closed strips them), so the corner wave and the intro faces replay on
// standing DOM — no remount, no element churn on iOS — and every icon
// plays itself once, entering as its pad's band of the wave lands (3
// ticks of pad-enter). Switched off, the same wave runs out (--leaving)
// before the grid goes dark. Through either wave every frame shows for
// a moment, hover-capable or not (waveShowing).
const waveShowing = ref(false)
const closing = ref(false)
// The beat of leave-taking before the wave: where hover kept the resting
// frames hidden, they first step back IN (the quiet fade run backwards),
// and only then does the corner wave carry the pads out
const waking = ref(false)
let waveTimer: ReturnType<typeof setTimeout> | undefined

// Once the entrance wave has landed (last band: 0.25s delay + 0.25s of
// pad-enter), the pads stand still and need no CSS animation at all —
// --settled drops it. This is also the healer for a Safari bug: WebKit
// now and then latches a steps() entrance mid-flight, freezing a whole
// delay band one step small; removing the animation snaps every pad to
// its true size.
const waveSettled = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | undefined

watch(
	() => props.open,
	(open, was) => {
		clearTimeout(waveTimer)
		clearTimeout(settleTimer)
		if (open) {
			closing.value = false
			waking.value = false
			waveShowing.value = true
			waveTimer = setTimeout(() => (waveShowing.value = false), 1500)
			waveSettled.value = false
			settleTimer = setTimeout(() => (waveSettled.value = true), 700)
			for (const [i, cell] of GRID.entries()) {
				if (!cell) continue
				const state = icons[cell.id]
				if (!state) continue
				state.phase = 'intro'
				state.frame = 0
				state.wait = Math.round(delayOf(i) * 12) + 3
				state.transform = iconTransform(cell.id)
				state.sheet = iconSheet(cell.id)
			}
		} else if (was) {
			// Hover-hidden frames step back in first (pad-frame-wake, three
			// drawn frames); without hover there is nothing to wake
			const wake = hoverCapable.value ? 250 : 0
			waking.value = wake > 0
			waveTimer = setTimeout(() => {
				waking.value = false
				closing.value = true
				waveShowing.value = true
				waveSettled.value = false
				waveTimer = setTimeout(() => {
					closing.value = false
					waveShowing.value = false
				}, 600)
			}, wake)
		}
	},
	{immediate: true}
)

// Which pad the pointer stands on, for the hover-capable edge hiding
const hoveredPad = ref<string | null>(null)

// Where hover exists, a resting pad keeps its edges off the stage: only
// the hovered pad and the one dancing (or flashing) show their frame
function padQuiet(id: string): boolean {
	// The wake beat counts as still-open: the quiet class must stand for
	// its frames to play the wake animation rather than popping on
	if (!hoverCapable.value || !(props.open || waking.value)) return false
	// The entrance and leave waves show everyone's edges for their moment
	if (waveShowing.value) return false
	return !(
		id === hoveredPad.value ||
		id === props.queuedPad ||
		id === props.activePad ||
		id === flashingPad.value
	)
}

// Closed pads mode: only a keyboard-queued pad surfaces, and it leaves
// with its activation flash
function padGhost(id: string): boolean {
	return id === props.queuedPad || id === flashingPad.value
}

useIntervalFn(() => {
	for (const [id, state] of Object.entries(icons)) {
		if (state.phase === 'none') continue
		if (state.wait > 0) {
			state.wait -= 1
			continue
		}
		switch (state.phase) {
			case 'intro':
			case 'exit':
			case 'beat':
				if (state.frame >= ICON_FRAMES - 1) {
					// The queued or dancing pattern's icon never rests:
					// whatever exit just finished (the beat's white bow, an
					// orientation change's bow-out), it re-appears lit — and
					// only here does a new turn or flip land on it. Closed,
					// only a RE-QUEUED ghost comes back (a fresh press landed
					// during the bow); the flashing pad's white bow is its
					// goodbye — a relight would flash the enter frames into
					// the last sliver before the flash hides it.
					if (
						id === props.queuedPad ||
						(props.open && id === props.activePad)
					) {
						state.phase = 'enter'
						state.frame = 0
						state.colored = true
						state.transform = iconTransform(id)
						state.sheet = iconSheet(id)
					} else {
						state.phase = 'none'
						state.colored = false
					}
				} else {
					state.frame += 1
				}
				break
			case 'enter':
				if (state.frame >= 3) {
					state.phase = 'loop'
					state.frame = 4
				} else {
					state.frame += 1
				}
				break
			case 'loop':
				state.frame = state.frame >= 7 ? 4 : state.frame + 1
				break
		}
	}
}, 1000 / 12)

function onPadEnter(id: string) {
	hoveredPad.value = id
	if (!hoverCapable.value || props.queuedPad === id) return
	// The active pad is already lit and looping; leave it be
	if (props.activePad === id) return
	const state = icons[id]
	if (!state || state.phase === 'enter' || state.phase === 'loop') return
	state.phase = 'enter'
	state.frame = 0
	state.wait = 0
	state.colored = false
	state.transform = iconTransform(id)
	state.sheet = iconSheet(id)
}

function onPadLeave(id: string) {
	if (hoveredPad.value === id) hoveredPad.value = null
	const state = icons[id]
	// A queued icon holds through the beat, wherever the pointer goes
	if (!state || state.colored) return
	if (state.phase === 'enter' || state.phase === 'loop') {
		state.phase = 'exit'
		state.frame = 8
	}
}

watch(
	() => props.queuedPad,
	(id, previous) => {
		// The pad that lost the queue without its beat lets its icon go —
		// unless it is also the active one, which stays lit
		if (previous && previous !== id && previous !== props.activePad) {
			const old = icons[previous]
			if (old) {
				old.colored = false
				if (old.phase === 'enter' || old.phase === 'loop') {
					old.phase = 'exit'
					old.frame = 8
				}
			}
		}
		if (!id) return
		const state = icons[id]
		if (!state) return
		state.colored = true
		// An icon mid-white-bow keeps its bow: a re-queue during the beat
		// only books the colour, and the ticker re-enters it once the white
		// has finished (cutting the bow short read as the white going
		// missing)
		if (
			state.phase !== 'enter' &&
			state.phase !== 'loop' &&
			state.phase !== 'beat'
		) {
			state.phase = 'enter'
			state.frame = 0
			state.wait = 0
			state.transform = iconTransform(id)
			state.sheet = iconSheet(id)
		}
	}
)

// A repeat tap turned, flipped or re-drew the pattern's face: a standing
// icon bows out in its old orientation (and old drawing) first, and the
// ticker re-enters it with the new one (the pad is still queued or
// dancing, so the relight above catches it)
watch(
	() => props.padCycle,
	() => {
		for (const [id, state] of Object.entries(icons)) {
			if (state.phase !== 'enter' && state.phase !== 'loop') continue
			if (
				iconTransform(id) === state.transform &&
				iconSheet(id) === state.sheet
			)
				continue
			state.phase = 'exit'
			state.frame = 8
		}
	}
)

// The pattern moved on (another pad's activation, or the drift dealt a
// new hand): the dethroned pad's light goes out and its icon takes its
// leave, while the newly dancing pad's icon comes up lit — the drift's
// own deals light their pads this way, no tap required
watch(
	() => props.activePad,
	(next, previous) => {
		if (previous && previous !== props.queuedPad) {
			const old = icons[previous]
			if (old) {
				old.colored = false
				if (old.phase === 'enter' || old.phase === 'loop') {
					old.phase = 'exit'
					old.frame = 8
				}
			}
		}

		const state = icons[next ?? '']
		if (
			next &&
			state &&
			state.phase !== 'enter' &&
			state.phase !== 'loop' &&
			state.phase !== 'beat'
		) {
			state.phase = 'enter'
			state.frame = 0
			state.wait = 0
			state.colored = true
			state.transform = iconTransform(next)
			state.sheet = iconSheet(next)
		}
	}
)

// The icon's standing transform: its base turn, plus wherever the pad's
// tap cycle has taken it (only while that cycle is the one queued/dancing)
function iconTransform(id: string): string {
	const config = PAD_ICONS[id]
	if (!config) return ''
	const cycle = props.padCycle?.id === id ? props.padCycle : null
	let turn = config.rotate
	let flip = ''
	if (cycle) {
		turn += cycle.index * (config.step ?? 0)
		if (cycle.inverted) {
			if (config.invert === 'rotate') turn += 180
			// Rightmost transform applies first: the flip works in the
			// icon's own drawn space, before the base rotation
			if (config.invert === 'mirror') flip = ' scaleX(-1)'
			if (config.invert === 'flip') flip = ' scaleY(-1)'
		}
	}
	return `rotate(${turn % 360}deg)${flip}`
}

// The sheet the icon plays: its master, or — while the cycle stands
// inverted — its drawn dual (invertAsset). Frozen into the state as the
// icon (re)enters, like the transform, so a swap never lands mid-drawing.
function iconSheet(id: string): string {
	const config = PAD_ICONS[id]!
	const cycle = props.padCycle?.id === id ? props.padCycle : null
	const asset =
		cycle?.inverted && config.invertAsset ? config.invertAsset : config.asset
	return `url('/animondo/pad-icons/${asset}.webp')`
}

// The sheet lays its 12 frames left to right; with the mask sized 1200%,
// position f/11 of the way across shows frame f exactly
function framePosition(frame: number): string {
	return `${(frame / (ICON_FRAMES - 1)) * 100}% 0%`
}

function iconPosition(id: string): string | null {
	const state = icons[id]
	if (!state || state.phase === 'none' || state.wait > 0) return null
	return framePosition(state.frame)
}

// Colour families, lifted from the colour title's own palette (sampled
// across every frame of videos/animondo_title.mov). Pads that share a
// drawing share a family; the rotation and scatter families each fold into
// one too, so eight colours cover fourteen pads. The per-colour ink and
// fill frames come from scripts/build-bubble-frames.sh — keep the hexes in
// step with it.
const FAMILY_INK: Record<string, string> = {
	blue: '#2060e0',
	sky: '#40a0ff',
	mint: '#60ffa0',
	green: '#40c020',
	forest: '#008020',
	pink: '#e060a0',
	tangerine: '#ff8040',
	yellow: '#e0e040',
}

const PAD_FAMILY: Record<string, string> = {
	clockwise: 'pink',
	smallClockwise: 'pink',
	scatter: 'tangerine',
	axisScatter: 'tangerine',
	appearVanish: 'mint',
	upDown: 'sky',
	leftRight: 'sky',
	shuffle: 'yellow',
	hilbert: 'forest',
	zigzag: 'green',
	up: 'blue',
	right: 'blue',
	down: 'blue',
	left: 'blue',
}

function familyOf(id: string): string {
	return PAD_FAMILY[id] ?? 'tangerine'
}

// The plies' drawings arrive inline (border-image-source): one CSS block
// serves every colourway
function plySource(base: string, frame: number): string {
	return `url('/animondo/bubble/${base}_${frame}.webp')`
}

/** Black at rest and on hover; the family's colour while queued or
 * dancing; white through the beat */
function iconColor(id: string): string {
	const state = icons[id]
	if (state?.phase === 'beat') return 'white'
	if (state?.colored) return FAMILY_INK[familyOf(id)]!
	return 'black'
}
</script>

<style lang="stylus">
$pad-orange = #ff6a00

.pattern-launchpad
	position fixed
	inset 0
	// Above the bubble, below the button row — the ☓ stays reachable
	z-index 90
	// The frames and fills sink into the stage: darken lets the white page
	// pass through and the dancers' ink win — the drawing reads as standing
	// behind the characters. (The stage has no alpha to composite against;
	// darken, unlike multiply, keeps the family colours from muddying where
	// they cross the ink.)
	mix-blend-mode darken

	// Touch screens skip the blend: on iOS, darken over the WebGL stage
	// forces a full-viewport offscreen composite every frame — the main
	// suspect for pads-mode's cost there. The frames ride above the ink
	// instead; with the resting grid already paled to grey, the
	// difference stays subtle.
	@media (hover: none)
		mix-blend-mode normal
	display grid
	grid-template-columns repeat(3, 1fr)
	grid-template-rows repeat(5, 1fr)
	// A small gutter keeps neighbouring frames from touching
	gap 2px
	padding 2px

	// Closed pads mode: the grid stands by invisibly and takes no pointer;
	// only a keyboard-queued pad surfaces, leaving with its flash
	&--closed
		pointer-events none

		.pattern-launchpad__pad,
		.pattern-launchpad__escape
			visibility hidden

		// Strip EVERY animation while closed, the pads' own included.
		// Three birds: (1) the plies' boil steps VISIBILITY, and an
		// animated `visible` outranks the normal `hidden` above — on iOS
		// WebKit it even beats !important — so only stopping the boil
		// truly hides the grid (it haunted the title screen and flickered
		// after leaving pads mode); (2) ~170 standing animations stop
		// burning while the grid is invisible; (3) leaving --closed
		// re-arms animation-name on standing DOM, which restarts the
		// corner wave and the intro faces natively — the open-time
		// remount (and its iOS jank) is gone. The ghost pad keeps its
		// boil.
		.pattern-launchpad__pad:not(.pattern-launchpad__pad--ghost),
		.pattern-launchpad__pad:not(.pattern-launchpad__pad--ghost) *
			animation none !important

		// The ghost pops in whole: pad-enter would replay its corner-
		// anchored scale on surfacing, so the pad's own animation is
		// stripped (the plies inside keep boiling). Its only motion is
		// the beat pulse, centre-origin on __inner.
		.pattern-launchpad__pad--ghost
			animation none

		.pattern-launchpad__pad--ghost
			visibility visible

	// The icon layer: same grid, above the stage, compositing normally so
	// the icons stay in front of the dancers while the frames sink behind.
	// Hits fall through to the back grid's buttons.
	&--fore
		z-index 91
		mix-blend-mode normal
		pointer-events none

	// Where hover exists the resting frames stay off the stage — only the
	// hovered pad and the dancing (or flashing) one show their edges. A
	// frame going quiet fades in three drawn steps rather than blinking out.
	.pattern-launchpad__pad--quiet .pattern-launchpad__frame
		animation pad-frame-fade 0.25s steps(3) forwards

	// Leaving pads mode: the hidden frames first step back IN — the fade
	// above run backwards — before the corner wave carries the pads out.
	// The grid is already off-duty, so it takes no pointer.
	&--waking
		pointer-events none

	&--waking .pattern-launchpad__pad--quiet .pattern-launchpad__frame
		animation pad-frame-wake 0.25s steps(3) forwards

	// The wave has landed: the standing grid carries no animation (see
	// waveSettled) — Safari's latched steps() entrances heal here too
	&--settled .pattern-launchpad__pad
		animation none

	// Touch screens keep every resting frame on stage (no hover to tuck
	// them away) — pale the black ink to grey so the standing grid reads
	// as scenery behind the dancers. A lit pad's colour set still shows
	// at full strength (its rule outranks this one).
	// (Tried and reverted: pausing the resting boils via
	// animation-play-state made iOS WORSE — paused animations stay in
	// WebKit's animation machinery, they only stop advancing.)
	@media (hover: none)
		&__frame-set--black
			opacity 0.1

	&__pad
		position relative
		padding 0
		background none
		border none
		cursor pointer
		touch-action manipulation
		-webkit-tap-highlight-color transparent
		user-select none
		-webkit-user-select none
		// The opening wave: each pad grows out of the screen's bottom-left
		// corner, band by band (the inline animation-delay from delayOf),
		// stepped at 24 fps — twice the drawn clock, since pure motion reads
		// too choppy at 12
		transform-origin left bottom
		animation pad-enter 0.25s steps(6) both

	&__inner
		position absolute
		inset 0

	// The frame's ink alone (the drawing with its white paper stripped at
	// build time), boiling on the drawn clock. Always on screen, and —
	// being pure ink over transparency — it can ride above the sheets
	// without its band of paper covering their colour. Both colourways
	// stand painted as four plies each (black, and the pad's family
	// colour); the --lit state only flips which set shows, so no
	// border-image ever swaps mid-boil.
	&__frame
		position absolute
		inset 0
		pointer-events none

	&__frame-set
		position absolute
		inset 0

		&--color
			opacity 0

	&__frame--lit &__frame-set--black
		opacity 0

	&__frame--lit &__frame-set--color
		opacity 1

	// One boil layer: a full border-image drawing standing still, opaque for
	// its quarter of the cycle (pad-ply-turn, phased apart by negative
	// delays on the --N index classes). The drawing itself arrives inline
	// (border-image-source, see plySource) so one block serves every
	// colourway; stretch edges keep the ink's and the fill's tile seams
	// from splitting into white slits. 24px band = 1.5x the drawn
	// contract's 1/8 scale, matching the profile bubble's thickened line.
	&__ply
		position absolute
		inset 0
		border 24px solid transparent
		border-image-slice 128
		border-image-repeat stretch
		animation pad-ply-turn 0.3333s steps(1) infinite
		animation-delay -0.3333s
		pointer-events none

		// The sheets' silhouettes paint their middle too
		&--filled
			border-image-slice 128 fill

		&--1
			animation-delay -0.25s

		&--2
			animation-delay -0.1667s

		&--3
			animation-delay -0.0833s

	// A state layer over the frame: paper/fill behind a centred label
	&__face
		position absolute
		inset 0
		display flex
		align-items center
		justify-content center
		pointer-events none

		// The reveal holds a moment past the wave, then steps away — leaving
		// the bare frames, which only speak again when tapped. The delay
		// (the pad's band + 0.5s) comes inline, for the same WebKit reason
		// as the pads' own.
		&--intro
			animation pad-intro-fade 0.3s steps(3) forwards

		// One clean blink: full-on through the beat itself, then a light
		// smooth fade — steps here read as several flashes
		&--flash
			animation pad-flash-fade 0.4s ease-out forwards

	// A coloured sheet in the pad's own outline: the frame drawing's alpha
	// re-painted as a solid-colour silhouette at build time (fill-*_N.webp,
	// scripts/build-bubble-frames.sh) and 9-sliced by border-image exactly
	// like the visible frame — the glow's edge IS the drawn edge, in every
	// browser. The drawing itself stands as four __ply layers; the sheet
	// only carries the crayon veil (fade-mask, at half the 2x master's size
	// — see FADE_MASK_TILE in pages/index.vue), which grains the plies as a
	// whole, its offset re-rolling on the drawn-frame clock.
	&__sheet
		position absolute
		inset 0
		mask url('/animondo/fade-mask.webp') left top / 568.25px 363.75px repeat
		animation pad-veil-boil 0.6667s steps(1) infinite


	&__label
		position relative
		font-size 2rem
		line-height 1
		color $pad-orange
		pointer-events none

		// Knocked out of the orange: the paper's white shows through the
		// letters. (True mask cuts can come with the drawn icons.)
		&--knockout
			color white

	// The animated icon rig sits over everything and turns as one, so a
	// rotated reuse (the arrows, the horizontal lanes) turns echo and all
	&__icons
		position absolute
		inset 0
		pointer-events none

	// One frame of the 12-frame sheet at a time, shown through an alpha
	// mask: the masters' white-on-black luma is folded into the alpha
	// channel at build time (scripts/build-pad-icons.sh — `mask-mode:
	// luminance` never shipped in Safari, which painted the whole square).
	// The mask is sized so a single frame fills the box and mask-position
	// (inline, from the ticker) steps through — one decoded image, nothing
	// to flicker. The same sheet paints the resting black, the queued
	// colour and the beat's white.
	&__icon
		position absolute
		inset 0
		margin auto
		height 56%
		aspect-ratio 1
		mask-size 1200% 100%
		mask-repeat no-repeat
		// The colour itself arrives inline (iconColor): the family's ink at
		// rest, orange queued, white on the beat

// transform, NOT the standalone `scale` property: WebKit has frozen the
// standalone properties mid-flight under steps() (pads stuck half-sized on
// iOS), and the beat pulse lives on __inner anyway, so nothing here needs
// to compose with it
@keyframes pad-enter
	from
		transform scale(0)
	to
		transform scale(1)

@keyframes pad-exit
	from
		transform scale(1)
	to
		transform scale(0)

@keyframes pad-frame-fade
	from
		opacity 1
	to
		opacity 0

@keyframes pad-frame-wake
	from
		opacity 0
	to
		opacity 1

// Ends hidden, not just transparent: the faded face keeps standing with
// its crayon-veil mask animating, and visibility takes it (and that
// standing mask work) out of the paint tree for good
@keyframes pad-intro-fade
	from
		opacity 1
	to
		opacity 0
		visibility hidden

// Solid over the beat (the first two drawn frames), then the gentle tail
@keyframes pad-flash-fade
	0%
		opacity 1
	40%
		opacity 1
	100%
		opacity 0

// The ply's quarter-turn: shown through its own drawn frame, gone for the
// other three — each ply starts phase-shifted a frame apart, so the
// sheets and inks boil together without a single image swap. VISIBILITY,
// not opacity: Safari stops painting border-image on an element whose own
// opacity is keyframe-animated (the layer composites empty) — visibility
// steps the same way and keeps the drawing.
@keyframes pad-ply-turn
	0%
		visibility visible
	25%
		visibility hidden
	100%
		visibility hidden

// Eight pre-rolled offsets for the veil's grain, cycled at 12 fps over
// steps — the CSS analogue of the shader's re-rolled mask offset
@keyframes pad-veil-boil
	0%
		mask-position 0px 0px
	12.5%
		mask-position -871px -177px
	25%
		mask-position -436px -555px
	37.5%
		mask-position -1013px -346px
	50%
		mask-position -239px -122px
	62.5%
		mask-position -632px -669px
	75%
		mask-position -79px -438px
	87.5%
		mask-position -968px -607px

// Closing: the same wave runs again, collapsing each pad — as it stands,
// bare frame and all, no labels resurfacing — back into the corner
// Pads mode switched off: the corner wave runs back out before the grid
// goes dark (see the `closing` window in the component)
.pattern-launchpad--leaving
	.pattern-launchpad__pad
		// The inline animation-delay (the same bands) still applies: inline
		// longhands outrank this shorthand's delay reset
		animation pad-exit 0.25s steps(6) both
</style>
