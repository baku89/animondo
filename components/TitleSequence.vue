<template>
	<!-- The whole overlay starts the piece; the icon only says where to look -->
	<div
		class="title-sequence"
		:class="{'title-sequence--started': started}"
		@click="onStart"
	>
		<div class="title-sequence__stage">
			<canvas ref="ink" class="title-sequence__ink" />
			<Transition name="title-start">
				<button
					v-if="ready && !started"
					class="title-sequence__start"
					:aria-label="t('tap.title')"
					:title="t('tap.title')"
				>
					<svg
						class="title-sequence__play"
						viewBox="0 0 24 24"
						aria-hidden="true"
					>
						<path d="M9 6 18 12 9 18Z" />
					</svg>
				</button>
			</Transition>
		</div>
	</div>
</template>

<script setup lang="ts">
import {useElementSize, useIntervalFn} from '@vueuse/core'

const props = defineProps<{
	/** Reveal the start button — the caller decides when everything is loaded. */
	ready: boolean
}>()

const emit = defineEmits<{(e: 'start' | 'done'): void}>()

const {t} = useI18n()

// Written by scripts/build-title-sprite.sh. The path carries the baseURL the
// same way useVideoTexture does, so dev and the deployed site agree.
const SPRITE_URL = '/animondo/title-sprite.webp'

const COLUMNS = 7
const CELL_WIDTH = 838
const CELL_HEIGHT = 214

// Source frames at 12 fps:
//   0..20   the title writes itself in, once
//   22..30  a held loop, waiting for the visitor
//   31..48  the ink is wiped away
const INTRO_END = 20
const LOOP_START = 22
const LOOP_END = 30
const LAST_FRAME = 48

type Phase = 'intro' | 'idle' | 'outro' | 'done'

const frame = ref(0)
const phase = ref<Phase>('intro')
const started = ref(false)

const ink = useTemplateRef<HTMLCanvasElement>('ink')
const {width: inkWidth, height: inkHeight} = useElementSize(ink)
const sheet = ref<HTMLImageElement | null>(null)

// Drawing one cell keeps the browser scaling 838x214, instead of scaling the
// whole 5866x1498 sheet to cover a box seven times the title — a ~29 megapixel
// intermediate on a 2x screen, which is where the ink edges were breaking up.
watchEffect(() => {
	const canvas = ink.value
	const image = sheet.value
	if (!canvas || !image || inkWidth.value === 0) return

	const dpr = window.devicePixelRatio || 1
	const width = Math.round(inkWidth.value * dpr)
	const height = Math.round(inkHeight.value * dpr)
	if (canvas.width !== width) canvas.width = width
	if (canvas.height !== height) canvas.height = height

	const context = canvas.getContext('2d')
	if (!context) return

	context.imageSmoothingEnabled = true
	context.imageSmoothingQuality = 'high'
	context.clearRect(0, 0, width, height)
	context.drawImage(
		image,
		(frame.value % COLUMNS) * CELL_WIDTH,
		Math.floor(frame.value / COLUMNS) * CELL_HEIGHT,
		CELL_WIDTH,
		CELL_HEIGHT,
		0,
		0,
		width,
		height
	)
})

const {pause, resume} = useIntervalFn(
	() => {
		switch (phase.value) {
			case 'intro':
				if (frame.value < INTRO_END) {
					frame.value++
				} else {
					phase.value = 'idle'
					frame.value = LOOP_START
				}
				break

			case 'idle':
				if (frame.value < LOOP_END) {
					frame.value++
				} else if (started.value) {
					// Only ever leave the loop from its final frame, so the wipe
					// picks up exactly where the held animation left off.
					phase.value = 'outro'
					frame.value = LOOP_END + 1
				} else {
					frame.value = LOOP_START
				}
				break

			case 'outro':
				if (frame.value < LAST_FRAME) {
					frame.value++
				} else {
					phase.value = 'done'
					pause()
					emit('done')
				}
				break
		}
	},
	1000 / 12,
	{immediate: false}
)

onMounted(() => {
	// Hold on frame 0 until the sheet is decoded, so the title does not open
	// mid-stroke on a slow connection.
	const image = new Image()
	image.onload = () => {
		sheet.value = image
		resume()
	}
	// Fail open — a missing sheet should not strand the visitor without a way
	// to start the piece.
	image.onerror = () => resume()
	image.src = SPRITE_URL
})

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
		width min(48rem, 86vw)
		aspect-ratio 838 / 214

	// Backing store is sized to device pixels in script; the sheet keeps its
	// own alpha, so the ink composites over the animation with no CSS mask.
	&__ink
		display block
		width 100%
		height 100%

	&__start
		position absolute
		top calc(100% + 2rem)
		left 50%
		translate -50% 0
		width 4.5rem
		height 4.5rem
		display flex
		align-items center
		justify-content center
		border 2px solid black
		border-radius 50%
		background white
		color black
		cursor pointer

		&:hover
			background black
			color white

	&__play
		width 1.4rem
		height 1.4rem
		fill currentColor
		// A triangle reads as off-centre when its bounding box is centred
		translate 0.12rem 0

// The button pops up under the finished title rather than fading in
.title-start-enter-active
	transition opacity 0.35s ease, translate 0.45s cubic-bezier(0.2, 1.5, 0.4, 1)

.title-start-leave-active
	transition opacity 0.2s ease

.title-start-enter-from
	opacity 0
	// Keeps the -50% that centres the button under the title
	translate -50% 1.5rem

.title-start-leave-to
	opacity 0
</style>
