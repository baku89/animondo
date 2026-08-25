<template>
	<Teleport to="body">
		<div
			v-if="open"
			class="about-modal"
			@pointerdown="onPointerDown"
			@click.self="onBackdropClick"
		>
			<div class="about-modal__panel">
				<header class="about-modal__header">
					<LocaleSwitch />
				</header>
				<div class="about-modal__body">
					<h1 class="about-modal__title">
						<span class="visually-hidden">{{ t('about.title') }}</span>
						<AnimondoTitle />
					</h1>
					<!-- The string is this repo's own (useI18n), and the only
						markup is the wordmark's em — no third-party input
						reaches this sink. -->
					<!-- eslint-disable vue/no-v-html -->
					<p v-html="bodyHtml" />
					<!-- eslint-enable vue/no-v-html -->
					<!-- The recording, offered right after the concept: the drawn
						YouTube frame and its word on one centred line. Icon and
						text are separate links (a button cannot nest in a link),
						the same pairing as the unsupported screen's. -->
					<div
						class="about-modal__youtube"
						:class="{'about-modal__youtube--hover': youtubeHover}"
					>
						<!-- Hover runs both ways: pointing at either the icon or
							the caption re-inks the pair in YouTube's red -->
						<CircleIcon
							:glyph="PLAY_SHEET"
							:outline="YOUTUBE_SHEET"
							:aspect="1000 / 800"
							size="3.5rem"
							state="fixed"
							:label="t('tap.youtube')"
							:href="YOUTUBE_URL"
							:hover="youtubeHover"
							:tint="YOUTUBE_RED"
							@pointerenter="youtubeHover = true"
							@pointerleave="youtubeHover = false"
						/>
						<!-- Pointing at the caption lights the icon up too -->
						<a
							:href="YOUTUBE_URL"
							target="_blank"
							rel="noopener"
							@pointerenter="youtubeHover = true"
							@pointerleave="youtubeHover = false"
						>
							{{ t('tap.youtube') }}&thinsp;&#8599;
						</a>
					</div>
					<dl>
						<dt>{{ t('about.artists.label') }}</dt>
						<dd>{{ names('about.artists.list') }}</dd>
						<dt>{{ t('about.music.label') }}</dt>
						<dd>{{ t('about.music.value') }}</dd>
						<dt>{{ t('about.dev.label') }}</dt>
						<dd>{{ t('about.dev.value') }}</dd>
						<dt>{{ t('about.curators.label') }}</dt>
						<dd>{{ names('about.curators.value') }}</dd>
						<dt>{{ t('about.recording.label') }}</dt>
						<dd>{{ names('about.recording.value') }}</dd>
						<dt>{{ t('about.mentors.label') }}</dt>
						<dd>{{ names('about.mentors.value') }}</dd>
						<dt>{{ t('about.thanks.label') }}</dt>
						<dd>{{ names('about.thanks.value') }}</dd>
						<dt>{{ t('about.type.label') }}</dt>
						<dd>{{ t('about.type.value') }}</dd>
					</dl>
					<!-- Supported by closes the bill: the wording set in type,
						the credit also drawn — an animated WebP
						(scripts/build-logos.sh) loops the logos' boil on its own -->
					<section class="about-modal__support">
						<p class="about-modal__framework">{{ t('about.framework') }}</p>
						<p class="about-modal__supported">
							{{ t('about.support.label') }} {{ t('about.support.value') }}
						</p>
						<!-- Bound, not a plain src: Vite rewrites static srcs into
							imports and cannot resolve the baseURL-prefixed path -->
						<img
							class="about-modal__logos"
							:src="'/animondo/logos.webp'"
							:alt="t('about.support.value')"
						/>
					</section>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {onKeyStroke} from '@vueuse/core'

import type {MessageKey} from '~/composables/useI18n'
import {PLAY_SHEET, YOUTUBE_SHEET} from '~/composables/useSpritePlayer'
import {YOUTUBE_RED, YOUTUBE_URL} from '~/utils/links'

const props = defineProps<{open: boolean}>()
const emit = defineEmits<{(e: 'close'): void}>()

const {t} = useI18n()

// The wordmark is a proper noun and wants an italic neither typeface
// carries; a skew on an inline-block stands in for one (see the style
// below). Applied here so every occurrence in the body gets it.
const bodyHtml = computed(() =>
	t('about.body').replaceAll(
		'Animondo',
		'<em class="about-modal__wordmark">Animondo</em>'
	)
)

// The caption link beside the YouTube icon, mirrored into its hover
const youtubeHover = ref(false)

const SEPARATOR = ' \u00b7 '

// Nobody in the credits outranks anybody, so no line keeps a billing
// order: every list is dealt afresh each time the panel opens. One
// permutation per list per opening, shared by both languages, so
// switching locale mid-view keeps everyone in place.
const SHUFFLED_KEYS: MessageKey[] = [
	'about.artists.list',
	'about.curators.value',
	'about.recording.value',
	'about.mentors.value',
	'about.thanks.value',
]

// Kagan Hotel is the house that lent the recording its floor, not a peer
// standing in line: the thanks close on it however the people fall.
const PINNED_TAIL = new Set<MessageKey>(['about.thanks.value'])

const orders = ref<Partial<Record<MessageKey, number[]>>>({})

watch(
	() => props.open,
	open => {
		if (!open) return
		const dealt: Partial<Record<MessageKey, number[]>> = {}
		for (const key of SHUFFLED_KEYS) {
			const count = t(key).split(SEPARATOR).length
			const order = Array.from({length: count}, (_, i) => i)
			// A pinned name sits out the deal, so the shuffle stops short
			const loose = PINNED_TAIL.has(key) ? count - 1 : count
			for (let i = loose - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1))
				;[order[i], order[j]] = [order[j]!, order[i]!]
			}
			dealt[key] = order
		}
		orders.value = dealt
	},
	{immediate: true}
)

// Names are the one thing in these lists that must not break mid-way; the
// middle dots stay breakable so a long list still wraps.
function names(key: MessageKey) {
	const list = t(key).split(SEPARATOR)
	if (list.length < 2) return t(key)
	// A permutation dealt for the other language is no use if that list
	// names a different number of people
	const order = orders.value[key]
	const dealt = order?.length === list.length ? order.map(i => list[i]!) : list
	return dealt.map(name => name.replace(/ /g, '\u00a0')).join(SEPARATOR)
}

// The credits are there to be copied, so a drag that selects them must
// survive: a press that starts on a name and lifts on the backdrop still
// reports the overlay as the click's target, and closing there would snatch
// the panel away mid-selection. Only a press that both begins and ends on
// the backdrop, leaving nothing selected, counts as a click-away.
let pressedBackdrop = false

function onPointerDown(event: PointerEvent) {
	pressedBackdrop = event.target === event.currentTarget
}

function onBackdropClick() {
	if (!pressedBackdrop) return
	const selection = window.getSelection()
	if (selection && !selection.isCollapsed) return
	emit('close')
}

onKeyStroke('Escape', () => {
	if (props.open) emit('close')
})
</script>

<style lang="stylus">
.about-modal
	position fixed
	inset 0
	z-index 100
	// The bottom clears the pads button (1rem inset + its clamp height +
	// 1rem air), so the scrolled-out end of the text never sits under it
	padding 2rem 2rem calc(2rem + clamp(4.5rem, 17vw, 7rem))
	overflow-y auto
	// Scroll, but no double-tap zoom (pinch is refused app-wide in app.vue)
	touch-action pan-y

	// The crayon veil (see scripts/build-fade-mask.sh): white with the
	// grain's inverted luma for alpha, so the stage breathes through the
	// wash — the master's greys carry most of the strength (its mean lands
	// the veil at ~0.77); the opacity backs it off a touch further, kept in
	// step with FOCUS_DIM in pages/index.vue. Its own layer, fixed so the
	// content scrolls over it; z-index -1 keeps it under the panel within
	// the modal's stacking context. The tile is drawn at
	// half the master's size (drawn at 2x for HiDPI) and its position
	// re-rolls at 12 fps — the same boil as the shader-side veil, done with
	// a cycle of eight pre-rolled offsets since CSS cannot throw dice.
	// One veil copy over a plain white wash: the color layer sits under the
	// image, so it lifts the CLEAREST parts of the grain most — the flecks
	// go from ~0.2 to ~0.6 opacity, the greys to ~0.89, the black to solid —
	// without touching the grain's own contrast. The wash's alpha is the
	// knob. The shader side (FOCUS_DIM) keeps the bare mask; this lift is
	// the About panel's own.
	&::before
		content ''
		position fixed
		inset 0
		z-index -1
		background rgba(255, 255, 255, 0.5) url('/animondo/fade-mask.webp') left top repeat
		background-size 568.25px 363.75px
		opacity 0.98
		animation about-veil-boil 0.6667s steps(1) infinite
		pointer-events none

	&__panel
		width 100%
		max-width var(--panel-width)
		margin 0 auto
		color black
		line-height 1.7
		// The one place in the piece where words are read rather than
		// watched — names, titles and links here are meant to be copied
		user-select text
		-webkit-user-select text

	// Fixed top-center: both top corners are taken by the round sound/close
	// buttons, which float above the modal — and the switch sits centred on
	// their line (top 1rem + half their clamp height). The words size in
	// em, so the font-size is the scale — 120% of the old 0.8rem.
	&__header
		position fixed
		top calc(1rem + clamp(4rem, 15vw, 6rem) / 2)
		left 50%
		transform translate(-50%, -50%)
		font-size 0.96rem

	&__body
		.about-modal__title
			width var(--title-width)
			// Land the ink's horizontal axis at ~40svh: back off the overlay
			// padding and half the title's own height (aspect 838:214).
			margin-top unquote('max(0rem, calc(40svh - 2rem - var(--title-width) * 107 / 838))')
			margin-bottom 6rem

		// Blocks breathe two lines apart — the panel reads as pages, not a form
		p
			margin 0 0 2lh

		// The recording's line: drawn frame and word, centred together
		.about-modal__youtube
			display flex
			align-items center
			justify-content center
			margin 0 0 2lh

			a
				// The caption abuts the icon (padding, not flex gap), so the
				// cursor and the pair's shared red hold steady across the pair
				padding-left 0.75rem

				&:hover
					text-decoration underline

			// The pair's shared hover: the caption takes YouTube's red along
			// with the icon's re-inked frame (see YOUTUBE_RED)
			&--hover a
				color #ff0000
				text-decoration underline

		dl
			display grid
			grid-template-columns max-content 1fr
			gap 0.5rem 1.5rem
			margin 0

			dt
				font-weight bold
				white-space nowrap

			dd
				margin 0

			// Narrow screens: the label stacks on top of its value — beside
			// it, the values are squeezed into slivers
			@media (max-width: 480px)
				grid-template-columns 1fr
				row-gap 0.25rem

				dt:not(:first-child)
					margin-top 0.75rem

		// The partner logos close the bill at the body's full measure.
		// Two quiet lines above place the piece in its residency and say
		// the support in words, not only marks.
		.about-modal__support
			margin-top 2lh

		// The wordmark leans on the browser's synthetic italic — the Sprat
		// family ships no italic cut at all (width/weight axes only), and
		// synthesis is verified to slant the local OTFs in Chrome. Same
		// mechanism as the profile bubble's work titles, so the two lean
		// alike. NOTE: `oblique <angle>` parses but renders upright in
		// Chrome — keep plain `italic`.
		.about-modal__wordmark
			font-style italic

		.about-modal__framework,
		.about-modal__supported
			margin 0 0 1rem
			font-size 0.85rem

		.about-modal__logos
			display block
			width 100%
			height auto

@keyframes about-veil-boil
	0%
		background-position 0px 0px
	12.5%
		background-position -1741px -353px
	25%
		background-position -872px -1109px
	37.5%
		background-position -2027px -691px
	50%
		background-position -477px -244px
	62.5%
		background-position -1264px -1338px
	75%
		background-position -158px -876px
	87.5%
		background-position -1936px -1214px
</style>
