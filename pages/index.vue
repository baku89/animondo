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
import {Direction, TileMap, type MovePattern} from '~/utils/tile'
import {useIntervalFn} from '@vueuse/core'
import {scalar} from 'linearly'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	resolution: Regl.Vec2
	video: Regl.Texture2D
	tileMap: Regl.Texture2D
	tileMapSize: Regl.Vec2
}

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// const sampleMovePattern: MovePattern = [
// 	[
// 		{in: Direction.Right, out: Direction.Up},
// 		{in: Direction.Up, out: Direction.Left},
// 	],
// 	[
// 		{in: Direction.Down, out: Direction.Right},
// 		{in: Direction.Left, out: Direction.Down},
// 	],
// ]

const sampleMovePattern: MovePattern = [
	[
		{in: Direction.Right, out: Direction.Up},
		{in: Direction.Up, out: Direction.Left},
	],
	[
		{in: Direction.Down, out: Direction.Right},
		{in: Direction.Left, out: Direction.Down},
	],
]

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
		tileMap = new TileMap(regl, 2, 2)
		tileMap.setMovePattern(sampleMovePattern)

		// Start the timer
		useIntervalFn(() => {
			currentFrame = scalar.mod(currentFrame + 1, 8)
			videoTextureArray?.setFrame(currentFrame)
		}, 1000 / 12)

		return {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video: regl.prop<Uniforms, 'video'>('video'),
			tileMap: tileMap.texture,
			tileMapSize: [tileMap.width, tileMap.height],
		}
	},
	onFrame() {
		const video = videoTextureArray?.textureArray.value[0]

		if (!video) return null

		return {video}
	},
})
</script>

<style lang="stylus">

.canvas
	position fixed
	width 100vw
	height 100svh
</style>
