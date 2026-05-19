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
import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
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
const {t} = useI18n()

const aboutOpen = ref(false)

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

// Initialize ZUI for navigation
const zui = useZUI(canvas)

let currentFrame = 0

// Initialize Regl with fullscreen quad
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	async onInit(regl) {
		// Load video texture
		// Active artist sprites. Laura and Lucija may rejoin later — when
		// they do, append their entries here, bump numberOfVideos, and
		// extend the shader/uniforms (video8/video9).
		videoTextureArray = useVideoTextureArray(regl, [
			'sprites/noemie.mp4',
			'sprites/baku.mp4',
			'sprites/sumito.mp4',
			'sprites/masa.mp4',
			'sprites/edmunds.mp4',
			'sprites/honami.mp4',
			'sprites/shinobu.mp4',
			'sprites/sander.mp4',
			// 'sprites/laura.mp4',
			// 'sprites/lucija.mp4',
		])
		await videoTextureArray.load()

		// Initialize tile map
		tileMap = new TileMap({
			regl,
			...Patterns.size,
			numberOfVideos: 8,
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
				tileMap?.nextStep()
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
</style>
