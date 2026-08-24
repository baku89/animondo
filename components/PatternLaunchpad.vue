<template>
	<div ref="root" class="pattern-launchpad">
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
				:data-pad="cell.id"
				:style="{animationDelay: `${delayOf(i)}s`}"
				:aria-label="cell.id"
				@pointerdown="$emit('tap', cell.id)"
			>
				<!-- The inner wrapper is what the beat pulses (centre origin);
					the button itself carries the corner-wave scale (bottom-left
					origin) — the two must not share a transform-origin -->
				<span class="pattern-launchpad__inner">
					<!-- The opening reveal: crayon-veil paper and label show,
						then step away, leaving the bare frames. Runs once on
						mount and no class ever toggles it, so it cannot
						replay. -->
					<span
						class="pattern-launchpad__face pattern-launchpad__face--intro"
						:style="{animationDelay: `${delayOf(i) + 0.5}s`}"
					>
						<span
							class="pattern-launchpad__sheet pattern-launchpad__sheet--paper"
						/>
						<span class="pattern-launchpad__label">{{ cell.label }}</span>
					</span>
					<!-- The beat lands: a grained orange fill, label knocked
						out, gone again in a few steps. Remounted by :key so a
						repeat on the same pad always re-fires. -->
					<span
						v-if="cell.id === activePad"
						:key="`flash-${activationSeq}`"
						class="pattern-launchpad__face pattern-launchpad__face--flash"
					>
						<span
							class="pattern-launchpad__sheet pattern-launchpad__sheet--orange"
						/>
						<span
							class="pattern-launchpad__label pattern-launchpad__label--knockout"
						>{{ cell.label }}</span>
					</span>
					<!-- The drawn frame never leaves the screen; its ink rides
						above the sheets, as on the real bubble. One element
						whose colour follows the state — waiting and flashing
						turn it orange — so no second frame ever stacks on it. -->
					<span
						class="pattern-launchpad__frame"
						:class="{
							'pattern-launchpad__frame--orange':
								cell.id === queuedPad || cell.id === flashingPad,
						}"
					/>
					<!-- The tapped pad's label, until the beat -->
					<span
						v-if="cell.id === queuedPad"
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
</template>

<script setup lang="ts">
import {PADS} from '~/composables/usePatternControl'

const props = defineProps<{
	queuedPad: string | null
	activePad: string | null
	activationSeq: number
	beatSeq: number
}>()

defineEmits<{(e: 'tap', id: string): void; (e: 'close'): void}>()

const root = useTemplateRef<HTMLElement>('root')

// Every image the boils step through, decoded up front and pinned for the
// component's lifetime. The bytes are already local (preloadAssets), but an
// animation stepping onto a not-yet-DECODED image blanks for a frame — the
// flicker on entrance.
const BOIL_URLS = [
	'frame-ink',
	'ink-orange',
	'fill-white',
	'fill-orange',
].flatMap(name =>
	[0, 1, 2, 3].map(i => `/animondo/bubble/${name}_${i}.webp`)
)
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

watch(
	() => props.activationSeq,
	() => {
		flashingPad.value = props.activePad
		clearTimeout(flashTimer)
		flashTimer = setTimeout(() => (flashingPad.value = null), FLASH_MS)
	}
)

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

function pad(id: string) {
	const found = PADS.find(p => p.id === id)
	if (!found) throw new Error(`Unknown pad: ${id}`)
	return {id, label: LABELS[id] ?? id}
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

// Every beat, the QUEUED pad alone pulses: a scale pop about its own
// centre, stepped back over 24 fps frames (twice the drawn clock — pure
// motion reads too choppy at 12). Driven through the Web Animations API so
// it composes with (instead of fighting) the CSS `scale` of the open/close
// wave.
watch(
	() => props.beatSeq,
	() => {
		if (!root.value || !props.queuedPad) return
		const inner = root.value.querySelector(
			`.pattern-launchpad__pad[data-pad="${props.queuedPad}"] .pattern-launchpad__inner`
		)
		inner?.animate(
			[
				{transform: 'scale(1.06)'},
				{transform: 'scale(1.045)'},
				{transform: 'scale(1.03)'},
				{transform: 'scale(1.015)'},
				{transform: 'scale(1)'},
			],
			{duration: (1000 / 24) * 4, easing: 'step-end'}
		)
	}
)
</script>

<style lang="stylus">
$pad-orange = #ff6a00

.pattern-launchpad
	position fixed
	inset 0
	// Above the bubble, below the button row — the ☓ stays reachable
	z-index 90
	display grid
	grid-template-columns repeat(3, 1fr)
	grid-template-rows repeat(5, 1fr)
	// A small gutter keeps neighbouring frames from touching
	gap 2px
	padding 2px

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

	// The frame's ink alone (frame-ink_N: the drawing with its white paper
	// stripped at build time), boiling on the drawn clock. Always on screen,
	// and — being pure ink over transparency — it can ride above the sheets
	// without its band of paper covering their colour.
	&__frame
		position absolute
		inset 0
		// 24px band = 1.5x the drawn contract's 1/8 scale, matching the
		// profile bubble's thickened line
		border 24px solid transparent
		border-image url('/animondo/bubble/frame-ink_0.webp') 128 round
		animation pad-ink-boil 0.3333s steps(1) infinite
		pointer-events none

		// The waiting pad's ink, in orange — the same strokes repainted at
		// build time, laid exactly over the black
		&--orange
			border-image-source url('/animondo/bubble/ink-orange_0.webp')
			animation pad-ink-orange-boil 0.3333s steps(1) infinite

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
	// browser. The crayon veil (fade-mask, at half the 2x master's size —
	// see FADE_MASK_TILE in pages/index.vue) grains the whole sheet, its
	// offset re-rolling on the drawn-frame clock like every other boil.
	&__sheet
		position absolute
		inset 0
		// 24px band = 1.5x the drawn contract's 1/8 scale, matching the
		// profile bubble's thickened line
		border 24px solid transparent
		mask url('/animondo/fade-mask.webp') left top / 568.25px 363.75px repeat

		&--paper
			border-image url('/animondo/bubble/fill-white_0.webp') 128 fill round
			animation pad-paper-boil 0.3333s steps(1) infinite, pad-veil-boil 0.6667s steps(1) infinite

		&--orange
			border-image url('/animondo/bubble/fill-orange_0.webp') 128 fill round
			animation pad-orange-boil 0.3333s steps(1) infinite, pad-veil-boil 0.6667s steps(1) infinite


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

@keyframes pad-intro-fade
	from
		opacity 1
	to
		opacity 0

// Solid over the beat (the first two drawn frames), then the gentle tail
@keyframes pad-flash-fade
	0%
		opacity 1
	40%
		opacity 1
	100%
		opacity 0

@keyframes pad-ink-boil
	0%
		border-image-source url('/animondo/bubble/frame-ink_0.webp')
	25%
		border-image-source url('/animondo/bubble/frame-ink_1.webp')
	50%
		border-image-source url('/animondo/bubble/frame-ink_2.webp')
	75%
		border-image-source url('/animondo/bubble/frame-ink_3.webp')

@keyframes pad-ink-orange-boil
	0%
		border-image-source url('/animondo/bubble/ink-orange_0.webp')
	25%
		border-image-source url('/animondo/bubble/ink-orange_1.webp')
	50%
		border-image-source url('/animondo/bubble/ink-orange_2.webp')
	75%
		border-image-source url('/animondo/bubble/ink-orange_3.webp')

// The sheets boil with the frames, so the glow's wobbly outline and the
// ink wobble together
@keyframes pad-paper-boil
	0%
		border-image-source url('/animondo/bubble/fill-white_0.webp')
	25%
		border-image-source url('/animondo/bubble/fill-white_1.webp')
	50%
		border-image-source url('/animondo/bubble/fill-white_2.webp')
	75%
		border-image-source url('/animondo/bubble/fill-white_3.webp')

@keyframes pad-orange-boil
	0%
		border-image-source url('/animondo/bubble/fill-orange_0.webp')
	25%
		border-image-source url('/animondo/bubble/fill-orange_1.webp')
	50%
		border-image-source url('/animondo/bubble/fill-orange_2.webp')
	75%
		border-image-source url('/animondo/bubble/fill-orange_3.webp')

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
.launchpad-leave-active
	.pattern-launchpad__pad
		// The inline animation-delay (the same bands) still applies: inline
		// longhands outrank this shorthand's delay reset
		animation pad-exit 0.25s steps(6) both
</style>
