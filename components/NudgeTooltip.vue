<template>
	<div
		class="nudge-tooltip"
		:class="[`nudge-tooltip--${corner}`, {'nudge-tooltip--leaving': leaving}]"
		role="status"
	>
		<span class="visually-hidden">{{ message }}</span>
		<!-- Hand-drawn bubble + label; the hidden span speaks for them -->
		<div class="nudge-tooltip__bubble" aria-hidden="true" />
		<div class="nudge-tooltip__label" :style="labelStyle" aria-hidden="true" />
	</div>
</template>

<script setup lang="ts">
const props = defineProps<{
	/** Which fixed button the bubble hangs off (see the CSS below) */
	corner: 'top-left' | 'top-right' | 'bottom-left'
	/** What the bubble says, for assistive tech */
	message: string
	/**
	 * Label sheet basename under public/tooltip/ — a 4F boil sheet per
	 * language, `{label}_{en,ja}.webp`, drawn on the bubble's canvas for
	 * the corner's display orientation (it lays over unflipped, 1:1)
	 */
	label: string
	/** Flip to true to play the bubble out; `left` follows when it has */
	leaving?: boolean
}>()

const emit = defineEmits<{(e: 'left'): void}>()

const {locale} = useI18n()

// The sheet is picked per language at runtime, so the url lives on the
// element: inline style outranks the class's `background` shorthand
const labelStyle = computed(() => ({
	backgroundImage: `url('/animondo/tooltip/${props.label}_${locale.value}.webp')`,
}))

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
// A speech bubble hung off one of the round corner buttons, nudging the
// visitor toward a control they have not tried. The master (809x456,
// 12 fps: 0-3 appear from the tail, 4-7 loop) roots its tail at the
// BOTTOM-left; each corner flips the bubble so the tail points at its
// button, while the label sheets are drawn for that corner's flipped
// orientation and lay over it unflipped, 1:1 (ink must never mirror).
.nudge-tooltip
	position fixed
	z-index 110
	// Keep in step with the corner buttons' size in pages/index.vue
	--button unquote('clamp(4.5rem, 17vw, 7rem)')
	--tip-width unquote('clamp(8.25rem, 34.5vw, 11.25rem)')
	width var(--tip-width)
	aspect-ratio 809 / 456
	// Only an announcement: taps fall through to whatever is under it
	pointer-events none

	// Off the sound toggle's bottom-right corner (the button: 1rem inset
	// from the top-left). Flipped vertically the tail roots at the
	// TOP-left, its tip at ~12% / 6% of the box; back the box off by that
	// much so the tip lands on the toggle's corner.
	&--top-left
		top calc(1rem + var(--button) * 0.8)
		left calc(1rem + var(--button) * 0.8 - var(--tip-width) * 0.1)

	&--top-left &__bubble
		transform scaleY(-1)

	// Off the ? button's bottom-left corner (the button: 1rem inset from
	// the top-right). Rotated 180° the tail roots at the TOP-right, its
	// tip at ~88% / 6% of the box — i.e. 12% in from the right edge, the
	// mirror of the sound tooltip's placement on the left.
	&--top-right
		top calc(1rem + var(--button) * 0.8)
		right calc(1rem + var(--button) * 0.8 - var(--tip-width) * 0.1)

	&--top-right &__bubble
		transform scale(-1, -1)

	// Off the pads button's top-right corner (the button: 1rem inset from
	// the bottom-left). The master's own orientation already roots the
	// tail bottom-left, tip at ~12% / 94% — no flip.
	&--bottom-left
		bottom calc(1rem + var(--button) * 0.8)
		left calc(1rem + var(--button) * 0.8 - var(--tip-width) * 0.1)

	// The bubble's 8F sheet, paged by background-position — one decoded
	// image, nothing to flicker. The box keeps the canvas's aspect, so a
	// sheet frame fills it exactly; a flip flips each frame in place, the
	// strip's order untouched.
	&__bubble
		position absolute
		inset 0
		background url('/animondo/tooltip/bubble.webp') 0 0 / 800% 100% no-repeat
		animation nudge-tooltip-appear 0.3333s steps(1) forwards, nudge-tooltip-loop 0.3333s steps(1) 0.3333s infinite

	// Hidden while the bubble draws itself in: the boil only starts after
	// the appear's four frames, and every keyframe pins opacity back to 1.
	// The image itself comes from the inline style (per label x language).
	&__label
		position absolute
		inset 0
		opacity 0
		background 0 0 / 400% 100% no-repeat
		animation nudge-tooltip-label-boil 0.3333s steps(1) 0.3333s infinite

	// The exit: the draw-in backwards, the label gone at once (its base
	// opacity is 0). NudgeTooltip emits `left` when this has played out.
	// Its OWN keyframes, not the appear run in reverse: re-declaring a
	// finished animation's name never restarts it, so `reverse` on the
	// appear just snapped to its first frame.
	&--leaving &__bubble
		animation nudge-tooltip-disappear 0.3333s steps(1) forwards

	&--leaving &__label
		animation none

@keyframes nudge-tooltip-disappear
	0%
		background-position 42.8571% 0
	25%
		background-position 28.5714% 0
	50%
		background-position 14.2857% 0
	75%
		background-position 0% 0

@keyframes nudge-tooltip-appear
	0%
		background-position 0% 0
	25%
		background-position 14.2857% 0
	50%
		background-position 28.5714% 0
	75%
		background-position 42.8571% 0

@keyframes nudge-tooltip-loop
	0%
		background-position 57.1429% 0
	25%
		background-position 71.4286% 0
	50%
		background-position 85.7143% 0
	75%
		background-position 100% 0

@keyframes nudge-tooltip-label-boil
	0%
		opacity 1
		background-position 0% 0
	25%
		opacity 1
		background-position 33.3333% 0
	50%
		opacity 1
		background-position 66.6667% 0
	75%
		opacity 1
		background-position 100% 0
</style>
