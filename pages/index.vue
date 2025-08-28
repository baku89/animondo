<template>
	<main>
		<canvas ref="canvas" class="canvas" />
	</main>
</template>

<script setup lang="ts">
import type Regl from 'regl'
import {useRegl} from '~/composables/useRegl'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {Direction, MovePattern} from '~/utils/tile'
import {TileMap} from '~/utils/TileMap'
import {useIntervalFn} from '@vueuse/core'
import {scalar} from 'linearly'
import {useZUI} from '~/composables/useZUI'

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

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// Initialize ZUI for navigation
const zui = useZUI(canvas)

// const sampleMovePattern = new MovePattern({
// 	array: [
// 		[
// 			{in: Direction.Right, out: Direction.Up},
// 			{in: Direction.Up, out: Direction.Left},
// 		],
// 		[
// 			{in: Direction.Down, out: Direction.Right},
// 			{in: Direction.Left, out: Direction.Down},
// 		],
// 	],
// })

// const sampleMovePattern = new MovePattern({
// 	array: [
// 		[
// 			{in: Direction.None, out: Direction.Down},
// 			{in: Direction.Down, out: Direction.None},
// 		],
// 		[
// 			{in: Direction.Up, out: Direction.Right},
// 			{in: Direction.Left, out: Direction.Up},
// 		],
// 	],
// })

const sampleMovePattern = new MovePattern({
	width: 4,
	height: 4,
	initialize: (x, y) => {
		if (x % 2 === 0) {
			return {in: Direction.Down, out: Direction.Up}
		}
		return {in: Direction.Up, out: Direction.Down}
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
		tileMap = new TileMap(
			regl,
			sampleMovePattern.width,
			sampleMovePattern.height
		)
		tileMap.setMovePattern(() => sampleMovePattern)

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
		}, 1000 / 10)

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
</script>

<style lang="stylus">

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
