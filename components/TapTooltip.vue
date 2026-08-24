<template>
	<div
		class="tap-tooltip"
		:class="{'tap-tooltip--leaving': leaving}"
		role="status"
	>
		<span class="visually-hidden">{{
			t(isCoarsePointer ? 'tapme.notice.mobile' : 'tapme.notice.pc')
		}}</span>
		<!-- Hand-drawn bubble + label; the hidden span speaks for them -->
		<div class="tap-tooltip__bubble" aria-hidden="true" />
		<div
			class="tap-tooltip__label"
			:class="`tap-tooltip__label--${isCoarsePointer ? 'mobile' : 'pc'}-${locale}`"
			aria-hidden="true"
		/>
	</div>
</template>

<script setup lang="ts">
import {useMediaQuery} from '@vueuse/core'

const props = defineProps<{
	/** Flip to true to play the bubble out; `left` follows when it has */
	leaving?: boolean
}>()

const emit = defineEmits<{(e: 'left'): void}>()

const {t, locale} = useI18n()

// Which verb the hint speaks: coarse pointers tap, fine ones click
const isCoarsePointer = useMediaQuery('(pointer: coarse)')

// The exit is its own drawn run-down (4 frames at 12 fps, see the CSS
// below); release the mount once it has played out.
watch(
	() => props.leaving,
	leaving => {
		if (leaving) setTimeout(() => emit('left'), 400)
	},
	{immediate: true}
)
</script>

<style lang="stylus">
// The tap-me hint a dancer speaks once the visitor has learned to navigate
// (see pages/index.vue). Same stance as the explore hint: the bubble
// master (809x456, 12 fps: 0-3 appear from the tail, 4-7 loop) is used as
// drawn — tail rooting at the bottom-left — so the balloon hangs up-right
// of its speaker, and the click-me/tap-me label masters share the canvas
// in this upright orientation, laying over it 1:1.
.tap-tooltip
	position fixed
	// Above the canvas, below the round buttons — the profile bubble's tier
	z-index 15
	--tip-width unquote('clamp(8.25rem, 34.5vw, 11.25rem)')
	width var(--tip-width)
	aspect-ratio 809 / 456
	// The tail's tip sits at ~12% / 94% of the box; --speaker-x/y (screen
	// px, set by the page every drawn frame) is where it should point, and
	// the rem terms hold the balloon a breath away up-right of the ink.
	// NOT clamped to the viewport: a bubble half off the paper still points
	// at its speaker, where a clamped one points at nobody.
	// 0.53 = 456/809 x 0.94.
	left calc(var(--speaker-x, 50vw) - var(--tip-width) * 0.12 + 1.5rem)
	top calc(var(--speaker-y, 50vh) - var(--tip-width) * 0.53 - 2rem)
	// Only a word in passing: taps land on the dancer under it
	pointer-events none

	&__bubble
		position absolute
		inset 0
		background url('/animondo/tooltip/bubble_0.webp') center / contain no-repeat
		animation tap-tooltip-appear 0.3333s steps(1) forwards, tap-tooltip-loop 0.3333s steps(1) 0.3333s infinite

	// Hidden while the bubble draws itself in: the boil only starts after
	// the appear's four frames, and every keyframe pins opacity back to 1
	&__label
		position absolute
		inset 0
		opacity 0
		background center / contain no-repeat

		&--pc-en
			animation tap-tooltip-label-pc-en 0.3333s steps(1) 0.3333s infinite

		&--pc-ja
			animation tap-tooltip-label-pc-ja 0.3333s steps(1) 0.3333s infinite

		&--mobile-en
			animation tap-tooltip-label-mobile-en 0.3333s steps(1) 0.3333s infinite

		&--mobile-ja
			animation tap-tooltip-label-mobile-ja 0.3333s steps(1) 0.3333s infinite

	// The exit: the draw-in backwards, the label gone at once (its base
	// opacity is 0). TapTooltip emits `left` when this has played out.
	// Its OWN keyframes, not the appear run in reverse: re-declaring a
	// finished animation's name never restarts it.
	&--leaving &__bubble
		animation tap-tooltip-disappear 0.3333s steps(1) forwards

	&--leaving &__label
		animation none

@keyframes tap-tooltip-appear
	0%
		background-image url('/animondo/tooltip/bubble_0.webp')
	25%
		background-image url('/animondo/tooltip/bubble_1.webp')
	50%
		background-image url('/animondo/tooltip/bubble_2.webp')
	75%
		background-image url('/animondo/tooltip/bubble_3.webp')

@keyframes tap-tooltip-loop
	0%
		background-image url('/animondo/tooltip/bubble_4.webp')
	25%
		background-image url('/animondo/tooltip/bubble_5.webp')
	50%
		background-image url('/animondo/tooltip/bubble_6.webp')
	75%
		background-image url('/animondo/tooltip/bubble_7.webp')

@keyframes tap-tooltip-disappear
	0%
		background-image url('/animondo/tooltip/bubble_3.webp')
	25%
		background-image url('/animondo/tooltip/bubble_2.webp')
	50%
		background-image url('/animondo/tooltip/bubble_1.webp')
	75%
		background-image url('/animondo/tooltip/bubble_0.webp')

@keyframes tap-tooltip-label-pc-en
	0%
		opacity 1
		background-image url('/animondo/tooltip/click-me_en_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/click-me_en_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/click-me_en_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/click-me_en_3.webp')

@keyframes tap-tooltip-label-pc-ja
	0%
		opacity 1
		background-image url('/animondo/tooltip/click-me_ja_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/click-me_ja_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/click-me_ja_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/click-me_ja_3.webp')

@keyframes tap-tooltip-label-mobile-en
	0%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_en_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_en_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_en_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_en_3.webp')

@keyframes tap-tooltip-label-mobile-ja
	0%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_ja_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_ja_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_ja_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/tap-me_ja_3.webp')
</style>
