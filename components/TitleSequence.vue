<template>
	<!-- The whole overlay starts the piece; the icon only says where to look -->
	<div
		class="title-sequence"
		:class="{
			'title-sequence--started': started,
			'title-sequence--unsupported': unsupported,
		}"
		@click="onStart"
	>
		<!-- The language can be chosen before the piece starts; picking one
			must not start it, so the click stops here -->
		<div class="title-sequence__lang" @click.stop>
			<LocaleSwitch />
		</div>
		<div class="title-sequence__stage">
			<AnimondoTitle :leaving="started" @left="emit('done')" />
			<!-- Nothing here can dance, so the same button leads to the
				recording instead of to the piece: the play glyph centred in
				the hand-drawn YouTube frame (5:4, so the box widens past
				`size`). -->
			<div
				v-if="unsupported"
				class="title-sequence__offsite"
				:class="{'title-sequence__offsite--hover': linkHover}"
			>
				<!-- Hover runs both ways: pointing at either the icon or the
					caption re-inks the pair in YouTube's red -->
				<CircleIcon
					:glyph="PLAY_SHEET"
					:outline="YOUTUBE_SHEET"
					:aspect="1000 / 800"
					size="clamp(4.5rem, 17vw, 7rem)"
					state="fixed"
					:label="t('tap.youtube')"
					:href="YOUTUBE_URL"
					:hover="linkHover"
					:tint="YOUTUBE_RED"
					@pointerenter="linkHover = true"
					@pointerleave="linkHover = false"
				/>
				<!-- Pointing at the caption lights the icon up too -->
				<a
					:href="YOUTUBE_URL"
					target="_blank"
					rel="noopener"
					@pointerenter="linkHover = true"
					@pointerleave="linkHover = false"
				>
					{{ t('tap.youtube') }}&thinsp;&#8599;
				</a>
				<p>{{ t('tap.unsupported') }}</p>
			</div>
			<CircleIcon
				v-else-if="ready && playPresent"
				class="title-sequence__start"
				:glyph="PLAY_SHEET"
				size="clamp(4.5rem, 17vw, 7rem)"
				state="fixed"
				:label="t('tap.title')"
				:leaving="started"
				@left="playPresent = false"
			/>
			<!-- While the manifest downloads: the hand-drawn dots boil where
				the button will land. The !ready guard keeps them from coming
				back through this else-if once the tapped button has played
				itself out (playPresent false, ready still true). -->
			<div
				v-else-if="!unsupported && !ready"
				class="title-sequence__loading"
				aria-hidden="true"
			/>
			<!-- Hand-drawn "tap/click to play" under the button — decorative,
				the button's label already says it. Coarse pointers tap. -->
			<div
				v-if="!unsupported && hintVisible && playPresent"
				class="title-sequence__hint"
				:class="`title-sequence__hint--${isCoarsePointer ? 'tap' : 'click'}-${locale}`"
				aria-hidden="true"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import {useEventListener, useMediaQuery, useTimeoutFn} from '@vueuse/core'

import {PLAY_SHEET, YOUTUBE_SHEET} from '~/composables/useSpritePlayer'
import {YOUTUBE_URL} from '~/utils/links'

const props = withDefaults(
	defineProps<{
		/** Reveal the start button — the caller decides when everything is loaded. */
		ready: boolean
		/** This browser cannot run the piece: offer the recording instead. */
		unsupported?: boolean
	}>(),
	{unsupported: false}
)

const emit = defineEmits<{(e: 'start' | 'done'): void}>()

const {t, locale} = useI18n()

// Which verb the hint shows: coarse pointers tap, fine ones click — the
// same line the launchpad draws
const isCoarsePointer = useMediaQuery('(pointer: coarse)')

// The hint holds back until the button's draw-in is about halfway through
// (appear runs 6 frames at 12 fps), then joins it mid-stroke.
const hintVisible = ref(false)
const {start: revealHint} = useTimeoutFn(
	() => (hintVisible.value = true),
	(3 / 12) * 1000,
	{immediate: false}
)
watch(
	() => props.ready,
	ready => {
		if (ready) revealHint()
	},
	{immediate: true}
)

// The hint appears the instant `ready` flips; without a preload its boil
// frames would trickle in piecemeal. Both languages: the switch sits right
// on this screen. The loading dots ride the same list — they are the very
// first thing on screen, ahead of the manifest they narrate.
useHead(() => ({
	link: [
		...(['en', 'ja'] as const).map(lang => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/label/${
				isCoarsePointer.value ? 'tap' : 'click'
			}-to-play_${lang}.webp`,
		})),
		{
			rel: 'preload',
			as: 'image' as const,
			href: '/animondo/loading/loading.webp',
		},
	],
}))

const started = ref(false)
// One hover for the pair: the caption link and the YouTube icon light
// each other up, both taking the brand's red
const linkHover = ref(false)
const YOUTUBE_RED = '#ff0000'
// Kept mounted after the tap so the drawn exit can play itself out
const playPresent = ref(true)

function onStart() {
	// The button sits inside the overlay, so its click arrives here too
	if (!props.ready || started.value || props.unsupported) return

	// Emitted straight out of the click handler so the caller still holds the
	// user gesture that starting audio depends on.
	started.value = true
	emit('start')
}

// The keyboard starts the piece too, with the keys that activate a button.
// A keydown is a user gesture, so the audio can still start from it.
useEventListener('keydown', (event: KeyboardEvent) => {
	if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
	if (event.key !== ' ' && event.key !== 'Enter' && event.code !== 'Space') return
	// Activating the language switch is not starting the piece
	if (
		event.target instanceof HTMLElement &&
		event.target.closest('.title-sequence__lang')
	) {
		return
	}
	event.preventDefault()
	onStart()
})
</script>

<style lang="stylus">
.title-sequence
	position fixed
	inset 0
	z-index 10
	display flex
	align-items center
	justify-content center
	cursor pointer

	// Once the wipe is running the visitor is looking at the piece, not at us
	&--started
		pointer-events none

	// Nothing to start: only the link itself is worth clicking
	&--unsupported
		cursor default

	// Fixed top-right: the loading screen's right corner is free (the sound
	// toggle holds the left, the ? only arrives with the piece). Vertically
	// centred on the round buttons' line (their top 1rem + half their clamp
	// height), so switch and sound toggle share one axis. The words size in
	// em, so the font-size is the scale — 120% of the old 0.8rem.
	&__lang
		position fixed
		top calc(1rem + clamp(4rem, 15vw, 6rem) / 2)
		right 2rem
		transform translateY(-50%)
		cursor default
		font-size 0.96rem

	// The moment the play tap lands the switch is out of a job: a three-step
	// fade on the 12 fps grid, like everything else drawn here
	&--started &__lang
		animation title-lang-fade 0.25s steps(3) forwards

	// A fixed-size stage so losing the button cannot shift the title: the
	// stage stays centred whatever hangs off it.
	&__stage
		position relative
		width var(--title-width)
		aspect-ratio 838 / 214

	&__start
		position absolute
		top calc(100% + 3rem)
		left 50%
		translate -50% 0

	// The wait, drawn: the dots boil where the play button will land
	// (326x232, 12 fps, 9F sheet paged by background-position —
	// scripts/build-loading-frames.sh). Centred on the coming button's own
	// centre (its top + half its clamp height), so the handover doesn't hop.
	&__loading
		position absolute
		top calc(100% + 3rem + clamp(4.5rem, 17vw, 7rem) / 2)
		left 50%
		translate -50% -50%
		width clamp(3.5rem, 12vw, 5rem)
		aspect-ratio 326 / 232
		background url('/animondo/loading/loading.webp') 0 0 / 900% 100% no-repeat
		animation title-loading-boil 0.75s steps(1) infinite
		pointer-events none

	// The hand-drawn hint, quietly under the button (387x122, 12 fps, 4F
	// boil — scripts/build-label-frames.sh). Sized so its ink weight sits
	// near the tooltip's, and dimmed: it whispers what the button already is.
	&__hint
		position absolute
		top calc(100% + 3rem + clamp(4.5rem, 17vw, 7rem) + 0.25rem)
		left 50%
		translate -50% 0
		width clamp(6.5rem, 26vw, 8.45rem)
		aspect-ratio 387 / 122
		opacity 0.55
		pointer-events none
		// A 4F sheet paged by background-position; the variants differ only
		// by which sheet they page
		background url('/animondo/label/click-to-play_en.webp') 0 0 / 400% 100% no-repeat
		animation title-hint-boil 0.3333s steps(1) infinite

		&--click-ja
			background-image url('/animondo/label/click-to-play_ja.webp')

		&--tap-en
			background-image url('/animondo/label/tap-to-play_en.webp')

		&--tap-ja
			background-image url('/animondo/label/tap-to-play_ja.webp')

	// The tap has landed; the hint bows out on the same 12 fps grid
	&--started &__hint
		animation title-hint-fade 0.25s steps(3) forwards

	// Hung off the stage like the start button, so the title stays put
	&__offsite
		position absolute
		top calc(100% + 2rem)
		left 50%
		translate -50% 0
		display flex
		flex-direction column
		align-items center
		gap 1rem
		width 100%
		text-align center
		line-height 1.7

		a
			cursor pointer

			&:hover
				text-decoration underline

	// The pair's shared hover (set from either end): the caption takes
	// YouTube's red along with the icon's re-inked frame
	&__offsite--hover a
		color #ff0000
		text-decoration underline

		p
			font-size 0.85rem
			opacity 0.6

@keyframes title-lang-fade
	from
		opacity 1
	to
		opacity 0

@keyframes title-hint-fade
	from
		opacity 0.55
	to
		opacity 0

@keyframes title-loading-boil
	0%
		background-position 0% 0
	11.111%
		background-position 12.5% 0
	22.222%
		background-position 25% 0
	33.333%
		background-position 37.5% 0
	44.444%
		background-position 50% 0
	55.556%
		background-position 62.5% 0
	66.667%
		background-position 75% 0
	77.778%
		background-position 87.5% 0
	88.889%
		background-position 100% 0

@keyframes title-hint-boil
	0%
		background-position 0% 0
	25%
		background-position 33.3333% 0
	50%
		background-position 66.6667% 0
	75%
		background-position 100% 0
</style>
