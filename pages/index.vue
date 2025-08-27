<template>
	<main>
		<canvas ref="canvas" class="canvas" />
	</main>
</template>

<script setup lang="ts">
import type Regl from 'regl'
import {useRegl} from '~/composables/useRegl'
import {useVideoTexture} from '~/composables/useVideoTexture'
import TileFragmentShader from '~/components/shaders/tile.frag?raw'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	resolution: Regl.Vec2
	video: Regl.Texture2D
}

let videoTexture: ReturnType<typeof useVideoTexture> | null = null

// Initialize Regl with fullscreen quad
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	async onInit(regl) {
		// Load video texture
		videoTexture = useVideoTexture(regl, 'sprites/00_noemie.mp4')
		await videoTexture.load()

		return {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video: regl.prop<Uniforms, 'video'>('video'),
		}
	},
	onFrame() {
		const video = videoTexture?.getUpdatedTexture()

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
