<template>
	<main>
		<button
			v-if="!audio.hasStarted.value"
			class="start-button"
			@click="audio.start"
		>
			{{ t('tap.title') }}<br />
			<div class="small">
				{{ t('tap.subtitle.line1') }}<br />
				{{ t('tap.subtitle.line2') }}
			</div>
		</button>
		<button
			class="about-button"
			:aria-label="t('about.button.label')"
			:title="t('about.button.label')"
			@click="aboutOpen = true"
		>
			?
		</button>
		<AboutModal :open="aboutOpen" @close="aboutOpen = false" />
		<canvas ref="canvas" class="canvas" />
		<Transition name="bubble">
			<div v-if="selectedArtist" class="profile-bubble" :style="bubbleStyle">
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
import {useIntervalFn} from '@vueuse/core'
import type Regl from 'regl'

import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {useKawachiAudio} from '~/composables/useKawachiAudio'
import {useRegl} from '~/composables/useRegl'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import {useZUI} from '~/composables/useZUI'
import {ARTISTS} from '~/utils/artists'
import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
import {Direction} from '~/utils/tile'
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

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// Initialize ZUI for navigation
const zui = useZUI(canvas)

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

const bubbleStyle = computed(() => {
	const offset = Math.min(
		Math.max(zui.pixelsPerCell.value * 0.55 + 12, 60),
		window.innerHeight * 0.35
	)
	// The bubble sits above the anchor, so the prose can only use what is
	// left between the anchor and the top of the screen. Reserve room for the
	// name, the padding and a little breathing space; scroll past that.
	const CHROME = 96
	const available = window.innerHeight * 0.5 - offset - CHROME

	return {
		bottom: `calc(50% + ${offset}px)`,
		'--profile-max-height': `${Math.max(available, 120)}px`,
	}
})

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
	zui.followTarget.value = [sel.cell[0] + 0.5, sel.cell[1] + 0.5]
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

			while (true) {
				yield Patterns.clockwise
				yield Patterns.clockwise
				yield Patterns.counterClockwise

				yield Patterns.upDown
				yield Patterns.downUp
				yield Patterns.leftRight
				yield Patterns.rightLeft

				yield Patterns.up
				yield Patterns.right
				yield Patterns.down
				yield Patterns.left
				yield Patterns.down
				yield Patterns.right
				yield Patterns.up

				yield Patterns.clockwise
				yield Patterns.clockwise
			}
		})

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

.start-button
	border none
	color black
	font-size 2rem
	cursor pointer
	border 2px solid black
	border-radius 1rem
	padding 1rem
	z-index 10
	background white
	line-height 1.5

	.small
		margin-top 0.5em
		font-size 0.5em
		color gray

	&:hover
		background black
		color white

		.small
			color white

.about-button
	position fixed
	top 1rem
	right 1rem
	width 2.5rem
	height 2.5rem
	display flex
	align-items center
	justify-content center
	padding 0
	border 2px solid black
	border-radius 50%
	background white
	color black
	font-size 1.25rem
	font-weight bold
	line-height 1
	cursor pointer
	z-index 20

	&:hover
		background black
		color white


.canvas
	position fixed
	width 100vw
	height 100svh
	cursor grab
	touch-action none
	user-select none
	-webkit-user-select none
	-moz-user-select none
	-ms-user-select none

.profile-bubble
	position fixed
	left 50%
	transform translateX(-50%)
	z-index 15
	max-width min(20rem, 85vw)
	padding 0.75rem 1.5rem
	border 2px solid black
	border-radius 1rem
	background white
	text-align center
	line-height 1.5

	// Tail pointing down toward the followed character
	&::after
		content ''
		position absolute
		bottom -8px
		left 50%
		width 14px
		height 14px
		background white
		border-right 2px solid black
		border-bottom 2px solid black
		transform translateX(-50%) rotate(45deg)

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
		font-size 1.25rem
		cursor pointer

		&:hover
			text-decoration underline

	&__text
		margin-top 0.25rem
		font-size 0.85rem
		color gray
		text-align left
		// Press-kit bios run long. Cap the prose rather than the bubble, so
		// the name, the close button and the ::after tail all stay put.
		max-height var(--profile-max-height, 20rem)
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

.bubble-enter-active, .bubble-leave-active
	transition opacity 0.25s ease, translate 0.25s ease

.bubble-enter-from, .bubble-leave-to
	opacity 0
	translate 0 0.5rem
</style>
