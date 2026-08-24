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
			size="clamp(4.5rem, 17vw, 7rem)"
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
			size="clamp(4.5rem, 17vw, 7rem)"
			:state="audio.muted.value ? 'mute' : 'unmute'"
			:label="audio.muted.value ? t('sound.unmute') : t('sound.mute')"
			:leaving="launchpadOpen"
			@click="toggleSound"
			@left="soundButtonShown = false"
		/>
		<NudgeTooltip
			v-if="soundTipVisible"
			corner="top-left"
			:message="
				t(soundTipLabel === 'sound-off' ? 'sound.muted.notice' : 'sound.notice')
			"
			:label="soundTipLabel"
			:leaving="soundTipLeaving"
			@left="onSoundTipLeft"
		/>
		<NudgeTooltip
			v-if="aboutTipVisible"
			corner="top-right"
			:message="t('about.notice')"
			label="about"
			:leaving="aboutTipLeaving"
			@left="onAboutTipLeft"
		/>
		<NudgeTooltip
			v-if="padsTipVisible"
			corner="bottom-left"
			:message="t('launchpad.notice')"
			label="pads"
			:leaving="padsTipLeaving"
			@left="onPadsTipLeft"
		/>
		<ExploreTooltip
			v-if="exploreTip.cell && exploreTip.at"
			:leaving="exploreTip.leaving"
			:style="exploreTip.style"
			@left="exploreTip.onLeft"
		/>
		<TapTooltip
			v-if="tapTip.cell && tapTip.at"
			:leaving="tapTip.leaving"
			:style="tapTip.style"
			@left="tapTip.onLeft"
		/>
		<CircleIcon
			v-if="launchpadButtonVisible"
			class="launchpad-button"
			:glyph="PADS_SHEET"
			size="clamp(4.5rem, 17vw, 7rem)"
			:state="launchpadOpen ? 'close' : 'fixed'"
			:label="launchpadOpen ? t('launchpad.close') : t('launchpad.open')"
			@click="toggleLaunchpad"
		/>
		<!-- Always mounted: closed it stands by invisibly, surfacing only a
			keyboard-queued ghost; the entrance and leave waves are its own -->
		<PatternLaunchpad
			:open="launchpadOpen"
			:queued-pad="patternControl.queuedPadId.value"
			:active-pad="patternControl.activePadId.value"
			:activation-seq="patternControl.activationSeq.value"
			:pad-cycle="patternControl.padCycleState.value"
			:beat-seq="beatSeq"
			@tap="patternControl.tapPad"
			@close="launchpadOpen = false"
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
				<!-- The frame's boil as four standing layers, one opaque at a
					time: swapping border-image sources re-rasterized and
					flickered on cold caches, opacity does not. Each layer is
					the whole drawing, paper fill included, behind the
					contents. -->
				<span
					v-for="f in 4"
					:key="`skin-${f}`"
					class="profile-bubble__skin"
					:class="`profile-bubble__skin--${f - 1}`"
					aria-hidden="true"
				/>
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
						<!-- Titles lean by English convention; Japanese keeps
							its 『』 upright — the local title mark -->
						<figcaption v-if="locale === 'ja'">{{ workCaption }}</figcaption>
						<figcaption v-else>
							<i>{{ selectedArtist.work.title.en }}</i>
							({{ selectedArtist.work.year }})
						</figcaption>
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
import {preloadAssets} from '~/utils/preloadAssets'
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

// The sound toggle follows the play button four drawn frames behind — a
// staggered entrance, not a separate scene (a 1.5s wait read as the
// sound-on bubble arriving late).
const soundVisible = ref(false)
const {start: revealSound} = useTimeoutFn(
	() => (soundVisible.value = true),
	(4 / 12) * 1000,
	{immediate: false}
)
watch(
	assetsReady,
	ready => {
		if (ready) revealSound()
	},
	{immediate: true}
)

// --- Sound tooltip (the "Sound on" notice + the toggle's state toast) ---

// One bubble off the sound toggle's corner, worn two ways. As the toggle's
// draw-in lands (11 frames at 12 fps, overlapping the last two) it appears
// as a notice that the piece has audio, stands for as long as the title
// screen does, and leaves when the visitor starts the piece. From then on,
// every toggle brings it back for two seconds speaking the NEW state —
// muted or sounding — with the label swapping in place if it is still up.
const soundTipVisible = ref(false)
const soundTipLeaving = ref(false)
const soundTipLabel = ref<'sound-on' | 'sound-off'>('sound-on')

const SOUND_TOAST_HOLD = 2000

const {start: revealSoundTip} = useTimeoutFn(
	() => {
		if (audio.hasStarted.value) return
		// Muted during the wait: the notice opens speaking the truth
		soundTipLabel.value = audio.muted.value ? 'sound-off' : 'sound-on'
		soundTipVisible.value = true
	},
	(9 / 12) * 1000,
	{immediate: false}
)
watch(soundVisible, visible => {
	if (visible) revealSoundTip()
})

// Only toggles arm this; the pre-start notice stands until the start
const {start: expireSoundTip} = useTimeoutFn(
	() => (soundTipLeaving.value = true),
	SOUND_TOAST_HOLD,
	{immediate: false}
)

function toggleSound() {
	audio.toggleMuted()
	soundTipLabel.value = audio.muted.value ? 'sound-off' : 'sound-on'
	soundTipLeaving.value = false
	soundTipVisible.value = true
	// Restarted on every toggle, so a flurry ends 2s after the last one
	expireSoundTip()
}

// A toggle mid-exit revokes the leave; the emitted `left` still arrives,
// so only honour it while the leave stands
function onSoundTipLeft() {
	if (soundTipLeaving.value) soundTipVisible.value = false
}

whenever(audio.hasStarted, () => {
	soundTipLeaving.value = true
})
// Nothing will ever sound on the failure screen
watch(startupFailed, failed => {
	if (failed) soundTipLeaving.value = true
})

// Initialize ZUI for navigation — ahead of the explore tooltip below, which
// registers its onNavigate listener the moment setup reaches it
const zui = useZUI(canvas)

// --- Dancer hints (explore / tap-me) ---

// Hand-drawn hint bubbles a dancer speaks. Each hint is a relay: a speaker
// holds the bubble six seconds — less if it vanishes, dances off the
// screen's edge, or a tap or an opened panel hushes it — and after a beat
// of quiet another dancer somewhere on screen takes it up, until stop()
// says the lesson has landed. `avoid` reports the other hint's speaker so
// two bubbles up at once keep their distance.
function createDancerHint(avoid: () => [number, number] | null) {
	const cell = ref<[number, number] | null>(null)
	const leaving = ref(false)
	// The speaker's drawn centre in screen px, refreshed every drawn frame
	const at = ref<[number, number] | null>(null)
	let stopped = false

	const style = computed<Record<string, string>>(() => {
		if (!at.value) return {}
		// The component turns the point into its own placement (tail-tip maths)
		return {
			'--speaker-x': `${at.value[0]}px`,
			'--speaker-y': `${at.value[1]}px`,
		}
	})

	// Each speaker holds the hint this long at most
	const {start: expire} = useTimeoutFn(() => (leaving.value = true), 6000, {
		immediate: false,
	})

	// The beat of quiet before the next dancer takes the hint up — also the
	// retry pace while the stage is busy (a profile bubble or a panel open)
	const {start: queue} = useTimeoutFn(() => speak(), 1500, {immediate: false})

	function speak() {
		// The lesson landed: the relay's work is done, let it die out
		if (stopped || !tileMap) return

		// Busy stage (a profile bubble, a panel): hold the hint and try again
		if (selection.value || aboutOpen.value || launchpadOpen.value) {
			queue()
			return
		}

		// A random spot in the screen's middle band — the balloon needs its
		// room up-right of the speaker — then the dancer drawn nearest to it.
		// A pick crowding the other hint's bubble is retried, so the two
		// spread out; the last attempt takes what it gets.
		const vw = window.innerWidth
		const vh = window.innerHeight
		const clearance = Math.min(vw, vh) * 0.35
		let pick: [number, number] | null = null
		for (let attempt = 0; attempt < 6 && !pick; attempt++) {
			const world = zui.screenToWorld(
				vw * (0.25 + Math.random() * 0.5),
				vh * (0.35 + Math.random() * 0.45)
			)
			const [px, py] = [Math.floor(world[0]), Math.floor(world[1])]
			let best:
				| {cell: [number, number]; centre: [number, number]; d: number}
				| null = null
			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const candidate: [number, number] = [px + dx, py + dy]
					const centre = dancerCenter(candidate)
					if (!centre) continue
					const d = Math.hypot(centre[0] - world[0], centre[1] - world[1])
					if (!best || d < best.d) best = {cell: candidate, centre, d}
				}
			}
			if (!best) continue

			const other = avoid()
			if (other && attempt < 5) {
				const here = zui.worldToScreen(best.centre)
				if (Math.hypot(here[0] - other[0], here[1] - other[1]) < clearance) {
					continue
				}
			}
			pick = best.cell
		}
		// A silent stage right now; the relay knocks again shortly
		if (!pick) {
			queue()
			return
		}

		leaving.value = false
		cell.value = pick
		expire()
	}

	/** Play the current bubble out; the relay carries on afterwards */
	function dismiss() {
		if (cell.value) leaving.value = true
	}

	/** The lesson landed: no speaker after the current one */
	function stop() {
		stopped = true
		dismiss()
	}

	// The bubble has played itself out: clear the speaker and pass it on
	function onLeft() {
		cell.value = null
		at.value = null
		if (!stopped) queue()
	}

	// The speaker keeps dancing: step its cell along the pattern's out at
	// each turn (called right before nextStep, like advanceSelection), and
	// let the bubble go if the dancer vanishes.
	function advance() {
		if (!cell.value || !tileMap) return
		const move = tileMap.currentPattern?.get(cell.value[0], cell.value[1])
		const delta = move ? DIRECTION_DELTA[move.out] : undefined
		if (!delta) {
			leaving.value = true
			return
		}
		cell.value = [cell.value[0] + delta[0], cell.value[1] + delta[1]]
	}

	// Chase the ink, not the cell: the drawn centres move every frame, and
	// the camera may be panning under the bubble
	function update() {
		if (!cell.value) return
		const centre = dancerCenter(cell.value)
		if (!centre) return
		const here = zui.worldToScreen(centre) as [number, number]
		at.value = here

		// The speaker has danced off the paper's edge — a bubble pointing at
		// nothing helps nobody, so pass the hint to a dancer still on screen
		if (
			!leaving.value &&
			(here[0] < 0 ||
				here[0] > window.innerWidth ||
				here[1] < 0 ||
				here[1] > window.innerHeight)
		) {
			leaving.value = true
		}
	}

	// Reactive so the template reads .cell/.at/.style without .value
	return reactive({
		cell,
		leaving,
		at,
		style,
		speak,
		dismiss,
		stop,
		onLeft,
		advance,
		update,
	})
}

// The two hints run side by side, each on its own relay: the navigation
// hint (drag and scroll — pinch and swipe for coarse pointers) opens two
// turns after the stage unlocks, the tap-me hint a few seconds behind it.
// Each ends on its own gesture — the first pan or zoom silences the
// explore hint, the first tapped dancer the tap-me one — and a gesture
// made before a relay starts means that relay never runs.
const EXPLORE_TIP_FRAME = 48
const exploreTip = createDancerHint(tapSpeakerAt)
const tapTip = createDancerHint(exploreSpeakerAt)

// Function declarations, so the two `avoid` closures above may cross-refer
function tapSpeakerAt() {
	return tapTip.at
}
function exploreSpeakerAt() {
	return exploreTip.at
}

const {start: startTapTipSoon} = useTimeoutFn(() => tapTip.speak(), 3000, {
	immediate: false,
})

zui.onNavigate(() => {
	exploreTip.stop()
})

// --- Pattern launchpad (mobile only) ---

// A full-screen grid of pads that queue patterns by touch. Meant for coarse
// pointers only (on desktop the keyboard already plays this instrument) —
// but every pointer gets it for now, while the pad UI is being tuned.
// TODO: restore `isCoarsePointer.value &&` once the pads are settled.
const isCoarsePointer = useMediaQuery('(pointer: coarse)')
const launchpadRevealed = ref(false)
const launchpadOpen = ref(false)
const launchpadButtonVisible = computed(() => launchpadRevealed.value)

// The pads' button arrives on the ?'s beat, the two drawing in together
watch(aboutVisible, visible => {
	if (visible) launchpadRevealed.value = true
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

// A panel over the stage silences the dancer hints with it (declared here,
// after both refs exist)
watch([aboutOpen, launchpadOpen], ([about, pads]) => {
	if (about || pads) {
		exploreTip.dismiss()
		tapTip.dismiss()
	}
})

let renderer: TileRenderer | null = null
let tileMap: TileMap | null = null

// The drawn size follows the element; the backing store is set from it
// (times devicePixelRatio) on every rendered frame, whichever thread draws
const {width: canvasWidth, height: canvasHeight} = useElementSize(canvas)

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

// Title and year of the representative work, quoted the Japanese way.
// The EN caption is assembled in the template instead, so the title
// alone can lean (the figcaption's i, below in the styles).
const workCaption = computed(() => {
	const artist = selectedArtist.value
	if (!artist) return ''
	const {title, year} = artist.work
	return `『${title.ja}』（${year}）`
})

// How far the unwatched crowd fades toward the paper while a dancer is
// followed (shader-side mix toward white, scrubbed through the crayon
// veil below), and its eased current value. The veil's own alpha carries
// most of the wash (the mask's greys average ~0.77); this backs it off a
// touch further, kept in step with the About panel's veil opacity.
const FOCUS_DIM = 0.98
let focusDim = 0

// The crayon veil (public/fade-mask.webp) tiles at a QUARTER of the
// master's size in CSS pixels — half of the 2x-for-HiDPI scale, shrunk once
// more because the grain read too coarse. The texture itself is squeezed to
// 1024x512 for WebGL1's power-of-two repeat, so the scale stretches it
// back. Its offset re-rolls every 12 fps tick — the same hash-from-a-sine
// trick shaders use, keyed to the tick so every rendered frame within one
// tick agrees. Keep AboutModal.vue and PatternLaunchpad.vue in step.
const FADE_MASK_TILE = [568.25, 363.75]

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
	// The keyboard sleeps until the opening hands the stage over — and
	// while a panel owns it (the about, a focused dancer's bubble), so no
	// ghost pad floats over what the visitor is reading
	() => stageInteractive.value && !aboutOpen.value && selection.value === null
)

// --- Nudge tooltips ("What's this?" / "Change the dance!") ---

// A relay pointing out what the visitor has not tried, alternating
// between the ? and the pads' button until BOTH have been tried. Twenty
// seconds after the stage unlocks the first bubble speaks (the ?'s
// turn), holds for six seconds, and two seconds after it has gone the
// other button takes it up — and so on, back and forth. A subject
// already tried drops out of the rotation (both tried ends the relay
// for good), a busy stage (an open panel, a followed dancer) holds a
// nudge back and retries rather than talking over it, and a nudge up
// when its subject finally gets tried plays itself out early.
const NUDGE_LEAD = 20000
const NUDGE_HOLD = 6000
const NUDGE_GAP = 2000
const NUDGE_RETRY = 1500

const aboutTipVisible = ref(false)
const aboutTipLeaving = ref(false)
const padsTipVisible = ref(false)
const padsTipLeaving = ref(false)

// Ever-tried flags: a nudge toward something already tried never shows.
// Any pad press counts for the pads — queuedPadId moves on both touch
// and keyboard, so the visitor has found the instrument either way.
const aboutEverOpened = ref(false)
watch(aboutOpen, open => {
	if (open) aboutEverOpened.value = true
})
const padsEverPlayed = ref(false)
watch([launchpadOpen, patternControl.queuedPadId], ([open, queued]) => {
	if (open || queued !== null) padsEverPlayed.value = true
})

// Whose turn the relay would take next; flipped as each bubble opens
let nudgeTurn: 'about' | 'pads' = 'about'

const {start: startNudges} = useTimeoutFn(speakNudge, NUDGE_LEAD, {
	immediate: false,
})
const {start: queueNudge} = useTimeoutFn(speakNudge, NUDGE_GAP, {
	immediate: false,
})
const {start: retryNudge} = useTimeoutFn(speakNudge, NUDGE_RETRY, {
	immediate: false,
})
const {start: expireAboutNudge} = useTimeoutFn(
	() => (aboutTipLeaving.value = true),
	NUDGE_HOLD,
	{immediate: false}
)
const {start: expirePadsNudge} = useTimeoutFn(
	() => (padsTipLeaving.value = true),
	NUDGE_HOLD,
	{immediate: false}
)

function speakNudge() {
	if (startupFailed.value) return
	const aboutDone = aboutEverOpened.value
	const padsDone = padsEverPlayed.value || patternControl.hasPressed()
	// Both lessons landed: the relay's work is done
	if (aboutDone && padsDone) return
	if (aboutOpen.value || launchpadOpen.value || selection.value) {
		retryNudge()
		return
	}
	// Take the next turn, skipping a subject already tried
	if (nudgeTurn === 'about' && aboutDone) nudgeTurn = 'pads'
	if (nudgeTurn === 'pads' && padsDone) nudgeTurn = 'about'
	if (nudgeTurn === 'about') {
		aboutTipLeaving.value = false
		aboutTipVisible.value = true
		expireAboutNudge()
	} else {
		padsTipLeaving.value = false
		padsTipVisible.value = true
		expirePadsNudge()
	}
	nudgeTurn = nudgeTurn === 'about' ? 'pads' : 'about'
}

// Each bubble's exit hands the relay on after the gap; speakNudge ends
// it once both subjects have been tried
function onAboutTipLeft() {
	aboutTipVisible.value = false
	queueNudge()
}

function onPadsTipLeft() {
	padsTipVisible.value = false
	queueNudge()
}

// The clock starts when the stage is handed over (turn 5, with the
// buttons themselves)
watch(stageInteractive, interactive => {
	if (interactive) startNudges()
})

// Early outs: the subject got tried, the launchpad took the screen (its
// button plays out, so a bubble pointing at it would point at nothing),
// or the piece failed outright
watch([aboutEverOpened, launchpadOpen], ([opened, pads]) => {
	if ((opened || pads) && aboutTipVisible.value) aboutTipLeaving.value = true
})
watch(padsEverPlayed, played => {
	if (played && padsTipVisible.value) padsTipLeaving.value = true
})
// A profile bubble has the floor: any nudge still up plays itself out
// (speakNudge already holds new ones back while the bubble stands)
watch(selection, sel => {
	if (!sel) return
	if (aboutTipVisible.value) aboutTipLeaving.value = true
	if (padsTipVisible.value) padsTipLeaving.value = true
})
watch(startupFailed, failed => {
	if (!failed) return
	if (aboutTipVisible.value) aboutTipLeaving.value = true
	if (padsTipVisible.value) padsTipLeaving.value = true
})

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
const BUBBLE_GAP_MAX = 16
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
const BUBBLE_BORDER = 24
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
		...[0, 1, 2, 3].map(i => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/bubble/frame_${i}.webp`,
		})),
		...['tail', 'close', 'web', 'thumb-mask'].map(part => ({
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/bubble/${part}.webp`,
		})),
		{
			rel: 'preload',
			as: 'image' as const,
			href: '/animondo/tooltip/bubble.webp',
		},
		...(['en', 'ja'] as const).flatMap(lang =>
			// sound-off rides along: the toggle can speak it from the title
			// screen on, before the asset gate has warmed the cache
			(['sound-on', 'sound-off'] as const).map(label => ({
				rel: 'preload',
				as: 'image' as const,
				href: `/animondo/tooltip/${label}_${lang}.webp`,
			}))
		),
	],
})

// The hint labels follow the pointer's kind, so their preload is
// reactive — only the sheet per language this device will show
useHead(() => ({
	link: (['en', 'ja'] as const).flatMap(lang => [
		{
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/tooltip/explore_${
				isCoarsePointer.value ? 'mobile' : 'pc'
			}_${lang}.webp`,
		},
		{
			rel: 'preload',
			as: 'image' as const,
			href: `/animondo/tooltip/${
				isCoarsePointer.value ? 'tap-me' : 'click-me'
			}_${lang}.webp`,
		},
	]),
}))

const {width: winWidth, height: winHeight} = useWindowSize()

// On coarse pointers the launchpad button owns the bottom-left corner, so
// the bubble may not run under the button row: 1rem inset + the button's
// CSS size (clamp(4.5rem, 17vw, 7rem)) + a breath of air. Desktop keeps
// the slim margin — nothing lives down there.
const bubbleBottomClearance = computed(() => {
	if (!isCoarsePointer.value) return BUBBLE_BOTTOM_CLEARANCE
	const button = clamp(winWidth.value * 0.17, 72, 112)
	return 16 + button + 8
})

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
	clamp(zui.pixelsPerCell.value * 0.12, 4, BUBBLE_GAP_MAX)
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
				vh - bubbleBottomClearance.value - TAIL_INSET
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
								vh - bubbleBottomClearance.value - minHeight - gap - half,
								BUBBLE_TOP_CLEARANCE + half
							)
						)
					: clamp(
							charY,
							Math.min(
								BUBBLE_TOP_CLEARANCE + minHeight + gap + half,
								vh - bubbleBottomClearance.value - half
							),
							vh - bubbleBottomClearance.value - half
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
				maxHeight: `${vh - bubbleBottomClearance.value - edge}px`,
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
		maxHeight: `${vh - BUBBLE_TOP_CLEARANCE - bubbleBottomClearance.value}px`,
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
		Math.max(vh - bubbleBottomClearance.value - height, BUBBLE_TOP_CLEARANCE)
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
	let k = fromBeat
	for (; k + 1 < BEAT_TIMES.length && BEAT_TIMES[k]! < duration; k++) {
		const a = BEAT_TIMES[k]!
		const b = BEAT_TIMES[k + 1]!
		for (let f = 0; f < 8; f++) {
			frames.push(a + ((b - a) * f) / 8)
		}
	}
	// The tapped grid is meant to reach past the file's end, but this
	// export stops one beat short (last marker 127.82s vs 128.69s of
	// audio), which stalled the visuals for that beat at every loop
	// seam while the music sailed on. Extend the grid with virtual
	// beats at the last tapped interval until it covers the seam —
	// whole 8-frame turns, so %8 stays aligned.
	const step =
		BEAT_TIMES[BEAT_TIMES.length - 1]! - BEAT_TIMES[BEAT_TIMES.length - 2]!
	for (let a = BEAT_TIMES[k]!; a < duration; a += step) {
		for (let f = 0; f < 8; f++) {
			frames.push(a + (step * f) / 8)
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
		// The launchpad pulses here — with the turn the visitor SEES change,
		// on the visuals' shifted clock, not the tapped grid's raw one
		beatSeq.value++
		advanceSelection()
		exploreTip.advance()
		tapTip.advance()
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

	// The moment turn 5 begins (the four rings have formed): the stage is
	// handed over, and the ? and the pads arrive together on the same beat
	if (currentFrame === 32) {
		stageInteractive.value = true
		aboutVisible.value = true
	}

	// Two turns into free play the explore hint speaks up, with the tap-me
	// hint clearing its throat a few seconds behind it
	if (currentFrame === EXPLORE_TIP_FRAME) {
		exploreTip.speak()
		startTapTipSoon()
	}

	updateFollowTarget()
	syncOpeningDolly()
}

useRafFn(() => {
	advanceBeatClock()
	renderFrame()
	// After the camera settles: the hint bubbles ride their dancers
	exploreTip.update()
	tapTip.update()
})

// --- Beat-sync tuning & debugging ---

// The step grid felt off the music, so the visuals run on a shifted clock:
// the whole timeline — frame 0's first appearance included — lands
// FRAME_OFFSET frame-slots away from its tapped time. Positive delays,
// negative sends ahead of the beat. Overridable live with ?offset=N to
// compare candidates without an edit.
const searchParams = new URLSearchParams(location.search)
const offsetParam = Number(searchParams.get('offset') ?? NaN)
const FRAME_OFFSET = Number.isFinite(offsetParam) ? offsetParam : -2

// One frame-slot: an eighth of the average tapped beat. The grid sways a
// few ms around it, less than anyone can hear at a quarter-beat shift.
const FRAME_SLOT =
	(BEAT_TIMES[BEAT_TIMES.length - 1]! - BEAT_TIMES[0]!) /
	(BEAT_TIMES.length - 1) /
	8

// --- The opening dolly ---
// The camera meets the first ring close up — five cells across the short
// side — and pulls out to rest with fifteen cells across the LONG side,
// from the head of turn 1 to the head of turn 8, sailing past the unlock
// (turn 5): a gesture on the now-interactive stage simply interrupts it,
// via onNavigate below. Ease-in-out, and stepped on the tile frame clock
// rather than glided per-rAF: the camera breathes on the same pulse as
// the dance.
const DOLLY_FROM_CELLS = 5
const DOLLY_TO_LONG_CELLS = 15
const DOLLY_FROM_FRAME = 0
const DOLLY_TO_FRAME = 56
let dollyDone = false

// The dolly owns the camera only while nothing else wants it: the first
// gesture (possible once the stage unlocks at its last step) takes over
zui.onNavigate(() => {
	dollyDone = true
})

function easeInOutCubic(t: number): number {
	return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

// Called on every frame tick (catch-up bursts included — it only reads
// currentFrame, so replays land on the same camera)
function syncOpeningDolly() {
	if (dollyDone) return
	if (zui.followTarget.value) {
		dollyDone = true
		return
	}
	const progress =
		(currentFrame - DOLLY_FROM_FRAME) / (DOLLY_TO_FRAME - DOLLY_FROM_FRAME)
	// setOpeningCells speaks short-side cells; the resting shot is set in
	// LONG-side cells, so convert by the screen's aspect (a portrait phone
	// and a landscape desktop rest on the same fifteen-cell sweep)
	const long = Math.max(winWidth.value, winHeight.value)
	const toCells = long
		? (DOLLY_TO_LONG_CELLS * Math.min(winWidth.value, winHeight.value)) /
			long
		: DOLLY_TO_LONG_CELLS
	if (progress >= 1) {
		zui.setOpeningCells(toCells)
		dollyDone = true
		return
	}
	const eased = easeInOutCubic(Math.max(progress, 0))
	zui.setOpeningCells(DOLLY_FROM_CELLS + (toCells - DOLLY_FROM_CELLS) * eased)
}

// A blue dot at the screen centre on every beat — of the TAPPED GRID, not
// the offset visuals, so grid, dancers and music can be judged against each
// other. Off by default; ?beat turns it on.
const beatDebug = searchParams.has('beat')
const beatFlash = ref(false)
// Ticks once per visible turn — the instant a new pattern is applied — for
// anything that dances along (the launchpad's queued pad pulses with it).
// Bumped in tickFrame, so it lives on the visuals' shifted clock.
const beatSeq = ref(0)
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

	// Two device pixels per CSS pixel is where the eye stops collecting —
	// phone screens run DPR 2.75-3, and the shader's five-tap min-blend at
	// native resolution is fill-rate the piece cannot afford there
	const dpr = Math.min(window.devicePixelRatio, 2)
	const width = Math.round(canvasWidth.value * dpr)
	const height = Math.round(canvasHeight.value * dpr)
	if (!width || !height) return

	// Settle the camera (flick glide, follow) right before the draw is issued
	zui.syncCamera()

	// While a dancer is watched, the rest of the crowd recedes toward
	// the paper — through the boiling crayon veil (see tile.frag).
	// Eased per rendered frame.
	const sel = selection.value
	focusDim += ((sel ? FOCUS_DIM : 0) - focusDim) * 0.12

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

	// Whatever this tap does, the current hint bubbles have been heard
	exploreTip.dismiss()
	tapTip.dismiss()

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

	// A dancer got tapped: the tap-me hint's lesson has landed for good
	tapTip.stop()

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

	// The title's own art comes before everything: nothing heavy starts
	// until its ink is up. (The audio's fetch has already left — it starts
	// with the composable — but at 0.3MB the title still wins the race.)
	await new Promise<void>(resolve => {
		const title = new Image()
		title.onload = () => resolve()
		// A missing title is the title component's problem, not the gate's
		title.onerror = () => resolve()
		title.src = '/animondo/title-sprite.webp'
	})

	// Then the whole manifest, behind the title screen's loading dots. The
	// sprites' bytes come back here for the renderer to decode. Mobile
	// takes the half-size sprites and the worker's atlas mode — every
	// frame pre-uploaded once at start, no per-beat decode or upload.
	// ?atlas forces it anywhere, for testing.
	const halfSprites =
		matchMedia('(pointer: coarse)').matches || searchParams.has('atlas')
	const spriteBuffers = await preloadAssets(halfSprites)

	// Sprite order follows ARTISTS so the index the tile map stores keeps
	// addressing the same artist. Laura and Lucija may rejoin later — adding
	// them to ARTIST_IDS pulls their sprite in too, but the shader still
	// needs matching video8/video9 uniforms.
	renderer = await createTileRenderer(canvasElement, {
		frag: TileFragmentShader,
		sources: ARTISTS.map(
			({id}) => `sprites${halfSprites ? '-half' : ''}/${id}.mp4`
		),
		atlas: halfSprites,
		spriteBuffers,
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
		// The opening is choreographed — the recording's first fourteen
		// turns, kept as the piece's own cut. The wait for the music's
		// entrance is the beat grid's own: no frame ticks before the first
		// tapped beat (~2.2s in), so the first ring lands exactly on beat
		// one. The head yield must be EMPTY — the opening bridge is built
		// from the first two yields and shows before any tick, and a mask
		// there parks visible dancers on screen through the wait. From
		// empty, the pre-beat bridge is Birth tiles on their blank first
		// frame. Births in turn k come from yield k+1's out: turns 1-7
		// grow the rings (2x2 .. 14x14), turn 8 floods the rest, and
		// turns 9-14 run the round dance — clockwise again, its reverse,
		// then the four lane weaves.
		yield Patterns.empty

		// The cut is a default, never a lock-out: opening the pads, or any
		// key/pad press once the stage unlocks (turn 5), takes the floor
		// at the next beat
		const opening: MovePattern[] = [
			...Array.from({length: 7}, (_, i) =>
				Patterns.radialMask(Patterns.clockwise, i + 1)
			),
			Patterns.clockwise,
			Patterns.clockwise,
			Patterns.counterClockwise,
			Patterns.upDown,
			Patterns.downUp,
			Patterns.leftRight,
			Patterns.rightLeft,
		]
		for (const pattern of opening) {
			if (launchpadOpen.value || patternControl.hasPressed()) break
			yield pattern
		}

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

	// Only invite the visitor in once everything is truly in hand — the
	// music decoded (a rejection here is a startup failure: the piece has
	// no clock without it) and the typefaces settled. Fonts get a deadline:
	// a Typekit outage should not leave the page with no way to start.
	await audio.whenLoaded
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

// The crawlers' copy of this metadata is static and bilingual — see
// nuxt.config.ts. At runtime it follows the chosen language, for the tab
// and for crawlers that do run JS.
useSeoMeta({
	// The chosen language leads; the other name stays for recognition
	title: () =>
		locale.value === 'ja' ? 'アニm音頭 | Animondo' : 'Animondo | アニm音頭',
	description: () => t('meta.description'),
	ogTitle: () =>
		locale.value === 'ja' ? 'アニm音頭 | Animondo' : 'Animondo | アニm音頭',
	ogDescription: () => t('meta.description'),
})

useHead({
	htmlAttrs: {lang: locale},
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
	// The bio may scroll, but no double-tap zoom (pinch is refused app-wide
	// in app.vue)
	touch-action pan-y
	// Hand-drawn frame: one square drawing carries the four corners, the
	// repeating edges and the white fill (border-image-slice `fill`). The
	// source is 1024px with 128px slices shown at 24px (1.5x the drawn
	// contract's 1/8 scale — the line read too thin), so a 2x screen still
	// samples it ~2.7:1 — see scripts/build-bubble-samples.py.
	// The band is layout only — the drawing itself lives on the __skin
	// layers below, whose boil is an opacity turn instead of a border-image
	// swap (which re-rasterized and flickered on cold caches)
	border 24px solid transparent
	text-align center
	line-height 1.5

	// The drawn frame, four standing layers deep — see bubble-skin-turn.
	// Each carries the whole 1024px drawing (same 24px band and slices as
	// the element's own contract) with its paper fill; inset -24px lands the
	// layer's band exactly over the element's transparent one.
	&__skin
		position absolute
		inset -24px
		z-index -1
		border 24px solid transparent
		border-image url('/animondo/bubble/frame_0.webp') 128 fill round
		animation bubble-skin-turn 0.3333s steps(1) infinite
		animation-delay -0.3333s
		pointer-events none

		&--1
			border-image-source url('/animondo/bubble/frame_1.webp')
			animation-delay -0.25s

		&--2
			border-image-source url('/animondo/bubble/frame_2.webp')
			animation-delay -0.1667s

		&--3
			border-image-source url('/animondo/bubble/frame_3.webp')
			animation-delay -0.0833s

	// Tail: its own drawing (tip pointing down), whose white fill masks the
	// border line running behind it. Rotated per side below.
	&::after
		content ''
		position absolute
		width 54px
		height 54px
		background url('/animondo/bubble/tail.webp') 0 0 / 400% 100% no-repeat
		animation bubble-sheet-boil 0.3333s steps(1) infinite

	// Bubble above the character — tail below, pointing down. The 51px
	// offset (from the padding box) leaves the tail's root just touching
	// the border line rather than sinking into the balloon — everything at
	// 1.5x the drawn contract, like the border. --tail-pos (from
	// bubbleStyle, padding-box coordinates) slides the tail along the edge
	// toward the character; without it, the tail sits in the middle.
	&--top
		&::after
			bottom -51px
			left var(--tail-pos, 50%)
			translate -50% 0

	&--bottom
		&::after
			top -51px
			left var(--tail-pos, 50%)
			translate -50% 0
			rotate 180deg

	// Bubble to the right of the character — tail on the left edge
	&--right
		&::after
			left -51px
			top var(--tail-pos, 50%)
			translate 0 -50%
			rotate 90deg

	&--left
		&::after
			right -51px
			top var(--tail-pos, 50%)
			translate 0 -50%
			rotate -90deg

	// While the enter/leave steps resize the box, the contents would spill
	// out of the half-grown frame — hide them. The tail is a pseudo element
	// (not matched by >*), and the frame lives on the __skin layers, so
	// both stay and ride along on the moving edges.
	&--sizing > *:not(.profile-bubble__skin)
		visibility hidden

	// Top row: the language switch sitting just left of the drawn ×
	&__controls
		display flex
		align-items center
		justify-content flex-end
		gap 0.5rem

	// Scaled by font-size alone — the words are 4em x 2em (LocaleSwitch)
	&__lang
		font-size 0.72rem

	// The drawn × (80px source shown at ~28px, boiling like the frame)
	&__close
		flex none
		width 1.75rem
		height 1.75rem
		padding 0
		border none
		position relative
		background none
		cursor pointer

		// The drawing itself: a 1.25rem box paging the 4F sheet, centred in
		// the button's larger hit area
		&::before
			content ''
			position absolute
			inset 0
			margin auto
			width 1.25rem
			height 1.25rem
			background url('/animondo/bubble/close.webp') 0 0 / 400% 100% no-repeat
			animation bubble-sheet-boil 0.3333s steps(1) infinite

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
		background url('/animondo/bubble/web.webp') 0 0 / 400% 100% no-repeat
		animation bubble-sheet-boil 0.3333s steps(1) infinite

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
			mask url('/animondo/bubble/thumb-mask.webp') 0 0 / 400% 100% no-repeat
			animation bubble-thumb-boil 0.3333s steps(1) infinite

		// Quieter than the prose: smaller and paler, so the caption reads as
		// a label on the still rather than part of the bio
		figcaption
			margin-top 0.25rem
			font-size 0.7rem
			color #a8a8a8

			// The title leans, film-title style. No italic face exists, so
			// the browser's synthetic italic stands in — font-style (unlike
			// the About wordmark's transform trick) keeps the run inline,
			// so a long title still wraps mid-title. Plain `italic` only:
			// `oblique <angle>` parses as valid in Chrome but renders
			// UPRIGHT (no synthesis at custom angles), so an angled
			// "refinement" here would silently undo the slant. Verified
			// against the actual BBBSprat OTF in Chrome 151.
			i
				font-style italic

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

// The skin layer's quarter-turn: shown through its own drawn frame, gone
// for the other three — each layer starts phase-shifted a frame apart.
// VISIBILITY, not opacity: Safari stops painting border-image on an
// element whose own opacity is keyframe-animated (the layer composites
// empty) — visibility steps the same way and keeps the drawing.
@keyframes bubble-skin-turn
	0%
		visibility visible
	25%
		visibility hidden
	100%
		visibility hidden

// Every 4F sheet (tail, close, web) pages the same way
@keyframes bubble-sheet-boil
	0%
		background-position 0% 0
	25%
		background-position 33.3333% 0
	50%
		background-position 66.6667% 0
	75%
		background-position 100% 0

@keyframes bubble-thumb-boil
	0%
		mask-position 0% 0
	25%
		mask-position 33.3333% 0
	50%
		mask-position 66.6667% 0
	75%
		mask-position 100% 0

</style>
