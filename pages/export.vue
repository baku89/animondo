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
import {TileMap} from '~/utils/TileMap'
import {useIntervalFn} from '@vueuse/core'
import {mat2d, mat3, vec2} from 'linearly'
import * as Patterns from '~/utils/patterns'
import {useKawachiAudio} from '~/composables/useKawachiAudio'
import {useIDBKeyval} from '@vueuse/integrations/useIDBKeyval'
import {range} from 'lodash-es'

const canvas = useTemplateRef('canvas')

const exportResolution: vec2 = vec2.scale([1920, 1920], 2)

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
const recordEndFrame = 616

async function startExport() {
	if (!exportDirectoryHandle.value) {
		exportDirectoryHandle.value = await (window as any).showDirectoryPicker({
			mode: 'readwrite',
		})
	}

	audio.start()
	audio.stop()
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
	size: exportResolution,
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
			generateTileInfo: (step, pos, bornCount) => {
				return {
					index: bornCount % 7,
					flipVertical: false,
				}
			},
		})
		// Pattern generator function (always returns c)
		tileMap.setMovePattern(function* () {
			// while (true) {
			// 	yield Patterns.rightAppearVanish
			// }

			yield Patterns.empty
			yield Patterns.empty
			yield Patterns.empty

			// Gradually expanding
			yield Patterns.radialMask(Patterns.clockwise, 0)
			yield Patterns.radialMask(Patterns.clockwise, 1)
			yield Patterns.radialMask(Patterns.clockwise, 2)
			yield Patterns.radialMask(Patterns.clockwise, 3)
			yield Patterns.radialMask(Patterns.clockwise, 4)

			yield Patterns.clockwise
			yield Patterns.clockwise
			yield Patterns.clockwise

			while (true) {
				yield Patterns.clockwise
				yield Patterns.clockwise
				yield Patterns.counterClockwise

				yield Patterns.upDown
				yield Patterns.downUp
				yield Patterns.leftRight
				yield Patterns.rightLeft

				yield Patterns.clockwise
				yield Patterns.clockwise

				yield Patterns.up
				yield Patterns.right
				yield Patterns.down
				yield Patterns.left
				yield Patterns.down
				yield Patterns.right
				yield Patterns.up
				yield Patterns.left

				yield* Patterns.offsetGenerators([0, -2], function* () {
					yield Patterns.counterClockwise
					yield Patterns.counterClockwise
					yield Patterns.gather
					yield Patterns.gather
					yield Patterns.scatter
					yield Patterns.scatter
					yield Patterns.horizontalScatter
					yield Patterns.verticalScatter
					yield Patterns.horizontalScatter
				})()

				yield Patterns.smallClockwise
				yield Patterns.smallClockwise
				yield Patterns.offset(Patterns.invert(Patterns.smallClockwise), [1, 1])

				yield* Patterns.offsetGenerators([0, -2], function* () {
					yield Patterns.clockwise
					yield Patterns.clockwise
					yield Patterns.gather
					yield Patterns.scatter
					yield Patterns.clockwise
					yield Patterns.clockwise
				})()

				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish
				yield Patterns.rightAppearVanish

				yield* Patterns.offsetGenerators([0, -2], function* () {
					yield Patterns.verticalScatter
					yield Patterns.verticalScatter
					yield Patterns.verticalScatter

					const rightLeft = new Array2D<Move>({
						...Patterns.size,
						initialize(x, y) {
							return y >= 8
								? {in: Direction.Right, out: Direction.Left}
								: {in: Direction.Left, out: Direction.Right}
						},
					})

					yield rightLeft
					yield rightLeft
					yield upDown
					yield downUp
					yield Patterns.verticalScatter
					yield Patterns.verticalScatter
					yield Patterns.verticalScatter
					yield Patterns.verticalScatter

					yield Patterns.clockwise
					yield Patterns.clockwise
					yield Patterns.clockwise
					yield Patterns.clockwise
					yield Patterns.clockwise
				})()

				yield* Patterns.offsetGenerators([8, -2], function* () {
					yield Patterns.radialMask(Patterns.clockwise, 7)
					yield Patterns.radialMask(Patterns.clockwise, 6)
					yield Patterns.radialMask(Patterns.clockwise, 5)
					yield Patterns.radialMask(Patterns.clockwise, 4)
					yield Patterns.radialMask(Patterns.clockwise, 3)
					yield Patterns.radialMask(Patterns.clockwise, 2)
					yield Patterns.radialMask(Patterns.clockwise, 1)
					yield Patterns.radialMask(Patterns.clockwise, 0)
				})()

				while (true) {
					yield Patterns.empty
				}
			}
		})

		// Wait for audio to start
		if (!isExporting) {
			await audio.waitForPlay()
		}

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
			useIntervalFn(onFrame, 1000 / 8.8)
		} else {
			setTimeout(async () => {
				for (const i of range(0, recordEndFrame)) {
					await onFrame() // Use finishRender for accurate export

					if (i < recordStartFrame) {
						await new Promise(resolve => requestAnimationFrame(resolve))
						continue
					}

					console.log('Exporting frame', i)

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
	margin -1px
	box-sizing content-box
	width 100vmin
	height 100vmin
</style>
