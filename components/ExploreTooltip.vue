<template>
	<div
		class="explore-tooltip"
		:class="{'explore-tooltip--leaving': leaving}"
		role="status"
	>
		<span class="visually-hidden">{{
			t(isCoarsePointer ? 'explore.notice.mobile' : 'explore.notice.pc')
		}}</span>
		<!-- Hand-drawn bubble + label; the hidden span speaks for them -->
		<div class="explore-tooltip__bubble" aria-hidden="true" />
		<div
			class="explore-tooltip__label"
			:class="`explore-tooltip__label--${isCoarsePointer ? 'mobile' : 'pc'}-${locale}`"
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

// Which verbs the hint speaks: coarse pointers pinch and swipe, fine ones
// drag and scroll — the same line the title hint draws
const isCoarsePointer = useMediaQuery('(pointer: coarse)')

// The exit is the draw-in run backwards (4 frames at 12 fps, see the CSS
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
// The navigation hint a dancer speaks a couple of turns after the stage
// unlocks (see pages/index.vue). The bubble master (809x456, 12 fps: 0-3
// appear from the tail, 4-7 loop) is used as drawn — tail rooting at the
// bottom-left — so the balloon hangs up-right of its speaker. The explore
// label masters share the canvas and are drawn for this upright
// orientation, laying over it 1:1.
.explore-tooltip
	position fixed
	// Above the canvas, below the round buttons — the profile bubble's tier
	z-index 15
	--tip-width unquote('clamp(8.25rem, 34.5vw, 11.25rem)')
	width var(--tip-width)
	aspect-ratio 809 / 456
	// The tail's tip sits at ~12% / 94% of the box; --speaker-x/y (screen
	// px, set by the page every drawn frame) is where it should point,
	// clamped so the balloon stays on the paper. 0.53 = 456/809 x 0.94.
	left unquote('clamp(0.5rem, calc(var(--speaker-x, 50vw) - var(--tip-width) * 0.12), calc(100vw - var(--tip-width) - 0.5rem))')
	top unquote('max(0.5rem, calc(var(--speaker-y, 50vh) - var(--tip-width) * 0.53 - 0.25rem))')
	// Only a word in passing: taps land on the dancer under it
	pointer-events none

	&__bubble
		position absolute
		inset 0
		background url('/animondo/tooltip/bubble_0.webp') center / contain no-repeat
		animation explore-tooltip-appear 0.3333s steps(1) forwards, explore-tooltip-loop 0.3333s steps(1) 0.3333s infinite

	// Hidden while the bubble draws itself in: the boil only starts after
	// the appear's four frames, and every keyframe pins opacity back to 1
	&__label
		position absolute
		inset 0
		opacity 0
		background center / contain no-repeat

		&--pc-en
			animation explore-tooltip-label-pc-en 0.3333s steps(1) 0.3333s infinite

		&--pc-ja
			animation explore-tooltip-label-pc-ja 0.3333s steps(1) 0.3333s infinite

		&--mobile-en
			animation explore-tooltip-label-mobile-en 0.3333s steps(1) 0.3333s infinite

		&--mobile-ja
			animation explore-tooltip-label-mobile-ja 0.3333s steps(1) 0.3333s infinite

	// The exit: the draw-in backwards, the label gone at once (its base
	// opacity is 0). ExploreTooltip emits `left` when this has played out.
	&--leaving &__bubble
		animation explore-tooltip-appear 0.3333s steps(1) reverse forwards

	&--leaving &__label
		animation none

@keyframes explore-tooltip-appear
	0%
		background-image url('/animondo/tooltip/bubble_0.webp')
	25%
		background-image url('/animondo/tooltip/bubble_1.webp')
	50%
		background-image url('/animondo/tooltip/bubble_2.webp')
	75%
		background-image url('/animondo/tooltip/bubble_3.webp')

@keyframes explore-tooltip-loop
	0%
		background-image url('/animondo/tooltip/bubble_4.webp')
	25%
		background-image url('/animondo/tooltip/bubble_5.webp')
	50%
		background-image url('/animondo/tooltip/bubble_6.webp')
	75%
		background-image url('/animondo/tooltip/bubble_7.webp')

@keyframes explore-tooltip-label-pc-en
	0%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_en_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_en_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_en_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_en_3.webp')

@keyframes explore-tooltip-label-pc-ja
	0%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_ja_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_ja_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_ja_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/explore_pc_ja_3.webp')

@keyframes explore-tooltip-label-mobile-en
	0%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_en_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_en_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_en_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_en_3.webp')

@keyframes explore-tooltip-label-mobile-ja
	0%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_ja_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_ja_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_ja_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/explore_mobile_ja_3.webp')
</style>
