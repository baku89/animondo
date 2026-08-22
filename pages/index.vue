<template>
	<main>
		<TitleSequence
			v-if="titleVisible"
			:ready="assetsReady"
			@start="audio.start"
			@done="onTitleDone"
		/>
		<CircleIcon
			v-if="aboutVisible"
			class="about-button"
			:glyph="ABOUT_SHEET"
			size="clamp(3rem, 10vw, 6rem)"
			:state="aboutOpen ? 'close' : 'about'"
			:label="aboutOpen ? t('about.close') : t('about.button.label')"
			@click="aboutOpen = !aboutOpen"
		/>
		<AboutModal :open="aboutOpen" @close="aboutOpen = false" />
		<canvas ref="canvas" class="canvas" />
		<Transition :css="false" @enter="onBubbleEnter" @leave="onBubbleLeave">
			<div
				v-if="selectedArtist"
				class="profile-bubble"
				:class="`profile-bubble--${bubbleSide}`"
				:style="bubbleStyle"
			>
				<button
					class="profile-bubble__close"
					:aria-label="t('about.close')"
					@click="deselect"
				>
					×
				</button>
				<a
					class="profile-bubble__name"
					:href="selectedArtist.url[locale]"
					target="_blank"
					rel="noopener"
				>
					{{ selectedArtist.name[locale] }}
				</a>
				<!-- Markdown rendered from content/artists/, authored in this
					repo — no third-party input reaches this sink. -->
				<!-- eslint-disable vue/no-v-html -->
				<div
					class="profile-bubble__text"
					v-html="selectedArtist.profileHtml[locale]"
				/>
				<!-- eslint-enable vue/no-v-html -->
			</div>
		</Transition>
	</main>
</template>

<script setup lang="ts">
import {useIntervalFn, useTimeoutFn, useWindowSize} from '@vueuse/core'
import type Regl from 'regl'

import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {useKawachiAudio} from '~/composables/useKawachiAudio'
import {usePatternControl} from '~/composables/usePatternControl'
import {useRegl} from '~/composables/useRegl'
import {ABOUT_SHEET} from '~/composables/useSpritePlayer'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import {useZUI} from '~/composables/useZUI'
import {ARTISTS} from '~/utils/artists'
import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
import {Direction, moveToTileDisplay} from '~/utils/tile'
import {tileCenter} from '~/utils/tileCenters'
import {TileMap} from '~/utils/TileMap'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	resolution: Regl.Vec2
	video0: Regl.Texture2D
	video1: Regl.Texture2D
	video2: Regl.Texture2D
	video3: Regl.Texture2D
	video4: Regl.Texture2D
	video5: Regl.Texture2D
	video6: Regl.Texture2D
	video7: Regl.Texture2D
	tileMap: Regl.Texture2D
	tileMapSize: Regl.Vec2
	navMatrix: Regl.Mat3
}

const audio = useKawachiAudio()
const {t, locale} = useI18n()

const aboutOpen = ref(false)

// The title writes itself in on load and wipes itself away once the visitor
// starts the piece, at which point it is dropped for good.
const titleVisible = ref(true)
const assetsReady = ref(false)

// Nothing but the dance for the first moments — the ? arrives once the title
// is gone and the eye has had a beat to settle on the animation.
const aboutVisible = ref(false)
const {start: revealAbout} = useTimeoutFn(
	() => (aboutVisible.value = true),
	1200,
	{immediate: false}
)

function onTitleDone() {
	titleVisible.value = false
	revealAbout()
}

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// Initialize ZUI for navigation
const zui = useZUI(canvas)

// Keyboard steering. The centre of the screen is resolved on demand rather
// than captured, so a pattern built around the middle of the grid keeps
// landing where the visitor is looking even after they pan.
const patternControl = usePatternControl(() =>
	zui.screenToWorld(window.innerWidth / 2, window.innerHeight / 2)
)

let currentFrame = 0

// --- Character selection & follow ---

// Cell coordinates are kept unwrapped so the camera pans continuously
// across the toroidal seam; wrap only when looking up the pattern/tiles.
const selection = ref<{cell: [number, number]; artistIndex: number} | null>(
	null
)

const selectedArtist = computed(() =>
	selection.value ? ARTISTS[selection.value.artistIndex] : null
)

// --- Bubble placement ---

// Margins that keep the bubble off the screen edges and off the fixed UI
// (the ? button row along the top).
const BUBBLE_MARGIN = 16
const BUBBLE_TOP_CLEARANCE = 84
const BUBBLE_BOTTOM_CLEARANCE = 24
/** Air between the character's footprint and the bubble, tail included */
const BUBBLE_GAP = 12
const BUBBLE_MAX_WIDTH = 480
/** Below this, a side-by-side layout is not worth the squeeze */
const BUBBLE_MIN_WIDTH = 288

/** Where the bubble sits relative to the followed character */
type BubbleSide = 'top' | 'bottom' | 'left' | 'right'
const bubbleSide = ref<BubbleSide>('top')

// The hand-drawn frame's boil frames are only requested by CSS once the
// first bubble opens; preload them so it doesn't flicker in piecemeal.
useHead({
	link: [0, 1, 2].flatMap(i => [
		{rel: 'preload', as: 'image' as const, href: `/animondo/bubble/frame_${i}.webp`},
		{rel: 'preload', as: 'image' as const, href: `/animondo/bubble/tail_${i}.webp`},
	]),
})

const {width: winWidth, height: winHeight} = useWindowSize()

// Half of the on-screen footprint reserved for the character, zoom-aware
const charHalf = computed(() =>
	Math.min(
		Math.max(zui.pixelsPerCell.value * 0.55 + 12, 60),
		Math.min(winWidth.value, winHeight.value) * 0.25
	)
)

// The screen point the camera steers the character to. Rather than pinning
// the character to the centre, it is pushed toward the edge opposite the
// bubble, so the bubble can take the rest of the screen.
const characterAnchor = computed<[number, number]>(() => {
	const vw = winWidth.value
	const vh = winHeight.value
	const half = charHalf.value

	switch (bubbleSide.value) {
		case 'right':
			return [BUBBLE_MARGIN + half, vh / 2]
		case 'left':
			return [vw - BUBBLE_MARGIN - half, vh / 2]
		case 'bottom':
			return [vw / 2, BUBBLE_TOP_CLEARANCE + half]
		default: // 'top'
			return [vw / 2, vh - BUBBLE_BOTTOM_CLEARANCE - half]
	}
})

watchEffect(() => {
	zui.followAnchor.value = selection.value ? characterAnchor.value : null
})

const bubbleStyle = computed(() => {
	const vw = winWidth.value
	const vh = winHeight.value
	const half = charHalf.value
	const [ax, ay] = characterAnchor.value

	// The bubble grows from the edge facing the character (fit-content),
	// capped so it never runs past the margins on the far side.
	switch (bubbleSide.value) {
		case 'right': {
			const edge = ax + half + BUBBLE_GAP
			return {
				left: `${edge}px`,
				top: `${ay}px`,
				translate: '0 -50%',
				width: `${Math.min(vw - BUBBLE_MARGIN - edge, BUBBLE_MAX_WIDTH)}px`,
				maxHeight: `${vh - 2 * BUBBLE_TOP_CLEARANCE}px`,
			}
		}
		case 'left': {
			const edge = ax - half - BUBBLE_GAP
			return {
				right: `${vw - edge}px`,
				top: `${ay}px`,
				translate: '0 -50%',
				width: `${Math.min(edge - BUBBLE_MARGIN, BUBBLE_MAX_WIDTH)}px`,
				maxHeight: `${vh - 2 * BUBBLE_TOP_CLEARANCE}px`,
			}
		}
		case 'bottom': {
			const edge = ay + half + BUBBLE_GAP
			return {
				top: `${edge}px`,
				left: `${ax}px`,
				translate: '-50% 0',
				width: `${Math.min(vw - 2 * BUBBLE_MARGIN, BUBBLE_MAX_WIDTH)}px`,
				maxHeight: `${vh - BUBBLE_BOTTOM_CLEARANCE - edge}px`,
			}
		}
		default: {
			// 'top'
			const edge = ay - half - BUBBLE_GAP
			return {
				bottom: `${vh - edge}px`,
				left: `${ax}px`,
				translate: '-50% 0',
				width: `${Math.min(vw - 2 * BUBBLE_MARGIN, BUBBLE_MAX_WIDTH)}px`,
				maxHeight: `${edge - BUBBLE_TOP_CLEARANCE}px`,
			}
		}
	}
})

// The panel covers the stage, so a bubble left open sits behind it
watch(aboutOpen, open => {
	if (open) deselect()
})

// --- Bubble enter/leave: grow the balloon for real ---

// The frame is a border-image, so animating the box's actual size lays the
// drawn line out afresh at every step — the ink keeps its thickness instead
// of being stretched by a transform. Quantized to 12 fps like the icons.
// The box is anchored on its tail side (bubbleStyle pins that edge), so it
// grows away from the character.
const GROW_FACTORS = [0.25, 0.5, 0.75]

let cancelSizing: (() => void) | null = null

function stepBubbleSize(el: HTMLElement, factors: number[], done: () => void) {
	const prevWidth = el.style.width
	const prevHeight = el.style.height
	const width = el.offsetWidth
	const height = el.offsetHeight

	// Hides the contents (CSS), which would spill out of a half-grown frame
	el.classList.add('profile-bubble--sizing')

	const apply = (f: number) => {
		el.style.width = `${Math.round(width * f)}px`
		el.style.height = `${Math.round(height * f)}px`
	}

	const finish = () => {
		clearInterval(timer)
		el.style.width = prevWidth
		el.style.height = prevHeight
		el.classList.remove('profile-bubble--sizing')
	}

	let i = 0
	apply(factors[0])
	const timer = setInterval(() => {
		i++
		if (i < factors.length) {
			apply(factors[i])
			return
		}
		finish()
		done()
	}, 1000 / 12)

	return finish
}

function onBubbleEnter(el: Element, done: () => void) {
	cancelSizing?.()
	cancelSizing = stepBubbleSize(el as HTMLElement, GROW_FACTORS, done)
}

function onBubbleLeave(el: Element, done: () => void) {
	cancelSizing?.()
	cancelSizing = stepBubbleSize(
		el as HTMLElement,
		[...GROW_FACTORS].reverse(),
		done
	)
}

// Aim at where the dancer actually is, not the middle of its cell. The drawn
// centres move every frame, so this is read on each tick rather than at the
// step boundary.
function updateFollowTarget() {
	const sel = selection.value
	if (!sel || !tileMap) return

	const move = tileMap.currentPattern?.get(sel.cell[0], sel.cell[1])
	if (!move) return

	const info = tileMap.getTileInfo(sel.cell[0], sel.cell[1])
	const display = moveToTileDisplay(move, info.index, info.flipVertical)
	const [ox, oy] = tileCenter(
		display.tile,
		display.rotation,
		info.flipVertical,
		currentFrame % 8
	)

	zui.followTarget.value = [sel.cell[0] + ox, sel.cell[1] + oy]
}

function deselect() {
	selection.value = null
	zui.followTarget.value = null
}

// Panning cancels the follow inside useZUI; drop the bubble too
watch(zui.followTarget, target => {
	if (!target) selection.value = null
})

zui.onTap((clientX, clientY) => {
	if (!tileMap || !audio.hasStarted.value) return

	// Light dismiss: while a bubble is open, the first tap anywhere only
	// closes it — even when it lands on another character. Selecting that
	// character takes a second, deliberate tap.
	if (selection.value) {
		deselect()
		return
	}

	const world = zui.screenToWorld(clientX, clientY)
	const cell: [number, number] = [Math.floor(world[0]), Math.floor(world[1])]

	const move = tileMap.currentPattern?.get(cell[0], cell[1])

	if (!move || (move.in === Direction.None && move.out === Direction.None)) {
		return
	}

	// Pick which side the bubble opens on. A landscape screen with room to
	// spare reads left/right off the tap; otherwise the tapped half of the
	// screen keeps the character and the bubble takes the other half.
	const vw = window.innerWidth
	const vh = window.innerHeight
	const sideSpace = vw - 2 * BUBBLE_MARGIN - 2 * charHalf.value - BUBBLE_GAP
	bubbleSide.value =
		vw > vh && sideSpace >= BUBBLE_MIN_WIDTH
			? clientX < vw / 2
				? 'right'
				: 'left'
			: clientY < vh / 2
				? 'bottom'
				: 'top'

	selection.value = {
		cell,
		artistIndex: tileMap.getTileInfo(cell[0], cell[1]).index,
	}
	zui.followTarget.value = [cell[0] + 0.5, cell[1] + 0.5]
})

const DIRECTION_DELTA: Partial<Record<Direction, [number, number]>> = {
	[Direction.Up]: [0, -1],
	[Direction.Right]: [1, 0],
	[Direction.Down]: [0, 1],
	[Direction.Left]: [-1, 0],
}

// Move the tracked cell along the pattern's out direction. Must be called
// with the pattern that governed the step which is just ending, i.e. right
// BEFORE tileMap.nextStep().
function advanceSelection() {
	const sel = selection.value
	if (!sel || !tileMap) return

	const move = tileMap.currentPattern?.get(sel.cell[0], sel.cell[1])
	const delta = move ? DIRECTION_DELTA[move.out] : undefined

	if (!delta) {
		// The character vanished (or the cell went silent)
		deselect()
		return
	}

	sel.cell = [sel.cell[0] + delta[0], sel.cell[1] + delta[1]]
	updateFollowTarget()
}

// After nextStep(), make sure the tracked cell still hosts the same artist —
// converging patterns (e.g. gather) can overwrite it with another character.
function verifySelection() {
	const sel = selection.value
	if (!sel || !tileMap) return

	if (tileMap.getTileInfo(sel.cell[0], sel.cell[1]).index !== sel.artistIndex) {
		deselect()
	}
}

// Initialize Regl with fullscreen quad
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	async onInit(regl) {
		// Load video textures. Sprite order follows ARTISTS so the index the
		// tile map stores keeps addressing the same artist. Laura and Lucija
		// may rejoin later — adding them to ARTIST_IDS pulls their sprite in
		// too, but the shader still needs matching video8/video9 uniforms.
		videoTextureArray = useVideoTextureArray(
			regl,
			ARTISTS.map(({id}) => `sprites/${id}.mp4`)
		)
		await videoTextureArray.load()

		// Initialize tile map
		tileMap = new TileMap({
			regl,
			...Patterns.size,
			numberOfVideos: ARTISTS.length,
		})

		// パターンジェネレーター関数（常にcを返す）
		tileMap.setMovePattern(function* (): Generator<MovePattern, never, void> {
			yield Patterns.empty
			yield Patterns.empty
			yield Patterns.empty
			// だんだん広がる
			for (let i = 0; i < Patterns.size.width / 2; i++) {
				yield Patterns.radialMask(Patterns.clockwise, i)
			}

			// From here the keyboard has the floor. takePattern() is only
			// read at a step boundary, so presses land on the beat.
			while (true) {
				yield patternControl.takePattern()
			}
		})

		// Only invite the visitor in once the sprites are decoded and the
		// typefaces have settled, so the button never lands over a half-drawn
		// stage. Fonts get a deadline: a Typekit outage should not leave the
		// page with no way to start.
		await Promise.race([
			document.fonts?.ready ?? Promise.resolve(),
			new Promise(resolve => setTimeout(resolve, 5000)),
		])
		assetsReady.value = true

		// Wait for audio to start
		await audio.waitForPlay()

		// Start the timer
		useIntervalFn(() => {
			if (currentFrame % 8 === 0 && currentFrame > 0) {
				advanceSelection()
				tileMap?.nextStep()
				verifySelection()
			}
			currentFrame += 1
			videoTextureArray?.setFrame(currentFrame % 8)
			updateFollowTarget()
		}, 1000 / 8.8)

		return {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video0: regl.prop<Uniforms, 'video0'>('video0'),
			video1: regl.prop<Uniforms, 'video1'>('video1'),
			video2: regl.prop<Uniforms, 'video2'>('video2'),
			video3: regl.prop<Uniforms, 'video3'>('video3'),
			video4: regl.prop<Uniforms, 'video4'>('video4'),
			video5: regl.prop<Uniforms, 'video5'>('video5'),
			video6: regl.prop<Uniforms, 'video6'>('video6'),
			video7: regl.prop<Uniforms, 'video7'>('video7'),
			tileMap: regl.prop<Uniforms, 'tileMap'>('tileMap'),
			tileMapSize: [tileMap.width, tileMap.height],
			navMatrix: regl.prop<Uniforms, 'navMatrix'>('navMatrix'),
		}
	},
	onFrame() {
		const [
			video0,
			video1,
			video2,
			video3,
			video4,
			video5,
			video6,
			video7,
		] = videoTextureArray?.textureArray.value ?? []

		if (
			!video0 ||
			!video1 ||
			!video2 ||
			!video3 ||
			!video4 ||
			!video5 ||
			!video6 ||
			!video7 ||
			!tileMap
		)
			return null

		return {
			video0,
			video1,
			video2,
			video3,
			video4,
			video5,
			video6,
			video7,
			tileMap: tileMap.texture,
			navMatrix: zui.inverseMatrix.value,
		}
	},
})

useSeoMeta({
	title: 'Animondo',
})
</script>

<style lang="stylus">
main
	display flex
	flex-direction column
	align-items center
	justify-content center
	position absolute
	top 0
	left 0
	width 100vw
	height 100svh

.about-button
	position fixed
	top 1rem
	right 1rem
	// Above the about modal, so the same button closes what it opened
	z-index 110


.canvas
	position fixed
	width 100vw
	height 100svh
	cursor grab
	touch-action none

	// Hold the grab while the pointer is down
	&:active
		cursor grabbing
	user-select none
	-webkit-user-select none
	-moz-user-select none
	-ms-user-select none

.profile-bubble
	display flex
	flex-direction column
	position fixed
	z-index 15
	padding 0.5rem 0.75rem
	// Hand-drawn frame: one square drawing carries the four corners, the
	// repeating edges and the white fill (border-image-slice `fill`). The
	// source is 1024px with 128px slices shown at 16px, so a 2x screen still
	// samples it 4:1 — see scripts/build-bubble-samples.py for the contract.
	border 16px solid transparent
	border-image url('/animondo/bubble/frame_0.webp') 128 fill round
	// Boil at 12 fps, same clock as the hand-drawn icons
	animation bubble-boil 0.25s steps(1) infinite
	text-align center
	line-height 1.5

	// Tail: its own drawing (tip pointing down), whose white fill masks the
	// border line running behind it. Rotated per side below.
	&::after
		content ''
		position absolute
		width 36px
		height 36px
		background url('/animondo/bubble/tail_0.webp') center / contain no-repeat
		animation bubble-tail-boil 0.25s steps(1) infinite

	// Bubble above the character — tail below, pointing down. The 34px
	// offset (from the padding box) leaves the tail's root just touching
	// the border line rather than sinking into the balloon.
	&--top
		&::after
			bottom -34px
			left 50%
			translate -50% 0

	&--bottom
		&::after
			top -34px
			left 50%
			translate -50% 0
			rotate 180deg

	// Bubble to the right of the character — tail on the left edge
	&--right
		&::after
			left -34px
			top 50%
			translate 0 -50%
			rotate 90deg

	&--left
		&::after
			right -34px
			top 50%
			translate 0 -50%
			rotate -90deg

	// While the enter/leave steps resize the box, the contents would spill
	// out of the half-grown frame — hide them. The tail is a pseudo element
	// (not matched by >*), so it stays and rides along on the moving edge.
	&--sizing > *
		visibility hidden

	&__close
		position absolute
		top 0.25rem
		right 0.5rem
		padding 0 0.25rem
		font-size 1.25rem
		line-height 1.4
		cursor pointer

		&:hover
			opacity 0.6

	&__name
		display inline-block
		align-self center
		font-size 1.25rem
		cursor pointer

		&:hover
			text-decoration underline

	&__text
		margin-top 0.25rem
		font-size 0.85rem
		color gray
		text-align left
		// The bubble itself is capped (maxHeight from bubbleStyle); the prose
		// is the one flex child allowed to shrink, so long press-kit bios
		// scroll while the name and the close button stay put.
		flex 0 1 auto
		min-height 0
		overflow-y auto
		overscroll-behavior contain

		// Rendered markdown lands here, and the global reset has stripped the
		// browser defaults these tags rely on — restore them locally.
		p + p, ul, ol
			margin-top 0.5em

		ul, ol
			padding-left 1.25em

		li
			list-style disc

		ol > li
			list-style decimal

		strong
			font-weight bold

		a
			text-decoration underline

			&:hover
				opacity 0.6

@keyframes bubble-boil
	0%
		border-image-source url('/animondo/bubble/frame_0.webp')
	33.3%
		border-image-source url('/animondo/bubble/frame_1.webp')
	66.7%
		border-image-source url('/animondo/bubble/frame_2.webp')

@keyframes bubble-tail-boil
	0%
		background-image url('/animondo/bubble/tail_0.webp')
	33.3%
		background-image url('/animondo/bubble/tail_1.webp')
	66.7%
		background-image url('/animondo/bubble/tail_2.webp')

</style>
