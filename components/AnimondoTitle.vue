<template>
	<canvas ref="ink" class="animondo-title" />
</template>

<script setup lang="ts">
import {useElementSize, useIntervalFn} from '@vueuse/core'

const props = defineProps<{
	/** Flip to true to wipe the title away; `left` follows when it has */
	leaving?: boolean
}>()

const emit = defineEmits<{(e: 'left'): void}>()

// Written by scripts/build-title-sprite.sh. The path carries the baseURL the
// same way useVideoTexture does, so dev and the deployed site agree.
const SPRITE_URL = '/animondo/title-sprite.webp'

const COLUMNS = 7
const CELL_WIDTH = 838
const CELL_HEIGHT = 214

// Source frames at 12 fps:
//   0..20   the title writes itself in, once
//   22..30  a held loop, waiting for the visitor
//   31..48  the ink is wiped away
const INTRO_END = 20
const LOOP_START = 22
const LOOP_END = 30
const LAST_FRAME = 48

type Phase = 'intro' | 'idle' | 'outro' | 'done'

const frame = ref(0)
const phase = ref<Phase>('intro')

const ink = useTemplateRef<HTMLCanvasElement>('ink')
const {width: inkWidth, height: inkHeight} = useElementSize(ink)
const sheet = ref<HTMLImageElement | null>(null)

// Drawing one cell keeps the browser scaling 838x214, instead of scaling the
// whole 5866x1498 sheet to cover a box seven times the title — a ~29 megapixel
// intermediate on a 2x screen, which is where the ink edges were breaking up.
watchEffect(() => {
	const canvas = ink.value
	const image = sheet.value
	if (!canvas || !image || inkWidth.value === 0) return

	const dpr = window.devicePixelRatio || 1
	const width = Math.round(inkWidth.value * dpr)
	const height = Math.round(inkHeight.value * dpr)
	if (canvas.width !== width) canvas.width = width
	if (canvas.height !== height) canvas.height = height

	const context = canvas.getContext('2d')
	if (!context) return

	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'
	context.clearRect(0, 0, width, height)
	context.drawImage(
		image,
		(frame.value % COLUMNS) * CELL_WIDTH,
		Math.floor(frame.value / COLUMNS) * CELL_HEIGHT,
		CELL_WIDTH,
		CELL_HEIGHT,
		0,
		0,
		width,
		height
	)
})

const {pause, resume} = useIntervalFn(
	() => {
		switch (phase.value) {
			case 'intro':
				if (frame.value < INTRO_END) {
					frame.value++
				} else {
					phase.value = 'idle'
					frame.value = LOOP_START
				}
				break

			case 'idle':
				if (frame.value < LOOP_END) {
					frame.value++
				} else if (props.leaving) {
					// Only ever leave the loop from its final frame, so the wipe
					// picks up exactly where the held animation left off.
					phase.value = 'outro'
					frame.value = LOOP_END + 1
				} else {
					frame.value = LOOP_START
				}
				break

			case 'outro':
				if (frame.value < LAST_FRAME) {
					frame.value++
				} else {
					phase.value = 'done'
					pause()
					emit('left')
				}
				break
		}
	},
	1000 / 12,
	{immediate: false}
)

onMounted(() => {
	// Hold on frame 0 until the sheet is decoded, so the title does not open
	// mid-stroke on a slow connection.
	const image = new Image()
	image.onload = () => {
		sheet.value = image
		resume()
	}
	// Fail open — a missing sheet should not leave a blank where it belongs.
	image.onerror = () => resume()
	image.src = SPRITE_URL
})
</script>

<style lang="stylus">
.animondo-title
	display block
	width 100%
	aspect-ratio 838 / 214
</style>
