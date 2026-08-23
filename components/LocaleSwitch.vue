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

// The circle's frames are only requested when a switch first lands on a
// word; preload everything so neither the words nor the draw-in flicker.
// Keyed, so the About modal's switch and the bubble's dedupe their links.
const FRAMES = {en: 4, ja: 4, circle: 8} as const

useHead({
	link: Object.entries(FRAMES).flatMap(([part, count]) =>
		Array.from({length: count}, (_, i) => ({
			key: `lang-${part}-${i}`,
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/lang/${part}_${i}.webp`,
		}))
	),
})
</script>

<style lang="stylus">
.locale-switch
	display flex
	gap 1em

	// Hand-drawn words on the lang_* 256x128 canvases, boiling at 12 fps.
	// Sized in em, so the host sets the scale with font-size alone.
	&__word
		position relative
		width 4em
		height 2em
		padding 0
		border none
		background url('/animondo/lang/en_0.webp') center / contain no-repeat
		animation lang-en-boil 0.3333s steps(1) infinite
		cursor pointer

		&--ja
			background url('/animondo/lang/ja_0.webp') center / contain no-repeat
			animation lang-ja-boil 0.3333s steps(1) infinite

		&:hover:not([aria-pressed='true'])
			opacity 0.6

	// The circle shares the words' canvas, so it lands 1:1 on the word:
	// draw-in once (frames 0-3), then boil (4-7)
	&__circle
		position absolute
		inset 0
		background url('/animondo/lang/circle_0.webp') center / contain no-repeat
		animation lang-circle-appear 0.3333s steps(1) forwards, lang-circle-loop 0.3333s steps(1) 0.3333s infinite
		pointer-events none

@keyframes lang-en-boil
	0%
		background-image url('/animondo/lang/en_0.webp')
	25%
		background-image url('/animondo/lang/en_1.webp')
	50%
		background-image url('/animondo/lang/en_2.webp')
	75%
		background-image url('/animondo/lang/en_3.webp')

@keyframes lang-ja-boil
	0%
		background-image url('/animondo/lang/ja_0.webp')
	25%
		background-image url('/animondo/lang/ja_1.webp')
	50%
		background-image url('/animondo/lang/ja_2.webp')
	75%
		background-image url('/animondo/lang/ja_3.webp')

@keyframes lang-circle-appear
	0%
		background-image url('/animondo/lang/circle_0.webp')
	25%
		background-image url('/animondo/lang/circle_1.webp')
	50%
		background-image url('/animondo/lang/circle_2.webp')
	75%
		background-image url('/animondo/lang/circle_3.webp')

@keyframes lang-circle-loop
	0%
		background-image url('/animondo/lang/circle_4.webp')
	25%
		background-image url('/animondo/lang/circle_5.webp')
	50%
		background-image url('/animondo/lang/circle_6.webp')
	75%
		background-image url('/animondo/lang/circle_7.webp')
</style>
