<template>
	<!-- The whole overlay starts the piece; the icon only says where to look -->
	<div
		class="title-sequence"
		:class="{'title-sequence--started': started}"
		@click="onStart"
	>
		<div class="title-sequence__stage">
			<AnimondoTitle :leaving="started" @left="emit('done')" />
			<CircleIcon
				v-if="ready && playPresent"
				class="title-sequence__start"
				:glyph="PLAY_SHEET"
				size="clamp(3.5rem, 14vw, 8rem)"
				state="fixed"
				:label="t('tap.title')"
				:leaving="started"
				@left="playPresent = false"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import {PLAY_SHEET} from '~/composables/useSpritePlayer'

const props = defineProps<{
	/** Reveal the start button — the caller decides when everything is loaded. */
	ready: boolean
}>()

const emit = defineEmits<{(e: 'start' | 'done'): void}>()

const {t} = useI18n()

const started = ref(false)
// Kept mounted after the tap so the drawn exit can play itself out
const playPresent = ref(true)

function onStart() {
	// The button sits inside the overlay, so its click arrives here too
	if (!props.ready || started.value) return

	// Emitted straight out of the click handler so the caller still holds the
	// user gesture that starting audio depends on.
	started.value = true
	emit('start')
}
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
</style>
