<template>
	<main>
		<TitleSequence
			v-if="titleVisible"
			:ready="assetsReady || startupFailed"
			:unsupported="startupFailed"
			@start="audio.start"
			@done="onTitleDone"
		/>
		<CircleIcon
			v-if="aboutVisible && aboutButtonShown"
			class="about-button"
			:glyph="ABOUT_SHEET"
			size="clamp(3rem, 10vw, 6rem)"
			:state="aboutOpen ? 'close' : 'about'"
			:label="aboutOpen ? t('about.close') : t('about.button.label')"
			:leaving="launchpadOpen"
			@click="aboutOpen = !aboutOpen"
			@left="aboutButtonShown = false"
		/>
		<CircleIcon
			v-if="soundVisible && soundButtonShown"
			class="sound-button"
			:glyph="SOUND_SHEET"
			size="clamp(3rem, 10vw, 6rem)"
			:state="audio.muted.value ? 'mute' : 'unmute'"
			:label="audio.muted.value ? t('sound.unmute') : t('sound.mute')"
			:leaving="launchpadOpen"
			@click="audio.toggleMuted"
			@left="soundButtonShown = false"
		/>
		<SoundTooltip
			v-if="soundTipVisible"
			:leaving="soundTipLeaving"
			@left="soundTipVisible = false"
		/>
		<ExploreTooltip
			v-if="exploreTipCell && exploreTipAt"
			:leaving="exploreTipLeaving"
			:style="exploreTipStyle"
			@left="exploreTipCell = null"
		/>
		<CircleIcon
			v-if="launchpadButtonVisible"
			class="launchpad-button"
			:glyph="PADS_SHEET"
			size="clamp(3rem, 10vw, 6rem)"
			:state="launchpadOpen ? 'close' : 'fixed'"
			:label="launchpadOpen ? t('launchpad.close') : t('launchpad.open')"
			@click="toggleLaunchpad"
		/>
		<PatternLaunchpad
			v-if="launchpadOpen"
			:queued-pad="patternControl.queuedPadId.value"
			:active-pad="patternControl.activePadId.value"
			:activation-seq="patternControl.activationSeq.value"
			@tap="patternControl.tapPad"
		/>
		<AboutModal :open="aboutOpen" @close="aboutOpen = false" />
		<canvas
			ref="canvas"
			class="canvas"
			:class="{'canvas--locked': !stageInteractive}"
		/>
		<!-- Beat-sync debug: flashes on every beat of the tapped grid -->
		<div v-if="beatFlash" class="beat-flash" />
		<Transition :css="false" @enter="onBubbleEnter" @leave="onBubbleLeave">
			<div
				v-if="selectedArtist"
				class="profile-bubble"
				:class="`profile-bubble--${bubbleSide}`"
				:style="bubbleStyle"
			>
				<!-- Hand-drawn glyphs carry the visuals; the labels stay for
					assistive tech -->
				<div class="profile-bubble__controls">
					<LocaleSwitch class="profile-bubble__lang" />
					<button
						class="profile-bubble__close"
						:aria-label="t('about.close')"
						@click="deselect"
					/>
				</div>
				<div class="profile-bubble__body">
					<header class="profile-bubble__header">
						<div class="profile-bubble__names">
							<span class="profile-bubble__name">{{
								selectedArtist.name[locale]
							}}</span>
							<span class="profile-bubble__name-alt">{{
								selectedArtist.name[otherLocale]
							}}</span>
						</div>
						<a
							class="profile-bubble__site"
							:href="selectedArtist.url[locale]"
							target="_blank"
							rel="noopener"
							:aria-label="t('bubble.site')"
						/>
					</header>
					<figure class="profile-bubble__work">
						<img
							:src="selectedArtist.work.image"
							:alt="selectedArtist.work.title[locale]"
						/>
						<figcaption>{{ workCaption }}</figcaption>
					</figure>
					<!-- Markdown rendered from content/artists/, authored in this
						repo — no third-party input reaches this sink. -->
					<!-- eslint-disable vue/no-v-html -->
					<div
						class="profile-bubble__text"
						v-html="selectedArtist.profileHtml[locale]"
					/>
					<!-- eslint-enable vue/no-v-html -->
				</div>
			</div>
		</Transition>
		<!-- Invisible copy of everything the bubbles will ever set in type, so
			Typekit's dynamic subsetting fetches the Ryumin glyphs on load
			instead of swapping them in when the first bubble opens. -->
		<!-- eslint-disable vue/no-v-html -->
		<div class="font-warmup" aria-hidden="true">
			<template v-for="artist in ARTISTS" :key="artist.id">
				<span>{{ artist.name.en }}{{ artist.name.ja }}</span>
				<span>{{ artist.work.title.en }}{{ artist.work.title.ja }}</span>
				<span v-html="artist.profileHtml.en" />
				<span v-html="artist.profileHtml.ja" />
			</template>
		</div>
		<!-- eslint-enable vue/no-v-html -->
	</main>
</template>

<script setup lang="ts">
import {
	useElementSize,
	useMediaQuery,
	useRafFn,
	useTimeoutFn,
	useWindowSize,
	whenever,
} from '@vueuse/core'

import TileFragmentShader from '~/components/shaders/tile.frag?raw'
import {useKawachiAudio} from '~/composables/useKawachiAudio'
import {usePatternControl} from '~/composables/usePatternControl'
import {ABOUT_SHEET, PADS_SHEET, SOUND_SHEET} from '~/composables/useSpritePlayer'
import type {TileRenderer} from '~/composables/useTileRenderer'
import {createTileRenderer} from '~/composables/useTileRenderer'
import {useZUI} from '~/composables/useZUI'
import {ARTISTS} from '~/utils/artists'
import {BEAT_TIMES} from '~/utils/beats'
import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'
import {Direction, moveToTileDisplay} from '~/utils/tile'
import {tileCenter} from '~/utils/tileCenters'
import {TileMap} from '~/utils/TileMap'

const canvas = useTemplateRef('canvas')

const audio = useKawachiAudio()
const {t, locale} = useI18n()

const aboutOpen = ref(false)

// The title writes itself in on load and wipes itself away once the visitor
// starts the piece, at which point it is dropped for good.
const titleVisible = ref(true)
const assetsReady = ref(false)

// Set when the piece cannot be set up after all — see startupError below.
// The title screen comes back holding the recording instead.
const startupFailed = ref(false)

// Nothing but the dance for the first moments — the ? arrives with the
// full flood on turn 5, together with the controls unlocking.
const aboutVisible = ref(false)

// The choreographed opening is watched, not steered: no pan, no zoom, no
// tapping dancers until the four rings have formed (end of turn 4).
const stageInteractive = ref(false)

function onTitleDone() {
	titleVisible.value = false
}

// The sound toggle waits for the play button to have drawn itself in, then
// arrives as its own beat rather than alongside it.
const soundVisible = ref(false)
const {start: revealSound} = useTimeoutFn(
	() => (soundVisible.value = true),
	1500,
	{immediate: false}
)
watch(
	assetsReady,
	ready => {
		if (ready) revealSound()
	},
	{immediate: true}
)

// --- "Sound on" tooltip ---

// A speech bubble off the sound toggle's corner, warning that the piece has
// audio. It appears as the toggle's draw-in lands (11 frames at 12 fps,
// overlapping the last two), stands for as long as the title screen does,
// and leaves when the visitor starts the piece.
const soundTipVisible = ref(false)
const soundTipLeaving = ref(false)

const {start: revealSoundTip} = useTimeoutFn(
	() => {
		if (!audio.hasStarted.value) soundTipVisible.value = true
	},
	(9 / 12) * 1000,
	{immediate: false}
)
watch(soundVisible, visible => {
	if (visible) revealSoundTip()
})
whenever(audio.hasStarted, () => {
	soundTipLeaving.value = true
})
// Nothing will ever sound on the failure screen
watch(startupFailed, failed => {
	if (failed) soundTipLeaving.value = true
})

// --- "Explore" tooltip ---

// Two turns after the stage unlocks, a dancer near the centre of the
// screen pipes up with the navigation hint (drag and scroll — pinch and
// swipe for coarse pointers), and falls quiet three seconds later. Any tap
// or opened panel dismisses it early: the visitor is already exploring.
const EXPLORE_TIP_FRAME = 48
const exploreTipCell = ref<[number, number] | null>(null)
const exploreTipLeaving = ref(false)
// The speaker's drawn centre in screen px, refreshed every drawn frame
const exploreTipAt = ref<[number, number] | null>(null)

const exploreTipStyle = computed<Record<string, string>>(() => {
	const at = exploreTipAt.value
	if (!at) return {}
	// The component turns the point into its own placement (tail-tip maths)
	return {'--speaker-x': `${at[0]}px`, '--speaker-y': `${at[1]}px`}
})

const {start: expireExploreTip} = useTimeoutFn(
	() => (exploreTipLeaving.value = true),
	3000,
	{immediate: false}
)

function revealExploreTip() {
	if (!tileMap || selection.value || aboutOpen.value || launchpadOpen.value) {
		return
	}

	// The balloon hangs up-right of its speaker, so aim a touch below and
	// left of the screen's centre and take the dancer drawn nearest that
	const world = zui.screenToWorld(
		window.innerWidth * 0.45,
		window.innerHeight * 0.6
	)
	const [px, py] = [Math.floor(world[0]), Math.floor(world[1])]
	let best: {cell: [number, number]; d: number} | null = null
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const candidate: [number, number] = [px + dx, py + dy]
			const centre = dancerCenter(candidate)
			if (!centre) continue
			const d = Math.hypot(centre[0] - world[0], centre[1] - world[1])
			if (!best || d < best.d) best = {cell: candidate, d}
		}
	}
	if (!best) return

	exploreTipLeaving.value = false
	exploreTipCell.value = best.cell
	expireExploreTip()
}

// The speaker keeps dancing: step its cell along the pattern's out at each
// turn (called right before nextStep, like advanceSelection), and let the
// bubble go if the dancer vanishes.
function advanceExploreTip() {
	const cell = exploreTipCell.value
	if (!cell || !tileMap) return

	const move = tileMap.currentPattern?.get(cell[0], cell[1])
	const delta = move ? DIRECTION_DELTA[move.out] : undefined
	if (!delta) {
		exploreTipLeaving.value = true
		return
	}
	exploreTipCell.value = [cell[0] + delta[0], cell[1] + delta[1]]
}

// Chase the ink, not the cell: the drawn centres move every frame, and the
// camera may be panning under the bubble
function updateExploreTip() {
	const cell = exploreTipCell.value
	if (!cell) return
	const centre = dancerCenter(cell)
	if (centre) {
		exploreTipAt.value = zui.worldToScreen(centre) as [number, number]
	}
}

// --- Pattern launchpad (mobile only) ---

// A full-screen grid of pads that queue patterns by touch. Coarse pointers
// only: on desktop the keyboard already plays this instrument.
const isCoarsePointer = useMediaQuery('(pointer: coarse)')
const launchpadRevealed = ref(false)
const launchpadOpen = ref(false)
const launchpadButtonVisible = computed(
	() => isCoarsePointer.value && launchpadRevealed.value
)

// The pads' button follows the ? as its own beat, like the sound toggle did
const {start: revealLaunchpad} = useTimeoutFn(
	() => (launchpadRevealed.value = true),
	1000,
	{immediate: false}
)
watch(aboutVisible, visible => {
	if (visible) revealLaunchpad()
})

// While the launchpad is open it owns the screen: the other buttons play
// themselves out and come back when it closes.
const aboutButtonShown = ref(true)
const soundButtonShown = ref(true)
watch(launchpadOpen, open => {
	if (!open) {
		aboutButtonShown.value = true
		soundButtonShown.value = true
	}
})

function toggleLaunchpad() {
	launchpadOpen.value = !launchpadOpen.value
	if (launchpadOpen.value) {
		// The grid takes the stage whole: nothing else stays open under it
		aboutOpen.value = false
		deselect()
	}
}

// A panel over the stage silences the explore hint with it (declared here,
// after both refs exist)
watch([aboutOpen, launchpadOpen], ([about, pads]) => {
	if ((about || pads) && exploreTipCell.value) exploreTipLeaving.value = true
})

let renderer: TileRenderer | null = null
let tileMap: TileMap | null = null

// The drawn size follows the element; the backing store is set from it
// (times devicePixelRatio) on every rendered frame, whichever thread draws
const {width: canvasWidth, height: canvasHeight} = useElementSize(canvas)

// Initialize ZUI for navigation
const zui = useZUI(canvas)

let currentFrame = 0

// --- Character selection & follow ---

// Cell coordinates are kept unwrapped so the camera pans continuously
// across the toroidal seam; wrap only when looking up the pattern/tiles.
const selection = ref<{cell: [number, number]; artistIndex: number} | null>(
	null
)

const selectedArtist = computed(() =>
	selection.value ? ARTISTS[selection.value.artistIndex] : null
)

// The name in the piece's other language sits under the current one
const otherLocale = computed(() => (locale.value === 'en' ? 'ja' : 'en'))

// Title and year of the representative work, quoted the local way
const workCaption = computed(() => {
	const artist = selectedArtist.value
	if (!artist) return ''
	const {title, year} = artist.work
	return locale.value === 'ja'
		? `『${title.ja}』（${year}）`
		: `${title.en} (${year})`
})

// How far the unwatched crowd fades toward the paper while a dancer is
// followed (shader-side mix toward white, scrubbed through the crayon
// veil below), and its eased current value. The veil's own alpha carries
// most of the wash (the mask's greys average ~0.77); this backs it off a
// touch further, kept in step with the About panel's veil opacity.
const FOCUS_DIM = 0.98
let focusDim = 0

// The crayon veil (public/fade-mask.webp) tiles at HALF the master's size
// in CSS pixels (the master is drawn at 2x for HiDPI); the texture itself
// is squeezed to 1024x512 for WebGL1's power-of-two repeat, so the scale
// stretches it back. Its offset re-rolls every 12 fps tick — the same
// hash-from-a-sine trick shaders use, keyed to the tick so every rendered
// frame within one tick agrees.
const FADE_MASK_TILE = [1136.5, 727.5]

function grainRoll(seed: number): number {
	const x = Math.sin(seed) * 43758.5453
	return x - Math.floor(x)
}

// Keyboard steering. The centre of the screen is resolved on demand rather
// than captured, so a pattern built around the middle of the grid keeps
// landing where the visitor is looking even after they pan. While a dancer
// is being watched, patterns that could swallow it are refused.
const patternControl = usePatternControl(
	() => zui.screenToWorld(window.innerWidth / 2, window.innerHeight / 2),
	() => selection.value !== null,
	() => launchpadOpen.value,
	() => stageInteractive.value
)

// --- Bubble placement ---

// Margins that keep the bubble off the screen edges and off the fixed UI
// (the ? button row along the top).
const BUBBLE_MARGIN = 16
const BUBBLE_TOP_CLEARANCE = 84
const BUBBLE_BOTTOM_CLEARANCE = 24
/** Air between the character's footprint and the bubble, tail included */
// Air between the character's extent and the bubble edge, in px. Scales
// with the zoom so a zoomed-out dancer keeps the bubble snug instead of
// floating a fixed distance away.
const BUBBLE_GAP_MAX = 10
const BUBBLE_MAX_WIDTH = 480
/** Below this, a side-by-side layout is not worth the squeeze */
const BUBBLE_MIN_WIDTH = 288
// The least height a stacked (top/bottom) bubble is guaranteed: a 3:5 box
// on its own width, capped at 70svh. Squeezed flatter than this the bubble
// reads as all scroll, so the character gets pushed aside instead.
const BUBBLE_MIN_HEIGHT_RATIO = 5 / 3
const BUBBLE_MAX_HEIGHT_SVH = 0.7

/** Where the bubble sits relative to the followed character */
type BubbleSide = 'top' | 'bottom' | 'left' | 'right'
const bubbleSide = ref<BubbleSide>('top')

// The dancer's on-screen position at the moment of the tap. The camera
// moves it as little as possible: the cross axis stays put (clamped so the
// tail can still reach it), and the main axis is only pushed as far as the
// bubble needs its minimum footprint — a dancer tapped mid-screen with room
// to spare simply stays there.
const bubbleCharAt = ref<[number, number]>([0, 0])
/** How close to a bubble corner the tail's centre may slide */
const TAIL_INSET = 44
/** Border-image band width; the tail is positioned inside the padding box */
const BUBBLE_BORDER = 16
// Measured on enter; the left/right layouts need it to clamp the box into
// the viewport without a translate(-50%) (height is fit-content)
const bubbleHeight = ref(0)

const clamp = (v: number, lo: number, hi: number) =>
	Math.min(Math.max(v, lo), hi)

// The hand-drawn frame's boil frames are only requested by CSS once the
// first bubble opens; preload them so it doesn't flicker in piecemeal.
// The sound tooltip's frames ride along: its bubble draws itself in the
// moment it mounts, too late for a preload of its own to help.
useHead({
	link: [
		...[0, 1, 2, 3].flatMap(i =>
			['frame', 'tail', 'close', 'web', 'thumb-mask'].map(part => ({
				rel: 'preload',
				as: 'image' as const,
				href: `/animondo/bubble/${part}_${i}.webp`,
			}))
		),
		...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/tooltip/bubble_${i}.webp`,
		})),
		...[0, 1, 2, 3].flatMap(i =>
			(['en', 'ja'] as const).map(lang => ({
				rel: 'preload',
				as: 'image' as const,
				href: `/animondo/tooltip/sound-on_${lang}_${i}.webp`,
			}))
		),
	],
})

// The explore labels follow the pointer's kind, so their preload is
// reactive — only the four frames per language this device will show
useHead(() => ({
	link: [0, 1, 2, 3].flatMap(i =>
		(['en', 'ja'] as const).map(lang => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/tooltip/explore_${
				isCoarsePointer.value ? 'mobile' : 'pc'
			}_${lang}_${i}.webp`,
		}))
	),
}))

const {width: winWidth, height: winHeight} = useWindowSize()

// Half of the on-screen footprint reserved for the character, zoom-aware
const charHalf = computed(() =>
	Math.min(
		// 0.55 cells is the ink's actual half-extent; the old fixed +12px
		// pad and 60px floor kept the bubble hovering far from a zoomed-out
		// dancer, so the floor is now only what keeps the tail legible.
		Math.max(zui.pixelsPerCell.value * 0.55, 24),
		Math.min(winWidth.value, winHeight.value) * 0.25
	)
)

const bubbleGap = computed(() =>
	clamp(zui.pixelsPerCell.value * 0.08, 3, BUBBLE_GAP_MAX)
)

// The screen point the camera steers the character to. Both axes start from
// where the dancer was tapped; the main axis is clamped just far enough that
// the bubble's minimum footprint fits between the character and the screen
// edge, so the camera only travels when the room genuinely runs out.
const characterAnchor = computed<[number, number]>(() => {
	const vw = winWidth.value
	const vh = winHeight.value
	const half = charHalf.value
	const gap = bubbleGap.value
	const [charX, charY] = bubbleCharAt.value

	switch (bubbleSide.value) {
		case 'right':
		case 'left': {
			const y = clamp(
				charY,
				BUBBLE_TOP_CLEARANCE + TAIL_INSET,
				vh - BUBBLE_BOTTOM_CLEARANCE - TAIL_INSET
			)
			// The side was only chosen with BUBBLE_MIN_WIDTH of side space on
			// the whole screen (see onTap), so these bounds cannot cross
			const x =
				bubbleSide.value === 'right'
					? clamp(
							charX,
							BUBBLE_MARGIN + half,
							vw - BUBBLE_MARGIN - BUBBLE_MIN_WIDTH - gap - half
						)
					: clamp(
							charX,
							BUBBLE_MARGIN + BUBBLE_MIN_WIDTH + gap + half,
							vw - BUBBLE_MARGIN - half
						)
			return [x, y]
		}
		default: {
			const x = clamp(
				charX,
				BUBBLE_MARGIN + TAIL_INSET,
				vw - BUBBLE_MARGIN - TAIL_INSET
			)
			// 3:5 of the width the stacked bubble will actually get, capped
			// at 70svh — see BUBBLE_MIN_HEIGHT_RATIO
			const bubbleWidth = Math.min(vw - 2 * BUBBLE_MARGIN, BUBBLE_MAX_WIDTH)
			const minHeight = Math.min(
				bubbleWidth * BUBBLE_MIN_HEIGHT_RATIO,
				vh * BUBBLE_MAX_HEIGHT_SVH
			)
			// On a screen too short for both, the character's visibility wins
			// and the bubble squeezes below its minimum, as it always did
			const y =
				bubbleSide.value === 'bottom'
					? clamp(
							charY,
							BUBBLE_TOP_CLEARANCE + half,
							Math.max(
								vh - BUBBLE_BOTTOM_CLEARANCE - minHeight - gap - half,
								BUBBLE_TOP_CLEARANCE + half
							)
						)
					: clamp(
							charY,
							Math.min(
								BUBBLE_TOP_CLEARANCE + minHeight + gap + half,
								vh - BUBBLE_BOTTOM_CLEARANCE - half
							),
							vh - BUBBLE_BOTTOM_CLEARANCE - half
						)
			return [x, y]
		}
	}
})

watchEffect(() => {
	zui.followAnchor.value = selection.value ? characterAnchor.value : null
})

const bubbleStyle = computed<Record<string, string>>(() => {
	const vw = winWidth.value
	const vh = winHeight.value
	const half = charHalf.value
	const [ax, ay] = characterAnchor.value
	const side = bubbleSide.value

	// The bubble grows from the edge facing the character (fit-content),
	// capped so it never runs past the margins on the far side. The box is
	// laid to fit the viewport first, then the tail slides along its edge
	// (up to TAIL_INSET short of the corners) to point at the character —
	// so an off-centre character doesn't drag the whole box with it.
	if (side === 'top' || side === 'bottom') {
		const width = Math.min(vw - 2 * BUBBLE_MARGIN, BUBBLE_MAX_WIDTH)
		const left = clamp(ax - width / 2, BUBBLE_MARGIN, vw - BUBBLE_MARGIN - width)
		const tail = clamp(ax - left, TAIL_INSET, width - TAIL_INSET)
		const common = {
			left: `${left}px`,
			width: `${width}px`,
			'--tail-pos': `${tail - BUBBLE_BORDER}px`,
		}

		if (side === 'bottom') {
			const edge = ay + half + bubbleGap.value
			return {
				...common,
				top: `${edge}px`,
				maxHeight: `${vh - BUBBLE_BOTTOM_CLEARANCE - edge}px`,
			}
		}
		const edge = ay - half - bubbleGap.value
		return {
			...common,
			bottom: `${vh - edge}px`,
			maxHeight: `${edge - BUBBLE_TOP_CLEARANCE}px`,
		}
	}

	const edge =
		side === 'right' ? ax + half + bubbleGap.value : ax - half - bubbleGap.value
	const common = {
		...(side === 'right'
			? {left: `${edge}px`}
			: {right: `${vw - edge}px`}),
		width: `${Math.min(
			side === 'right' ? vw - BUBBLE_MARGIN - edge : edge - BUBBLE_MARGIN,
			BUBBLE_MAX_WIDTH
		)}px`,
		maxHeight: `${vh - BUBBLE_TOP_CLEARANCE - BUBBLE_BOTTOM_CLEARANCE}px`,
	}

	// Height is fit-content, so sliding the box needs the measured height;
	// until the enter hook has supplied it (pre-first-paint), centre on the
	// anchor — the corrected position lands before anything is painted.
	const height = bubbleHeight.value
	if (!height) {
		return {...common, top: `${ay}px`, translate: '0 -50%'}
	}

	const top = clamp(
		ay - height / 2,
		BUBBLE_TOP_CLEARANCE,
		Math.max(vh - BUBBLE_BOTTOM_CLEARANCE - height, BUBBLE_TOP_CLEARANCE)
	)
	const tail = clamp(ay - top, TAIL_INSET, height - TAIL_INSET)
	return {
		...common,
		top: `${top}px`,
		'--tail-pos': `${tail - BUBBLE_BORDER}px`,
	}
})

// The panel covers the stage, so a bubble left open sits behind it
watch(aboutOpen, open => {
	if (open) deselect()
})

// --- Bubble enter/leave: grow the balloon for real ---

// The frame is a border-image, so animating the box's actual size lays the
// drawn line out afresh at every step — the ink keeps its thickness instead
// of being stretched by a transform. Quantized to 12 fps like the icons.
// The box is anchored on its tail side (bubbleStyle pins that edge), so it
// grows away from the character.
const GROW_FACTORS = [0.25, 0.5, 0.75]

let cancelSizing: (() => void) | null = null

function stepBubbleSize(el: HTMLElement, factors: number[], done: () => void) {
	const prevWidth = el.style.width
	const prevHeight = el.style.height
	const prevTail = el.style.getPropertyValue('--tail-pos')
	const width = el.offsetWidth
	const height = el.offsetHeight

	// Inflate out of the tail: while the box scales, the tail's position on
	// screen stays fixed, so the cross coordinate shifts by what the tail
	// offset loses and the balloon grows from where it points. The tail
	// offset is padding-box based; border-box maths needs the band added.
	const vertical =
		el.classList.contains('profile-bubble--top') ||
		el.classList.contains('profile-bubble--bottom')
	const crossProp = vertical ? 'left' : 'top'
	const cross = Number.parseFloat(el.style.getPropertyValue(crossProp))
	const tail = Number.parseFloat(prevTail) + BUBBLE_BORDER
	const anchored = Number.isFinite(cross) && Number.isFinite(tail)
	const prevCross = el.style.getPropertyValue(crossProp)

	// Hides the contents (CSS), which would spill out of a half-grown frame
	el.classList.add('profile-bubble--sizing')

	const apply = (f: number) => {
		el.style.width = `${Math.round(width * f)}px`
		el.style.height = `${Math.round(height * f)}px`
		if (anchored) {
			el.style.setProperty('--tail-pos', `${tail * f - BUBBLE_BORDER}px`)
			el.style.setProperty(crossProp, `${cross + tail * (1 - f)}px`)
		}
	}

	const restore = (property: string, value: string) => {
		if (value) el.style.setProperty(property, value)
		else el.style.removeProperty(property)
	}

	const finish = () => {
		clearInterval(timer)
		restore('width', prevWidth)
		restore('height', prevHeight)
		restore('--tail-pos', prevTail)
		restore(crossProp, prevCross)
		el.classList.remove('profile-bubble--sizing')
	}

	let i = 0
	apply(factors[0])
	const timer = setInterval(() => {
		i++
		if (i < factors.length) {
			apply(factors[i])
			return
		}
		finish()
		done()
	}, 1000 / 12)

	return finish
}

async function onBubbleEnter(el: Element, done: () => void) {
	cancelSizing?.()
	// Measured before the first paint; the left/right layouts read it to
	// clamp the box into the viewport and to place the tail. The tick lets
	// that corrected style land before the grow captures inline styles —
	// still ahead of the browser's next paint.
	bubbleHeight.value = (el as HTMLElement).offsetHeight
	await nextTick()
	if (!el.isConnected) return
	cancelSizing = stepBubbleSize(el as HTMLElement, GROW_FACTORS, done)
}

function onBubbleLeave(el: Element, done: () => void) {
	cancelSizing?.()
	cancelSizing = stepBubbleSize(
		el as HTMLElement,
		[...GROW_FACTORS].reverse(),
		done
	)
}

// Aim at where the dancer actually is, not the middle of its cell. The drawn
// centres move every frame, so this is read on each tick rather than at the
// step boundary.
function updateFollowTarget() {
	const sel = selection.value
	if (!sel || !tileMap) return

	// Frame 0 shows the dancer on the boundary it just crossed, but the
	// pattern that will draw its new cell only lands next tick — reading the
	// outgoing one gives a stale entry side, and with the centred patterns
	// re-anchoring to the camera every step that briefly threw the view a
	// cell off. The crossing itself tells us where the dancer stands.
	if (currentFrame % 8 === 0 && lastExit) {
		zui.followTarget.value = [
			sel.cell[0] + 0.5 - lastExit[0] / 2,
			sel.cell[1] + 0.5 - lastExit[1] / 2,
		]
		return
	}

	const centre = dancerCenter(sel.cell)
	if (centre) zui.followTarget.value = centre
}

// The dancer's drawn centre in a cell (pattern-space), or null when the
// cell is empty. Per-artist tracks — each artist drew their own centres.
function dancerCenter(cell: [number, number]): [number, number] | null {
	if (!tileMap) return null

	const move = tileMap.currentPattern?.get(cell[0], cell[1])
	if (!move || (move.in === Direction.None && move.out === Direction.None)) {
		return null
	}

	const info = tileMap.getTileInfo(cell[0], cell[1])
	const display = moveToTileDisplay(move, info.index, info.flipVertical)
	const [ox, oy] = tileCenter(
		ARTISTS[info.index]?.id ?? '',
		display.tile,
		display.rotation,
		info.flipVertical,
		currentFrame % 8
	)

	return [cell[0] + ox, cell[1] + oy]
}

function deselect() {
	selection.value = null
	lastExit = null
	zui.followTarget.value = null
}

// --- The beat clock ---
// Created once per component, in setup, so unmounting disposes it — a
// clock created inside onInit (after an await, outside the effect
// scope) survived HMR remounts as a zombie and double-stepped the
// automaton.
// The music sways, so the step clock follows Baku's hand-tapped beat
// grid instead of a flat interval: turn t spans BEAT_TIMES[t] to
// BEAT_TIMES[t+1], its eight frames spread evenly inside. Everything
// derives from the audio context's clock, so drift and tab
// suspensions self-correct — the audio clock is the only clock.
//
// Playback runs 0..duration once, then cycles [loopStart, duration).
// The markers were tapped past the file's end on purpose, so both
// segments get whole 8-frame turns and %8 stays aligned forever.
let firstPass: number[] | null = null
let loopPass: number[] = []

function buildFrameTimes(fromBeat: number, duration: number): number[] {
	const frames: number[] = []
	for (
		let k = fromBeat;
		k + 1 < BEAT_TIMES.length && BEAT_TIMES[k]! < duration;
		k++
	) {
		const a = BEAT_TIMES[k]!
		const b = BEAT_TIMES[k + 1]!
		for (let f = 0; f < 8; f++) {
			frames.push(a + ((b - a) * f) / 8)
		}
	}
	return frames
}

function framesElapsed(times: number[], t: number): number {
	let lo = 0
	let hi = times.length
	while (lo < hi) {
		const mid = (lo + hi) >> 1
		if (times[mid]! <= t) lo = mid + 1
		else hi = mid
	}
	return lo
}

function tickFrame(isLast: boolean) {
	currentFrame += 1

	const frame = currentFrame % 8
	if (frame === 0 && currentFrame > 0) {
		advanceSelection()
		advanceExploreTip()
		tileMap?.nextStep()
		verifySelection()
		if (isLast) {
			// The renderer holds the new pattern back until frame 0's
			// sprites are up, so texture and pattern change in one swap
			// and nothing of the old turn flashes.
			renderer?.present(0, tileMap?.pixels).then(() => renderer?.prepare(1))
		} else if (tileMap) {
			// Catch-up burst: the pattern advances, the sprites skip
			renderer?.setTileMapPixels(tileMap.pixels)
		}
	} else if (isLast) {
		// Show this frame, then start the videos toward the next one so
		// it is decoded and waiting when its slot arrives
		renderer?.present(frame).then(() => {
			renderer?.prepare((frame + 1) % 8)
		})
	}

	// End of turn 4: the rings are in place — hand the stage over
	if (currentFrame === 32) {
		stageInteractive.value = true
		aboutVisible.value = true
	}

	// Two turns into free play, a dancer offers the navigation hint
	if (currentFrame === EXPLORE_TIP_FRAME) {
		revealExploreTip()
	}

	updateFollowTarget()
}

useRafFn(() => {
	advanceBeatClock()
	renderFrame()
	// After the camera settles: the hint bubble rides its dancer
	updateExploreTip()
})

// --- Beat-sync tuning & debugging ---

// The step grid felt off the music, so the visuals run on a shifted clock:
// the whole timeline — frame 0's first appearance included — lands
// FRAME_OFFSET frame-slots away from its tapped time. Positive delays,
// negative sends ahead of the beat. Overridable live with ?offset=N to
// compare candidates without an edit.
const searchParams = new URLSearchParams(location.search)
const offsetParam = Number(searchParams.get('offset') ?? NaN)
const FRAME_OFFSET = Number.isFinite(offsetParam) ? offsetParam : -1

// One frame-slot: an eighth of the average tapped beat. The grid sways a
// few ms around it, less than anyone can hear at a quarter-beat shift.
const FRAME_SLOT =
	(BEAT_TIMES[BEAT_TIMES.length - 1]! - BEAT_TIMES[0]!) /
	(BEAT_TIMES.length - 1) /
	8

// A blue dot at the screen centre on every beat — of the TAPPED GRID, not
// the offset visuals, so grid, dancers and music can be judged against each
// other. Off by default; ?beat turns it on.
const beatDebug = searchParams.has('beat')
const beatFlash = ref(false)
const {start: hideBeatFlash} = useTimeoutFn(
	() => (beatFlash.value = false),
	100,
	{immediate: false}
)
let lastFlashedBeat = -1

function advanceBeatClock() {
	if (!audio.hasStarted.value) return
	const duration = audio.duration()
	if (!duration) return
	if (firstPass === null) {
		firstPass = buildFrameTimes(0, duration)
		// The loop rejoins on a beat; cut the loop timeline from there
		const loopBeat = BEAT_TIMES.findIndex(
			t => Math.abs(t - audio.loopStart) < 0.25
		)
		loopPass = buildFrameTimes(Math.max(loopBeat, 0), duration)
	}

	// Frames the beat grid has passed at the given clock reading; playback
	// runs 0..duration once, then cycles [loopStart, duration).
	function frameTarget(elapsed: number): number {
		if (elapsed < duration) return framesElapsed(firstPass!, elapsed)
		const cycle = duration - audio.loopStart
		const turns = Math.floor((elapsed - duration) / cycle)
		const position = audio.loopStart + ((elapsed - duration) % cycle)
		return (
			firstPass!.length +
			turns * loopPass.length +
			framesElapsed(loopPass, position)
		)
	}

	const now = audio.elapsed()

	// The flash reads the true clock — beat instants sit at target = 1, 9,
	// 17, … since the frame times start ON the first tapped beat
	if (beatDebug) {
		const raw = frameTarget(now)
		if (raw > 0) {
			const beat = Math.floor((raw - 1) / 8)
			if (beat > lastFlashedBeat) {
				lastFlashedBeat = beat
				beatFlash.value = true
				hideBeatFlash()
			}
		}
	}

	// The visuals read a shifted clock instead, so every frame time — frame
	// 0's included — moves off its tapped instant by the same quarter-beat.
	// Catch-up bursts (a hidden tab, the loop seam) fall out of the same
	// arithmetic; only the last frame of a burst touches the videos.
	const target = frameTarget(now - FRAME_OFFSET * FRAME_SLOT)

	while (currentFrame < target) {
		tickFrame(currentFrame + 1 === target)
	}
}

// Issue a draw with this instant's camera and focus. One callback runs the
// beat clock, settles the camera and draws, so the dancer's cell and the
// camera can never be a frame apart.
function renderFrame() {
	// Nothing draws before the first beat: the standing bridge already
	// holds turn 1's Birth tiles, and some artists' first appear frame
	// carries visible ink — it used to peek through the title screen.
	if (currentFrame === 0 || !renderer) return

	const width = Math.round(canvasWidth.value * window.devicePixelRatio)
	const height = Math.round(canvasHeight.value * window.devicePixelRatio)
	if (!width || !height) return

	// Settle the camera (flick glide, follow) right before the draw is issued
	zui.syncCamera()

	// While a dancer is watched, the rest of the crowd recedes toward
	// the paper — through the boiling crayon veil (see tile.frag).
	// Eased per rendered frame.
	const sel = selection.value
	focusDim += ((sel ? FOCUS_DIM : 0) - focusDim) * 0.12

	const dpr = window.devicePixelRatio
	const grainTick = Math.floor(performance.now() * 0.012)

	renderer.render({
		navMatrix: zui.inverseMatrix.value,
		focusCell: sel
			? [
					((sel.cell[0] % Patterns.size.width) + Patterns.size.width) %
						Patterns.size.width,
					((sel.cell[1] % Patterns.size.height) + Patterns.size.height) %
						Patterns.size.height,
				]
			: [-1, -1],
		focusFade: focusDim,
		fadeMaskScale: [
			1 / (FADE_MASK_TILE[0]! * dpr),
			1 / (FADE_MASK_TILE[1]! * dpr),
		],
		fadeMaskOffset: [grainRoll(grainTick), grainRoll(grainTick + 0.618)],
		width,
		height,
	})
}

// Panning cancels the follow inside useZUI; drop the bubble too
watch(zui.followTarget, target => {
	if (!target) selection.value = null
})

zui.onTap((clientX, clientY) => {
	if (!tileMap || !audio.hasStarted.value || !stageInteractive.value) return

	// Whatever this tap does, the visitor is exploring — the hint is done
	if (exploreTipCell.value) exploreTipLeaving.value = true

	// Light dismiss: while a bubble is open, the first tap anywhere only
	// closes it — even when it lands on another character. Selecting that
	// character takes a second, deliberate tap.
	if (selection.value) {
		deselect()
		return
	}

	const world = zui.screenToWorld(clientX, clientY)

	// Select the dancer whose drawn centre is nearest to the tap, not the
	// cell the tap happens to land in — the ink often reaches far from its
	// cell, and the visitor aims at what they can see.
	const [tapX, tapY] = [Math.floor(world[0]), Math.floor(world[1])]
	let best: {cell: [number, number]; centre: [number, number]; d: number} | null =
		null
	for (let dy = -1; dy <= 1; dy++) {
		for (let dx = -1; dx <= 1; dx++) {
			const candidate: [number, number] = [tapX + dx, tapY + dy]
			const centre = dancerCenter(candidate)
			if (!centre) continue
			const d = Math.hypot(centre[0] - world[0], centre[1] - world[1])
			if (!best || d < best.d) best = {cell: candidate, centre, d}
		}
	}

	// Farther than this (in cells) reads as tapping empty paper
	if (!best || best.d > 0.75) return
	const {cell, centre} = best

	// Pick which side the bubble opens on. A landscape screen with room to
	// spare reads left/right off the tap; otherwise the tapped half of the
	// screen keeps the character and the bubble takes the other half.
	const vw = window.innerWidth
	const vh = window.innerHeight
	const sideSpace = vw - 2 * BUBBLE_MARGIN - 2 * charHalf.value - bubbleGap.value
	bubbleSide.value =
		vw > vh && sideSpace >= BUBBLE_MIN_WIDTH
			? clientX < vw / 2
				? 'right'
				: 'left'
			: clientY < vh / 2
				? 'bottom'
				: 'top'

	// Pin where the dancer stands right now: characterAnchor starts the
	// camera's travel from here and moves it no farther than the bubble needs
	bubbleCharAt.value = zui.worldToScreen(centre) as [number, number]

	selection.value = {
		cell,
		artistIndex: tileMap.getTileInfo(cell[0], cell[1]).index,
	}
	zui.followTarget.value = centre
})

// The step the tracked dancer took at the last frame wrap
let lastExit: [number, number] | null = null

const DIRECTION_DELTA: Partial<Record<Direction, [number, number]>> = {
	[Direction.Up]: [0, -1],
	[Direction.Right]: [1, 0],
	[Direction.Down]: [0, 1],
	[Direction.Left]: [-1, 0],
}

// Move the tracked cell along the pattern's out direction. Must be called
// with the pattern that governed the step which is just ending, i.e. right
// BEFORE the same tick's nextStep() swaps the pattern.
function advanceSelection() {
	const sel = selection.value
	if (!sel || !tileMap) return

	const move = tileMap.currentPattern?.get(sel.cell[0], sel.cell[1])
	const delta = move ? DIRECTION_DELTA[move.out] : undefined

	if (!delta) {
		// The character vanished (or the cell went silent)
		deselect()
		return
	}

	lastExit = delta
	sel.cell = [sel.cell[0] + delta[0], sel.cell[1] + delta[1]]
	updateFollowTarget()
}

// After nextStep(), make sure the tracked cell still hosts the same artist —
// converging patterns (e.g. gather) can overwrite it with another character.
function verifySelection() {
	const sel = selection.value
	if (!sel || !tileMap) return

	if (tileMap.getTileInfo(sel.cell[0], sel.cell[1]).index !== sel.artistIndex) {
		deselect()
	}
}

// WebGL answered the feature check and then gave out anyway. Nothing will
// ever be drawn, so stop the music, bring the title back, and hand the
// visitor the recording.
function startupError(error: unknown) {
	console.error('Animondo could not start', error)
	startupFailed.value = true
	soundVisible.value = false
	audio.stop()
	titleVisible.value = true
}

// Bring the renderer up — in a worker where the browser allows it, on the
// main thread where it does not (see useTileRenderer) — then the automaton.
whenever(canvas, canvasElement => {
	init(canvasElement).catch(startupError)
})

onScopeDispose(() => renderer?.dispose())

async function init(canvasElement: HTMLCanvasElement) {
	renderer?.dispose()

	// Sprite order follows ARTISTS so the index the tile map stores keeps
	// addressing the same artist. Laura and Lucija may rejoin later — adding
	// them to ARTIST_IDS pulls their sprite in too, but the shader still
	// needs matching video8/video9 uniforms.
	renderer = await createTileRenderer(canvasElement, {
		frag: TileFragmentShader,
		sources: ARTISTS.map(({id}) => `sprites/${id}.mp4`),
		tileMapWidth: Patterns.size.width,
		tileMapHeight: Patterns.size.height,
		onError: startupError,
	})

	// Initialize tile map
	tileMap = new TileMap({
		...Patterns.size,
		numberOfVideos: ARTISTS.length,
	})

	// パターンジェネレーター関数（常にcを返す）
	tileMap.setMovePattern(function* (): Generator<MovePattern, never, void> {
			// The opening is choreographed. The wait for the music's entrance
			// is the beat grid's own: no frame ticks before the first tapped
			// beat (~2.2s in), so the first ring lands exactly on beat one.
			// The head yield must be EMPTY — the opening bridge is built from
			// the first two yields and shows before any tick, and a mask there
			// parks visible dancers on screen through the wait. From empty,
			// the pre-beat bridge is Birth tiles on their blank first frame.
			// Births in turn k come from yield k+1's out: turns 1-4 grow four
			// rings (2x2 .. 8x8, filling the short side at the opening zoom),
			// turn 5 floods the rest, turn 6 reverses, turns 7-10 sweep
			// right, down, left, up.
		yield Patterns.empty
		for (let i = 1; i <= 4; i++) {
			yield Patterns.radialMask(Patterns.clockwise, i)
		}
		yield Patterns.clockwise
		yield Patterns.counterClockwise
		yield Patterns.right
		yield Patterns.down
		yield Patterns.left
		yield Patterns.up

		// From here the piece drifts on its own; the keyboard can borrow
		// the floor. takePattern() is only read at a step boundary, so
		// everything lands on the beat.
		while (true) {
			yield patternControl.takePattern()
		}
	})

	// The opening bridge (turn 1's Birth tiles) has to be on the GPU
	// before the first tick renders it
	renderer.setTileMapPixels(tileMap.pixels)

	// Only invite the visitor in once the sprites are decoded and the
	// typefaces have settled, so the button never lands over a half-drawn
	// stage. Fonts get a deadline: a Typekit outage should not leave the
	// page with no way to start.
	await Promise.race([
		document.fonts?.ready ?? Promise.resolve(),
		new Promise(resolve => setTimeout(resolve, 5000)),
	])
	assetsReady.value = true

	// The beat clock lives in setup, not here: init can run again (canvas
	// re-mount, HMR remount), and a clock born after an await sits outside
	// the effect scope, so it would survive as a zombie stepping a second
	// automaton — which scrambled the appear/vanish bridges.
}

useSeoMeta({
	title: 'Animondo',
})
</script>

<style lang="stylus">
main
	display flex
	flex-direction column
	align-items center
	justify-content center
	position absolute
	top 0
	left 0
	width 100vw
	height 100svh

.about-button
	position fixed
	top 1rem
	right 1rem
	// Above the about modal, so the same button closes what it opened
	z-index 110

.sound-button
	position fixed
	top 1rem
	left 1rem
	// Above the title overlay: muting must not start the piece
	z-index 110

.launchpad-button
	position fixed
	bottom 1rem
	left 1rem
	// Above the launchpad overlay, so the same button closes what it opened
	z-index 110


.canvas
	position fixed
	width 100vw
	height 100svh
	cursor grab
	touch-action none

	// The opening is watched, not steered
	&--locked
		pointer-events none
		cursor default

	// Hold the grab while the pointer is down
	&:active
		cursor grabbing
	user-select none
	-webkit-user-select none
	-moz-user-select none
	-ms-user-select none

// Beat-sync debug marker (see advanceBeatClock)
.beat-flash
	position fixed
	top 50%
	left 50%
	width 24px
	height 24px
	translate -50% -50%
	border-radius 50%
	background #2266ff
	z-index 200
	pointer-events none

.profile-bubble
	display flex
	flex-direction column
	position fixed
	z-index 15
	padding 0.5rem 0.75rem
	// Hand-drawn frame: one square drawing carries the four corners, the
	// repeating edges and the white fill (border-image-slice `fill`). The
	// source is 1024px with 128px slices shown at 16px, so a 2x screen still
	// samples it 4:1 — see scripts/build-bubble-samples.py for the contract.
	border 16px solid transparent
	border-image url('/animondo/bubble/frame_0.webp') 128 fill round
	// Boil at 12 fps, same clock as the hand-drawn icons (4 frames)
	animation bubble-boil 0.3333s steps(1) infinite
	text-align center
	line-height 1.5

	// Tail: its own drawing (tip pointing down), whose white fill masks the
	// border line running behind it. Rotated per side below.
	&::after
		content ''
		position absolute
		width 36px
		height 36px
		background url('/animondo/bubble/tail_0.webp') center / contain no-repeat
		animation bubble-tail-boil 0.3333s steps(1) infinite

	// Bubble above the character — tail below, pointing down. The 34px
	// offset (from the padding box) leaves the tail's root just touching
	// the border line rather than sinking into the balloon. --tail-pos
	// (from bubbleStyle, padding-box coordinates) slides the tail along the
	// edge toward the character; without it, the tail sits in the middle.
	&--top
		&::after
			bottom -34px
			left var(--tail-pos, 50%)
			translate -50% 0

	&--bottom
		&::after
			top -34px
			left var(--tail-pos, 50%)
			translate -50% 0
			rotate 180deg

	// Bubble to the right of the character — tail on the left edge
	&--right
		&::after
			left -34px
			top var(--tail-pos, 50%)
			translate 0 -50%
			rotate 90deg

	&--left
		&::after
			right -34px
			top var(--tail-pos, 50%)
			translate 0 -50%
			rotate -90deg

	// While the enter/leave steps resize the box, the contents would spill
	// out of the half-grown frame — hide them. The tail is a pseudo element
	// (not matched by >*), so it stays and rides along on the moving edge.
	&--sizing > *
		visibility hidden

	// Top row: the language switch sitting just left of the drawn ×
	&__controls
		display flex
		align-items center
		justify-content flex-end
		gap 0.5rem

	// Scaled by font-size alone — the words are 4em x 2em (LocaleSwitch)
	&__lang
		font-size 0.6rem

	// The drawn × (80px source shown at ~28px, boiling like the frame)
	&__close
		flex none
		width 1.75rem
		height 1.75rem
		padding 0
		border none
		background url('/animondo/bubble/close_0.webp') center / 1.25rem no-repeat
		animation bubble-close-boil 0.3333s steps(1) infinite
		cursor pointer

		&:hover
			opacity 0.6

	// Everything below the control row — names, still and prose — scrolls as
	// one column, so no content height can push past the drawn frame. The
	// min-height is what actually lets the maxHeight'd flex column shrink it.
	&__body
		flex 0 1 auto
		min-height 0
		overflow-y auto
		overscroll-behavior contain

	// Names on the left, the site link on the right
	&__header
		display flex
		align-items baseline
		justify-content space-between
		gap 0.75rem
		text-align left

	// The current language's name, with the other language's under it
	&__names
		display flex
		flex-direction column
		align-items flex-start

	&__name
		font-size 1.25rem

	&__name-alt
		font-size 0.8rem

	// The drawn "Web" link (300x97 source), dropped to the bottom edge of
	// the name block — up at the first line it crowds the drawn ×
	&__site
		flex none
		align-self flex-end
		height 1.2rem
		aspect-ratio 300 / 97
		background url('/animondo/bubble/web_0.webp') center / contain no-repeat
		animation bubble-web-boil 0.3333s steps(1) infinite

		&:hover
			opacity 0.6

	// Representative work: a still with its title and year underneath. The
	// fixed aspect ratio keeps the bubble's measured height stable before
	// the image has arrived.
	&__work
		margin-top 1rem
		text-align left

		img
			display block
			width 100%
			aspect-ratio 16 / 9
			object-fit cover
			// Hand-drawn vignette, boiling like the frame. The masters are a
			// luminance mask; the build turns their luma into alpha so no
			// mask-mode is needed (Chrome only learned it in 120)
			mask url('/animondo/bubble/thumb-mask_0.webp') center / 100% 100% no-repeat
			animation bubble-thumb-boil 0.3333s steps(1) infinite

		// Quieter than the prose: smaller and paler, so the caption reads as
		// a label on the still rather than part of the bio
		figcaption
			margin-top 0.25rem
			font-size 0.7rem
			color #a8a8a8

	&__text
		margin-top 0.75rem
		font-size 0.85rem
		color #3f3f3f
		text-align left

		// Rendered markdown lands here, and the global reset has stripped the
		// browser defaults these tags rely on — restore them locally.
		p + p, ul, ol
			margin-top 0.5em

		ul, ol
			padding-left 1.25em

		li
			list-style disc

		ol > li
			list-style decimal

		strong
			font-weight bold

		a
			text-decoration underline

			&:hover
				opacity 0.6

// Kept in the DOM but never seen. display:none would stop the browser (and
// Typekit's subsetter) from caring about the glyphs — invisible and
// sizeless does not.
.font-warmup
	position fixed
	width 0
	height 0
	overflow hidden
	visibility hidden
	pointer-events none

@keyframes bubble-boil
	0%
		border-image-source url('/animondo/bubble/frame_0.webp')
	25%
		border-image-source url('/animondo/bubble/frame_1.webp')
	50%
		border-image-source url('/animondo/bubble/frame_2.webp')
	75%
		border-image-source url('/animondo/bubble/frame_3.webp')

@keyframes bubble-tail-boil
	0%
		background-image url('/animondo/bubble/tail_0.webp')
	25%
		background-image url('/animondo/bubble/tail_1.webp')
	50%
		background-image url('/animondo/bubble/tail_2.webp')
	75%
		background-image url('/animondo/bubble/tail_3.webp')

@keyframes bubble-close-boil
	0%
		background-image url('/animondo/bubble/close_0.webp')
	25%
		background-image url('/animondo/bubble/close_1.webp')
	50%
		background-image url('/animondo/bubble/close_2.webp')
	75%
		background-image url('/animondo/bubble/close_3.webp')

@keyframes bubble-web-boil
	0%
		background-image url('/animondo/bubble/web_0.webp')
	25%
		background-image url('/animondo/bubble/web_1.webp')
	50%
		background-image url('/animondo/bubble/web_2.webp')
	75%
		background-image url('/animondo/bubble/web_3.webp')

@keyframes bubble-thumb-boil
	0%
		mask-image url('/animondo/bubble/thumb-mask_0.webp')
	25%
		mask-image url('/animondo/bubble/thumb-mask_1.webp')
	50%
		mask-image url('/animondo/bubble/thumb-mask_2.webp')
	75%
		mask-image url('/animondo/bubble/thumb-mask_3.webp')

</style>
