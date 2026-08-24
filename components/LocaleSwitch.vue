<template>
	<div class="locale-switch">
		<!-- Hand-drawn words; the drawn circle lands on the chosen one,
			replaying its draw-in on every switch (v-if remounts it) -->
		<button
			v-for="l in LOCALES"
			:key="l"
			class="locale-switch__word"
			:class="`locale-switch__word--${l}`"
			:aria-label="l === 'en' ? 'English' : '日本語'"
			:aria-pressed="locale === l"
			@click="locale = l"
		>
			<span v-if="locale === l" class="locale-switch__circle" />
		</button>
	</div>
</template>

<script setup lang="ts">
const {locale} = useI18n()

const LOCALES = ['en', 'ja'] as const

// The circle's sheet is only requested when a switch first lands on a
// word; preload everything so neither the words nor the draw-in flicker.
// Keyed, so the About modal's switch and the bubble's dedupe their links.
useHead({
	link: ['en', 'ja', 'circle'].map(part => ({
		key: `lang-${part}`,
		rel: 'preload',
		as: 'image' as const,
		href: `/animondo/lang/${part}.webp`,
	})),
})
</script>

<style lang="stylus">
.locale-switch
	display flex
	gap 1em

	// Hand-drawn words on the lang_* 256x128 canvases, boiling at 12 fps.
	// Each animation is one SHEET (frames left to right) paged by
	// background-position — one decoded image, nothing to flicker. Sized in
	// em, so the host sets the scale with font-size alone; the box keeps the
	// canvas's 2:1, so a sheet frame fills it exactly.
	&__word
		position relative
		width 4em
		height 2em
		padding 0
		border none
		background url('/animondo/lang/en.webp') 0 0 / 400% 100% no-repeat
		animation lang-word-boil 0.3333s steps(1) infinite
		cursor pointer

		&--ja
			background-image url('/animondo/lang/ja.webp')

		&:hover:not([aria-pressed='true'])
			opacity 0.6

	// The circle shares the words' canvas, so it lands 1:1 on the word:
	// draw-in once (frames 0-3 of its 8F sheet), then boil (4-7)
	&__circle
		position absolute
		inset 0
		background url('/animondo/lang/circle.webp') 0 0 / 800% 100% no-repeat
		animation lang-circle-appear 0.3333s steps(1) forwards, lang-circle-loop 0.3333s steps(1) 0.3333s infinite
		pointer-events none

@keyframes lang-word-boil
	0%
		background-position 0% 0
	25%
		background-position 33.3333% 0
	50%
		background-position 66.6667% 0
	75%
		background-position 100% 0

@keyframes lang-circle-appear
	0%
		background-position 0% 0
	25%
		background-position 14.2857% 0
	50%
		background-position 28.5714% 0
	75%
		background-position 42.8571% 0

@keyframes lang-circle-loop
	0%
		background-position 57.1429% 0
	25%
		background-position 71.4286% 0
	50%
		background-position 85.7143% 0
	75%
		background-position 100% 0
</style>
