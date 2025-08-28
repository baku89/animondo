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
import {MovePattern} from '~/utils/tile'
import {TileMap} from '~/utils/TileMap'
import {useIntervalFn} from '@vueuse/core'
import {scalar} from 'linearly'
import {useZUI} from '~/composables/useZUI'
import * as Patterns from '~/utils/patterns'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	resolution: Regl.Vec2
	video0: Regl.Texture2D
	video1: Regl.Texture2D
	video2: Regl.Texture2D
	tileMap: Regl.Texture2D
	tileMapSize: Regl.Vec2
	navMatrix: Regl.Mat3
}

const hasStarted = ref(false)

const audioStarted = Promise.withResolvers<void>()

async function startAudio() {
	// Play background music
	const audio = new Audio(
		'/eu-japan-animation-residency-collab/kawachiondo.mp3'
	)
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
			'sprites/02_sumito.mp4',
		])
		await videoTextureArray.load()

		// Initialize tile map
		tileMap = new TileMap({
			regl,
			...Patterns.size,
			numberOfVideos: 3,
		})

		// パターンジェネレーター関数（常にcを返す）
		tileMap.setMovePattern(function* (): Generator<MovePattern, never, void> {
			// yield Patterns.empty
			// yield Patterns.empty
			// yield Patterns.empty
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
		}, 1000 / 8.8)

		// Wait for audio to start
		await audioStarted.promise

		return {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video0: regl.prop<Uniforms, 'video0'>('video0'),
			video1: regl.prop<Uniforms, 'video1'>('video1'),
			video2: regl.prop<Uniforms, 'video2'>('video2'),
			tileMap: regl.prop<Uniforms, 'tileMap'>('tileMap'),
			tileMapSize: [tileMap.width, tileMap.height],
			navMatrix: regl.prop<Uniforms, 'navMatrix'>('navMatrix'),
		}
	},
	onFrame() {
		const [video0, video1, video2] = videoTextureArray?.textureArray.value ?? []

		if (!video0 || !video1 || !video2 || !tileMap) return null

		return {
			video0,
			video1,
			video2,
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
