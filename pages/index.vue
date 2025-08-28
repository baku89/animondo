<template>
	<main>
		<button v-if="!hasStarted" @click="startAudio">
			Tap To Start<br />
			<div class="small">
				Osaka EXPO EU-Japan Animation Residency<br />
				Collaborative Project
			</div>
		</button>
		<canvas ref="canvas" class="canvas" />
	</main>
</template>

<script setup lang="ts">
import type Regl from 'regl'
import {useRegl} from '~/composables/useRegl'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {Direction, MovePattern, invertMovePattern} from '~/utils/tile'
import {TileMap} from '~/utils/TileMap'
import {useIntervalFn} from '@vueuse/core'
import {scalar, vec2} from 'linearly'
import {useZUI} from '~/composables/useZUI'
import {invertDirection} from '~/utils/tile'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	resolution: Regl.Vec2
	video0: Regl.Texture2D
	video1: Regl.Texture2D
	tileMap: Regl.Texture2D
	tileMapSize: Regl.Vec2
	navMatrix: Regl.Mat3
}

const hasStarted = ref(false)

const audioStarted = Promise.withResolvers<void>()

async function startAudio() {
	// Play background music
	const audio = new Audio('/kawachiondo.mp3')
	audio.loop = true
	audio.volume = 0.7
	try {
		await audio.play()
	} catch (error) {
		console.log(
			'Audio playback failed (probably due to autoplay policy):',
			error
		)
	}

	hasStarted.value = true
	audioStarted.resolve()
}

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// Initialize ZUI for navigation
const zui = useZUI(canvas)

const tileSize = {width: 4, height: 4}

const patternCircle = new MovePattern({
	...tileSize,
	initialize: (ox, oy) => {
		const [x, y] = vec2.sub([ox, oy], [tileSize.width / 2, tileSize.height / 2])

		let isLeftBottom: boolean
		let isRightBottom: boolean

		let out = Direction.None

		isLeftBottom = x < y || (x >= 0 && x === y)
		isRightBottom = x >= -y || (x >= 0 && x + 1 === -y)

		if (isLeftBottom) {
			out = isRightBottom ? Direction.Left : Direction.Up
		} else {
			out = isRightBottom ? Direction.Down : Direction.Right
		}

		isLeftBottom = x < y || (x < 0 && x === y)
		isRightBottom = x >= -y || (x < 0 && x + 1 === -y)

		let _in = Direction.None

		if (isLeftBottom) {
			_in = isRightBottom ? Direction.Right : Direction.Down
		} else {
			_in = isRightBottom ? Direction.Up : Direction.Left
		}

		console.log([ox, oy], [x, y], _in, out)

		if (x === y) {
			;[_in, out] = [invertDirection(out), invertDirection(_in)]
		}

		return {in: _in, out}
	},
})

const patternUpDown = new MovePattern({
	...tileSize,
	initialize: (x, y) => {
		if (x % 2 === 0) {
			return {in: Direction.Down, out: Direction.Up}
		}
		return {in: Direction.Up, out: Direction.Down}
	},
})

const patternLeftRight = new MovePattern({
	...tileSize,
	initialize: (x, y) => {
		if (y % 2 === 0) {
			return {in: Direction.Right, out: Direction.Left}
		}
		return {in: Direction.Left, out: Direction.Right}
	},
})

let isFirstLoop = true
let currentFrame = 0

// Initialize Regl with fullscreen quad
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	async onInit(regl) {
		// Load video texture
		videoTextureArray = useVideoTextureArray(regl, [
			'sprites/00_noemie.mp4',
			'sprites/01_baku.mp4',
		])
		await videoTextureArray.load()

		// Initialize tile map
		tileMap = new TileMap(regl, tileSize.width, tileSize.height)
		// パターンジェネレーター関数（パターンインデックスを受け取る）
		tileMap.setMovePattern(step => {
			const index = Math.floor(step / 2) % 4

			let pattern!: MovePattern

			if (index === 0) {
				pattern = patternUpDown
			}

			if (index === 1) {
				pattern = invertMovePattern(patternUpDown)
			}

			if (index === 2) {
				pattern = patternLeftRight
			}

			if (index === 3) {
				pattern = invertMovePattern(patternLeftRight)
			}

			return pattern
		})

		// Start the timer
		useIntervalFn(() => {
			if (currentFrame === 0) {
				if (isFirstLoop) {
					isFirstLoop = false
				} else {
					tileMap?.nextStep()
				}
			}
			currentFrame = scalar.mod(currentFrame + 1, 8)
			videoTextureArray?.setFrame(currentFrame)
		}, 1000 / 11)

		// Wait for audio to start
		await audioStarted.promise

		return {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video0: regl.prop<Uniforms, 'video0'>('video0'),
			video1: regl.prop<Uniforms, 'video1'>('video1'),
			tileMap: regl.prop<Uniforms, 'tileMap'>('tileMap'),
			tileMapSize: [tileMap.width, tileMap.height],
			navMatrix: regl.prop<Uniforms, 'navMatrix'>('navMatrix'),
		}
	},
	onFrame() {
		const [video0, video1] = videoTextureArray?.textureArray.value ?? []

		if (!video0 || !video1 || !tileMap) return null

		return {
			video0,
			video1,
			tileMap: tileMap.texture,
			navMatrix: zui.inverseMatrix.value,
		}
	},
})

useSeoMeta({
	title: 'Kawachi Ondo',
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

button
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
</style>
