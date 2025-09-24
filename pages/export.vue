<template>
	<main>
		<button v-if="!audio.hasStarted.value" @click="audio.start">Preview</button>
		<button v-if="!audio.hasStarted.value" @click="startExport">Export</button>
		<canvas ref="canvas" class="canvas" />
	</main>
</template>

<script setup lang="ts">
import type Regl from 'regl'
import {useRegl} from '~/composables/useRegl'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {type MovePattern} from '~/utils/patterns'
import {TileMap} from '~/utils/TileMap'
import {useIntervalFn} from '@vueuse/core'
import {mat2d, mat3, scalar} from 'linearly'
import * as Patterns from '~/utils/patterns'
import {useKawachiAudio} from '~/composables/useKawachiAudio'
import {useIDBKeyval} from '@vueuse/integrations/useIDBKeyval'
import {range} from 'lodash-es'

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
	video8: Regl.Texture2D
	video9: Regl.Texture2D
	tileMap: Regl.Texture2D
	tileMapSize: Regl.Vec2
	navMatrix: Regl.Mat3
}

const audio = useKawachiAudio()

let videoTextureArray: ReturnType<typeof useVideoTextureArray> | null = null
let tileMap: TileMap | null = null

let isFirstLoop = true
let currentFrame = 0

const {data: exportDirectoryHandle} =
	useIDBKeyval<FileSystemDirectoryHandle | null>('export-directory', null)

let isExporting = false
const recordStartFrame = 0
const recordEndFrame = 100

async function startExport() {
	// if (!exportDirectoryHandle.value) {
	exportDirectoryHandle.value = await (window as any).showDirectoryPicker({
		mode: 'readwrite',
	})
	// }

	audio.start()
	isExporting = true
}

const [a, b, c, d, tx, ty] =
	mat2d.invert(
		mat2d.mul(
			mat2d.scaling(2),
			mat2d.translation(-0.5),
			mat2d.scaling(1 / Patterns.size.width)
		)
	) ?? mat2d.ident

const navMatrix = [a, b, 0, c, d, 0, tx, ty, 1] as mat3.Mutable

function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

// Initialize Regl with fullscreen quad (manual rendering mode)
useRegl<Uniforms>(canvas, {
	frag: TileFragmentShader,
	enableRaf: false, // Disable automatic RAF
	size: [1920, 1920],
	async onInit(regl, render) {
		// Load video texture
		videoTextureArray = useVideoTextureArray(regl, [
			'sprites/noemie.mp4',
			'sprites/baku.mp4',
			'sprites/sumito.mp4',
			'sprites/masa.mp4',
			'sprites/edmunds.mp4',
			'sprites/honami.mp4',
			'sprites/shinobu.mp4',
			'sprites/laura.mp4',
			'sprites/lucija.mp4',
			'sprites/sander.mp4',
		])
		await videoTextureArray.load()

		// Initialize tile map
		tileMap = new TileMap({
			regl,
			...Patterns.size,
			numberOfVideos: 10,
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

		async function onFrame() {
			if (currentFrame % 8 === 0 && currentFrame > 0) {
				tileMap?.nextStep()
			}
			currentFrame += 1
			await videoTextureArray?.setFrame(currentFrame % 8)

			render()
		}

		// Start the timer
		if (!isExporting) {
			// Preview mode - use setInterval for async function
			const intervalId = setInterval(onFrame, 1000 / 8.8)

			// Clean up on unmount
			onUnmounted(() => {
				clearInterval(intervalId)
			})
		} else {
			setTimeout(async () => {
				for (const i of range(recordStartFrame, recordEndFrame)) {
					console.log('Exporting frame', i)

					await onFrame() // Use finishRender for accurate export

					// Export frame
					if (exportDirectoryHandle.value && canvas.value) {
						try {
							// Convert canvas to blob and write to file
							const blob = await new Promise<Blob | null>(resolve => {
								canvas.value?.toBlob(resolve, 'image/png')
							})

							const fileHandle =
								await exportDirectoryHandle.value.getFileHandle(
									'frame_' + i.toString().padStart(4, '0') + '.png',
									{create: true}
								)
							const writable = await fileHandle.createWritable()

							if (blob) {
								await writable.write(blob)
								await writable.close()
							}
						} catch (error) {
							console.error('Error exporting frame', i, error)
						}
					}
				}
			}, 10)
		}

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
			video8: regl.prop<Uniforms, 'video8'>('video8'),
			video9: regl.prop<Uniforms, 'video9'>('video9'),
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
			video8,
			video9,
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
			!video8 ||
			!video9 ||
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
			video8,
			video9,
			tileMap: tileMap.texture,
			navMatrix,
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
	top 0
	border 1px solid red
	box-sizing content-box
	width 1920px
	height 1920px
</style>
