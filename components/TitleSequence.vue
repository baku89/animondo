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
				recording instead of to the piece. -->
			<div v-if="unsupported" class="title-sequence__offsite">
				<CircleIcon
					:glyph="PLAY_SHEET"
					size="clamp(3.5rem, 14vw, 8rem)"
					state="fixed"
					:label="t('tap.youtube')"
					:href="YOUTUBE_URL"
				/>
				<a :href="YOUTUBE_URL" target="_blank" rel="noopener">
					{{ t('tap.youtube') }}&thinsp;&#8599;
				</a>
				<p>{{ t('tap.unsupported') }}</p>
			</div>
			<CircleIcon
				v-else-if="ready && playPresent"
				class="title-sequence__start"
				:glyph="PLAY_SHEET"
				size="clamp(3.5rem, 14vw, 8rem)"
				state="fixed"
				:label="t('tap.title')"
				:leaving="started"
				@left="playPresent = false"
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

import {PLAY_SHEET} from '~/composables/useSpritePlayer'

const props = withDefaults(
	defineProps<{
		/** Reveal the start button — the caller decides when everything is loaded. */
		ready: boolean
		/** This browser cannot run the piece: offer the recording instead. */
		unsupported?: boolean
	}>(),
	{unsupported: false}
)

// The recording, for visitors whose browser cannot run the piece itself
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=REPLACE_WITH_VIDEO_ID'

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
// on this screen.
useHead(() => ({
	link: [0, 1, 2, 3].flatMap(i =>
		(['en', 'ja'] as const).map(lang => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/label/${
				isCoarsePointer.value ? 'tap' : 'click'
			}-to-play_${lang}_${i}.webp`,
		}))
	),
}))

const started = ref(false)
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

	// Fixed top-centre, the same berth the About panel gives its switch —
	// the corners belong to the round buttons. The words size in em, so the
	// font-size is the 80% scale.
	&__lang
		position fixed
		top 2rem
		left 50%
		transform translateX(-50%)
		cursor default
		font-size 0.8rem

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
		top calc(100% + 2rem)
		left 50%
		translate -50% 0

	// The hand-drawn hint, quietly under the button (387x122, 12 fps, 4F
	// boil — scripts/build-label-frames.sh). Sized so its ink weight sits
	// near the tooltip's, and dimmed: it whispers what the button already is.
	&__hint
		position absolute
		top calc(100% + 2rem + clamp(3.5rem, 14vw, 8rem) + 1rem)
		left 50%
		translate -50% 0
		width clamp(5rem, 20vw, 6.5rem)
		aspect-ratio 387 / 122
		opacity 0.55
		pointer-events none
		background center / contain no-repeat
		animation title-hint-click-en 0.3333s steps(1) infinite

		&--click-ja
			animation-name title-hint-click-ja

		&--tap-en
			animation-name title-hint-tap-en

		&--tap-ja
			animation-name title-hint-tap-ja

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

@keyframes title-hint-click-en
	0%
		background-image url('/animondo/label/click-to-play_en_0.webp')
	25%
		background-image url('/animondo/label/click-to-play_en_1.webp')
	50%
		background-image url('/animondo/label/click-to-play_en_2.webp')
	75%
		background-image url('/animondo/label/click-to-play_en_3.webp')

@keyframes title-hint-click-ja
	0%
		background-image url('/animondo/label/click-to-play_ja_0.webp')
	25%
		background-image url('/animondo/label/click-to-play_ja_1.webp')
	50%
		background-image url('/animondo/label/click-to-play_ja_2.webp')
	75%
		background-image url('/animondo/label/click-to-play_ja_3.webp')

@keyframes title-hint-tap-en
	0%
		background-image url('/animondo/label/tap-to-play_en_0.webp')
	25%
		background-image url('/animondo/label/tap-to-play_en_1.webp')
	50%
		background-image url('/animondo/label/tap-to-play_en_2.webp')
	75%
		background-image url('/animondo/label/tap-to-play_en_3.webp')

@keyframes title-hint-tap-ja
	0%
		background-image url('/animondo/label/tap-to-play_ja_0.webp')
	25%
		background-image url('/animondo/label/tap-to-play_ja_1.webp')
	50%
		background-image url('/animondo/label/tap-to-play_ja_2.webp')
	75%
		background-image url('/animondo/label/tap-to-play_ja_3.webp')
</style>
