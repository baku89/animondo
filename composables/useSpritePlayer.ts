/**
 * Marker-driven playback for the hand-drawn sprite sheets.
 *
 * Sections come from the After Effects markers: each runs from its own frame
 * up to the frame before the next marker. The names carry the state machine,
 * so none has to be declared separately:
 *
 *   <state>-loop   cycles until something asks for another state
 *   <a>-to-<b>     the one-shot between two states, played backwards when the
 *                  move is b -> a, since the artist only draws it once
 *   appear         played on arrival, then falls into the starting loop
 */
export interface SpriteSheet {
	url: string
	frames: number
	columns: number
	/** Frame each section starts on, exactly as marked in After Effects */
	markers: Record<string, number>
}

export const OUTLINE_SHEET: SpriteSheet = {
	url: '/animondo/icons/circle-icon_outline.webp',
	frames: 25,
	columns: 5,
	markers: {appear: 0, 'fixed-loop': 11, 'fixed-to-hover': 17, 'hover-loop': 19},
}

export const ABOUT_SHEET: SpriteSheet = {
	url: '/animondo/icons/circle-icon_about.webp',
	frames: 30,
	columns: 6,
	markers: {appear: 0, 'about-loop': 11, 'about-to-close': 17, 'close-loop': 24},
}

export const PLAY_SHEET: SpriteSheet = {
	url: '/animondo/icons/circle-icon_play.webp',
	frames: 18,
	columns: 5,
	// Spelled as the marker is
	markers: {appear: 0, 'fixed-loop': 6, dissapear: 10},
}

export const SOUND_SHEET: SpriteSheet = {
	url: '/animondo/icons/circle-icon_sound.webp',
	frames: 29,
	columns: 6,
	markers: {
		appear: 0,
		'unmute-loop': 11,
		'unmute-to-mute': 21,
		'mute-loop': 25,
	},
}

interface Section {
	from: number
	/** Inclusive */
	to: number
}

export function createSpritePlayer(sheet: SpriteSheet, initialState: string) {
	const names = Object.keys(sheet.markers).sort(
		(a, b) => sheet.markers[a]! - sheet.markers[b]!
	)

	const sections: Record<string, Section> = {}
	names.forEach((name, i) => {
		const next = names[i + 1]
		sections[name] = {
			from: sheet.markers[name]!,
			to: (next === undefined ? sheet.frames : sheet.markers[next]!) - 1,
		}
	})

	let state = initialState
	let section: Section = sections.appear!
	let frame = section.from
	let reverse = false
	let looping = false
	/** Section to settle into once a one-shot ends; null means it is the last */
	let then: string | null = `${initialState}-loop`
	let done = false

	function begin(name: string, opts: {reverse?: boolean; then?: string} = {}) {
		section = sections[name]!
		reverse = opts.reverse ?? false
		frame = reverse ? section.to : section.from
		looping = name.endsWith('-loop')
		then = opts.then ?? null
	}

	function tick() {
		if (looping) {
			// Run it round. Interrupting is always allowed, so nothing here
			// waits for the cycle to come back to its start.
			frame = frame < section.to ? frame + 1 : section.from
			return
		}

		const atEnd = reverse ? frame <= section.from : frame >= section.to
		if (!atEnd) {
			frame += reverse ? -1 : 1
		} else if (then !== null) {
			begin(then)
		} else {
			done = true
		}
	}

	/**
	 * Play the icon out. Where no leaving animation was drawn, arriving runs
	 * backwards instead — which is the plan for the outline until one exists.
	 */
	function dismiss() {
		const leaving = ['dissapear', 'disappear'].find(name => name in sections)
		if (leaving) begin(leaving)
		else begin('appear', {reverse: true})
	}

	function setState(next: string) {
		if (next === state) return

		const from = state
		state = next

		if (`${from}-to-${next}` in sections) {
			begin(`${from}-to-${next}`, {then: `${next}-loop`})
		} else if (`${next}-to-${from}` in sections) {
			// The artist draws each pair once, so the return trip is that same
			// section run backwards.
			begin(`${next}-to-${from}`, {reverse: true, then: `${next}-loop`})
		} else {
			begin(`${next}-loop`)
		}
	}

	return {
		tick,
		setState,
		dismiss,
		sheet,
		/** True once a one-shot with nowhere to go has played its last frame */
		get done() {
			return done
		},
		get state() {
			return state
		},
		get frame() {
			return frame
		},
	}
}
