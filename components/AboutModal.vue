<template>
	<Teleport to="body">
		<div v-if="open" class="about-modal" @click.self="$emit('close')">
			<div class="about-modal__panel">
				<header class="about-modal__header">
					<LocaleSwitch />
				</header>
				<div class="about-modal__body">
					<h1 class="about-modal__title">
						<span class="visually-hidden">{{ t('about.title') }}</span>
						<AnimondoTitle />
					</h1>
					<p>{{ t('about.body') }}</p>
					<dl>
						<dt>{{ t('about.artists.label') }}</dt>
						<dd>{{ names('about.artists.list') }}</dd>
						<dt>{{ t('about.music.label') }}</dt>
						<dd>{{ t('about.music.value') }}</dd>
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
						<dt>{{ t('about.support.label') }}</dt>
						<dd>{{ t('about.support.value') }}</dd>
					</dl>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {onKeyStroke} from '@vueuse/core'

import type {MessageKey} from '~/composables/useI18n'

const props = defineProps<{open: boolean}>()
const emit = defineEmits<{(e: 'close'): void}>()

const {t} = useI18n()

// Names are the one thing in these lists that must not break mid-way; the
// middle dots stay breakable so a long list still wraps.
function names(key: MessageKey) {
	const list = t(key).split(' \u00b7 ')
	if (list.length < 2) return t(key)
	return list.map(name => name.replace(/ /g, '\u00a0')).join(' \u00b7 ')
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
	padding 2rem
	overflow-y auto

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
	&::before
		content ''
		position fixed
		inset 0
		z-index -1
		background url('/animondo/fade-mask.webp') left top repeat
		background-size 1136.5px 727.5px
		opacity 0.98
		animation about-veil-boil 0.6667s steps(1) infinite
		pointer-events none

	&__panel
		width 100%
		max-width var(--panel-width)
		margin 0 auto
		color black
		line-height 1.7

	// Fixed top-center: both top corners are taken by the round sound/close
	// buttons, which float above the modal. The switch's words size in em,
	// so the font-size is the 80% scale.
	&__header
		position fixed
		top 2rem
		left 50%
		transform translateX(-50%)
		font-size 0.8rem

	&__body
		.about-modal__title
			width var(--title-width)
			// Land the ink's horizontal axis at ~40svh: back off the overlay
			// padding and half the title's own height (aspect 838:214).
			margin-top unquote('max(0rem, calc(40svh - 2rem - var(--title-width) * 107 / 838))')
			margin-bottom 3rem

		p
			margin 0 0 1.5rem

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
