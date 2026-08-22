<template>
	<button
		class="circle-icon"
		:style="{width: size, height: size}"
		:aria-label="label"
		:title="label"
		@pointerenter="outline.setState('hover')"
		@pointerleave="outline.setState('fixed')"
		@click="$emit('click')"
	>
		<canvas ref="surface" class="circle-icon__surface" aria-hidden="true" />
	</button>
</template>

<script setup lang="ts">
import {useElementSize, useIntervalFn} from '@vueuse/core'

import type {SpriteSheet} from '~/composables/useSpritePlayer'
import {createSpritePlayer, OUTLINE_SHEET} from '~/composables/useSpritePlayer'

const props = withDefaults(
	defineProps<{
		glyph: SpriteSheet
		/** Which of the glyph's states to rest in */
		state: string
		label: string
		/** Flip to true to play the icon out; `left` follows when it has */
		leaving?: boolean
		/** Any CSS length. The ink fills its frame, so this is the circle. */
		size?: string
	}>(),
	{leaving: false, size: '3rem'}
)

const emit = defineEmits<{(e: 'click' | 'left'): void}>()

const surface = useTemplateRef<HTMLCanvasElement>('surface')
const {width, height} = useElementSize(surface)

const outline = createSpritePlayer(OUTLINE_SHEET, 'fixed')
const glyph = createSpritePlayer(props.glyph, props.state)

const sheets = ref<Map<string, HTMLImageElement>>(new Map())

watch(
	() => props.state,
	next => glyph.setState(next)
)

function draw() {
	const canvas = surface.value
	if (!canvas || width.value === 0) return

	const dpr = window.devicePixelRatio || 1
	const w = Math.round(width.value * dpr)
	const h = Math.round(height.value * dpr)
	if (canvas.width !== w) canvas.width = w
	if (canvas.height !== h) canvas.height = h

	const context = canvas.getContext('2d')
	if (!context) return

	context.clearRect(0, 0, w, h)
	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'

	// Outline first, then the glyph sitting inside it
	for (const player of [outline, glyph]) {
		const image = sheets.value.get(player.sheet.url)
		if (!image) continue

		const cell = image.width / player.sheet.columns
		context.drawImage(
			image,
			(player.frame % player.sheet.columns) * cell,
			Math.floor(player.frame / player.sheet.columns) * cell,
			cell,
			cell,
			0,
			0,
			w,
			h
		)
	}
}

let dismissed = false

useIntervalFn(() => {
	// Read on the beat rather than watched, so a `leaving` that is already
	// true when this mounts still starts the exit.
	if (props.leaving && !dismissed) {
		dismissed = true
		outline.dismiss()
		glyph.dismiss()
	}

	outline.tick()
	glyph.tick()
	draw()

	// Both layers have to finish before the icon may be taken away, or the
	// slower one is cut off mid-stroke.
	if (dismissed && outline.done && glyph.done) emit('left')
}, 1000 / 12)

// Redraw on resize even while a loop is between ticks
watchEffect(draw)

onMounted(() => {
	for (const sheet of [OUTLINE_SHEET, props.glyph]) {
		const image = new Image()
		image.onload = () => {
			sheets.value = new Map(sheets.value).set(sheet.url, image)
		}
		image.src = sheet.url
	}
})
</script>

<style lang="stylus">
.circle-icon
	width 2.5rem
	height 2.5rem
	padding 0
	background none
	border none
	cursor pointer

	&__surface
		display block
		width 100%
		height 100%
</style>
