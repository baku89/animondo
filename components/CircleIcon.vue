<template>
	<component
		:is="href ? 'a' : 'button'"
		class="circle-icon"
		:href="href"
		:target="href ? '_blank' : undefined"
		:rel="href ? 'noopener' : undefined"
		:style="{width: aspect === 1 ? size : `calc(${size} * ${aspect})`, height: size}"
		:aria-label="label"
		:title="label"
		@pointerenter="ownHover = true"
		@pointerleave="ownHover = false"
		@click="$emit('click')"
	>
		<canvas ref="surface" class="circle-icon__surface" aria-hidden="true" />
	</component>
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
		/** Set to make the icon a link out of the site rather than a button */
		href?: string
		/** The frame drawn behind the glyph; the round one unless told otherwise */
		outline?: SpriteSheet
		/** The outline's cell aspect (w/h); widens the box past `size` */
		aspect?: number
		/** Externally-driven hover — a caption beside the icon being pointed
		 * at should light the icon up too */
		hover?: boolean
		/** Repaint the ink this colour while hovered (e.g. brand colour
		 * for a link out of the site) */
		tint?: string
	}>(),
	{
		leaving: false,
		size: '3.5rem',
		href: undefined,
		outline: undefined,
		aspect: 1,
		hover: false,
		tint: undefined,
	}
)

const emit = defineEmits<{(e: 'click' | 'left'): void}>()

const surface = useTemplateRef<HTMLCanvasElement>('surface')
const {width, height} = useElementSize(surface)

const outlineSheet = props.outline ?? OUTLINE_SHEET
const outlinePlayer = createSpritePlayer(outlineSheet, 'fixed')
const glyph = createSpritePlayer(props.glyph, props.state)

const sheets = ref<Map<string, HTMLImageElement>>(new Map())

watch(
	() => props.state,
	next => glyph.setState(next)
)

// The outline's hover follows the pointer on the icon itself OR the
// borrowed hover from a companion caption link (the `hover` prop)
const ownHover = ref(false)
watch(
	computed(() => ownHover.value || props.hover),
	hovered => outlinePlayer.setState(hovered ? 'hover' : 'fixed')
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
	context.globalCompositeOperation = 'source-over'
	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'

	// Outline first, then the glyph sitting inside it. Each layer is
	// contain-fit and centred from its own cell size, so a square glyph
	// still lands in the middle of a wide outline (the YouTube frame).
	for (const player of [outlinePlayer, glyph]) {
		const image = sheets.value.get(player.sheet.url)
		if (!image) continue

		const columns = player.sheet.columns
		const rows = Math.ceil(player.sheet.frames / columns)
		const cellWidth = image.width / columns
		const cellHeight = image.height / rows
		const scale = Math.min(w / cellWidth, h / cellHeight)
		const drawWidth = cellWidth * scale
		const drawHeight = cellHeight * scale
		context.drawImage(
			image,
			(player.frame % columns) * cellWidth,
			Math.floor(player.frame / columns) * cellHeight,
			cellWidth,
			cellHeight,
			(w - drawWidth) / 2,
			(h - drawHeight) / 2,
			drawWidth,
			drawHeight
		)
	}

	// The hover tint repaints the drawn ink in one colour: source-in keeps
	// the ink's own alpha and swaps every pixel's colour for the tint's, so
	// the hand-drawn line stays exactly as drawn, only re-inked.
	if (props.tint && (ownHover.value || props.hover)) {
		context.globalCompositeOperation = 'source-in'
		context.fillStyle = props.tint
		context.fillRect(0, 0, w, h)
		context.globalCompositeOperation = 'source-over'
	}
}

let dismissed = false

useIntervalFn(() => {
	// Read on the beat rather than watched, so a `leaving` that is already
	// true when this mounts still starts the exit.
	if (props.leaving && !dismissed) {
		dismissed = true
		outlinePlayer.dismiss()
		glyph.dismiss()
	}

	outlinePlayer.tick()
	glyph.tick()
	draw()

	// Both layers have to finish before the icon may be taken away, or the
	// slower one is cut off mid-stroke.
	if (dismissed && outlinePlayer.done && glyph.done) emit('left')
}, 1000 / 12)

// Redraw on resize even while a loop is between ticks
watchEffect(draw)

onMounted(() => {
	for (const sheet of [outlineSheet, props.glyph]) {
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
	display block
	width 3rem
	height 3rem
	padding 0
	background none
	border none
	cursor pointer

	&__surface
		display block
		width 100%
		height 100%
</style>
