<template>
	<Teleport to="body">
		<div v-if="open" class="about-modal" @click.self="$emit('close')">
			<div class="about-modal__panel">
				<header class="about-modal__header">
					<div class="about-modal__locales">
						<button
							:class="{'is-active': locale === 'en'}"
							@click="locale = 'en'"
						>
							EN
						</button>
						<button
							:class="{'is-active': locale === 'ja'}"
							@click="locale = 'ja'"
						>
							日本語
						</button>
					</div>
				</header>
				<div class="about-modal__body">
					<h1>{{ t('about.title') }}</h1>
					<p>{{ t('about.body') }}</p>
					<dl>
						<dt>{{ t('about.artists.label') }}</dt>
						<dd>{{ t('about.artists.list') }}</dd>
						<dt>{{ t('about.music.label') }}</dt>
						<dd>{{ t('about.music.value') }}</dd>
						<dt>{{ t('about.type.label') }}</dt>
						<dd>{{ t('about.type.value') }}</dd>
					</dl>
				</div>
			</div>
		</div>
	</Teleport>
</template>

<script setup lang="ts">
import {onKeyStroke} from '@vueuse/core'

const props = defineProps<{open: boolean}>()
const emit = defineEmits<{(e: 'close'): void}>()

const {locale, t} = useI18n()

onKeyStroke('Escape', () => {
	if (props.open) emit('close')
})
</script>

<style lang="stylus">
.about-modal
	position fixed
	inset 0
	z-index 100
	display flex
	align-items center
	justify-content center
	padding 2rem
	background rgba(255, 255, 255, 0.96)
	overflow-y auto

	&__panel
		width 100%
		max-width 36rem
		color black
		line-height 1.7

	&__header
		display flex
		align-items center
		margin-bottom 1.5rem

	&__locales
		display flex
		gap 0.5rem

		button
			padding 0.25rem 0.75rem
			border 1px solid black
			border-radius 0.5rem
			background transparent
			font-size 0.85rem
			line-height 1.4
			cursor pointer

			&.is-active
				background black
				color white

			&:hover:not(.is-active)
				background rgba(0, 0, 0, 0.06)

	&__body
		h1
			margin 0 0 1rem
			font-size 1.75rem
			line-height 1.3

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
</style>
