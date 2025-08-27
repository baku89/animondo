<template>
	<main>
		<canvas ref="canvas" class="canvas" />
	</main>
</template>

<script setup lang="ts">
import type Regl from 'regl'
import {useRegl} from '~/composables/useRegl'
import TileFragmentShader from '~/components/shaders/tile.frag?raw'

const canvas = useTemplateRef('canvas')

// Define uniforms interface
interface Uniforms {
	u_resolution: Regl.Vec2
}

// Initialize Regl with fullscreen quad
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	async onInit(regl) {
		return {
			u_resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
		}
	},
	onFrame() {
		return {}
	},
})
</script>

<style lang="stylus">

.canvas
	position fixed
	width 100vw
	height 100svh
</style>
