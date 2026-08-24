<template>
	<div
		class="sound-tooltip"
		:class="{'sound-tooltip--leaving': leaving}"
		role="status"
	>
		<span class="visually-hidden">{{ t('sound.notice') }}</span>
		<!-- Hand-drawn bubble + label; the hidden span speaks for them -->
		<div class="sound-tooltip__bubble" aria-hidden="true" />
		<div
			class="sound-tooltip__label"
			:class="`sound-tooltip__label--${locale}`"
			aria-hidden="true"
		/>
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	/** Flip to true to play the bubble out; `left` follows when it has */
	leaving?: boolean
}>()

const emit = defineEmits<{(e: 'left'): void}>()

const {t, locale} = useI18n()

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
// A speech bubble hung off the sound toggle's bottom-right corner. The
// master (809x456, 12 fps: 0-3 appear from the tail, 4-7 loop) roots its
// tail at the BOTTOM-left, so the bubble is flipped vertically to point up
// at the toggle; the label masters share the canvas and are drawn for that
// flipped orientation, so they lay over it unflipped, 1:1.
.sound-tooltip
	position fixed
	z-index 110
	// The flipped tail's tip sits at ~12% / 6% of the box; back the box off
	// by that much so the tip lands on the toggle's bottom-right corner
	// (the toggle: 1rem inset, clamp(4rem, 15vw, 6rem) across)
	top calc(1rem + clamp(4rem, 15vw, 6rem) * 0.8)
	left calc(1rem + clamp(4rem, 15vw, 6rem) * 0.8 - clamp(8.25rem, 34.5vw, 11.25rem) * 0.1)
	width clamp(8.25rem, 34.5vw, 11.25rem)
	aspect-ratio 809 / 456
	// Only an announcement: taps fall through to whatever is under it
	pointer-events none

	&__bubble
		position absolute
		inset 0
		transform scaleY(-1)
		background url('/animondo/tooltip/bubble_0.webp') center / contain no-repeat
		animation sound-tooltip-appear 0.3333s steps(1) forwards, sound-tooltip-loop 0.3333s steps(1) 0.3333s infinite

	// Hidden while the bubble draws itself in: the boil only starts after
	// the appear's four frames, and every keyframe pins opacity back to 1
	&__label
		position absolute
		inset 0
		opacity 0
		background center / contain no-repeat
		animation sound-tooltip-label-ja 0.3333s steps(1) 0.3333s infinite

		&--en
			animation-name sound-tooltip-label-en

	// The exit: the draw-in backwards, the label gone at once (its base
	// opacity is 0). SoundTooltip emits `left` when this has played out.
	// Its OWN keyframes, not the appear run in reverse: re-declaring a
	// finished animation's name never restarts it, so `reverse` on the
	// appear just snapped to its first frame.
	&--leaving &__bubble
		animation sound-tooltip-disappear 0.3333s steps(1) forwards

	&--leaving &__label
		animation none

@keyframes sound-tooltip-disappear
	0%
		background-image url('/animondo/tooltip/bubble_3.webp')
	25%
		background-image url('/animondo/tooltip/bubble_2.webp')
	50%
		background-image url('/animondo/tooltip/bubble_1.webp')
	75%
		background-image url('/animondo/tooltip/bubble_0.webp')

@keyframes sound-tooltip-appear
	0%
		background-image url('/animondo/tooltip/bubble_0.webp')
	25%
		background-image url('/animondo/tooltip/bubble_1.webp')
	50%
		background-image url('/animondo/tooltip/bubble_2.webp')
	75%
		background-image url('/animondo/tooltip/bubble_3.webp')

@keyframes sound-tooltip-loop
	0%
		background-image url('/animondo/tooltip/bubble_4.webp')
	25%
		background-image url('/animondo/tooltip/bubble_5.webp')
	50%
		background-image url('/animondo/tooltip/bubble_6.webp')
	75%
		background-image url('/animondo/tooltip/bubble_7.webp')

@keyframes sound-tooltip-label-ja
	0%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_ja_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_ja_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_ja_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_ja_3.webp')

@keyframes sound-tooltip-label-en
	0%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_en_0.webp')
	25%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_en_1.webp')
	50%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_en_2.webp')
	75%
		opacity 1
		background-image url('/animondo/tooltip/sound-on_en_3.webp')
</style>
