import {ARTISTS} from './artists'

/**
 * Everything the piece will ever show, fetched up front behind the title
 * screen's percentage. The play button only appears once all of it is in
 * the browser's hands — so nothing pops in half-drawn later.
 *
 * A NEW DRAWING ONLY JOINS THE LOADING GATE BY A LINE HERE. The lists
 * mirror the build scripts' outputs (scripts/build-*-frames.sh); keep them
 * in step.
 */

const frames = (base: string, count: number) =>
	Array.from({length: count}, (_, i) => `${base}_${i}.webp`)

/** One sheet per language — the boils page these by background-position */
const localized = (base: string) =>
	(['en', 'ja'] as const).map(lang => `${base}_${lang}.webp`)

/** The artist sprites — fetched here, decoded by the renderer. The atlas
 * renderer (mobile) takes the half-size set: scripts/build-half-sprites.sh */
export const spriteUrls = (half: boolean) =>
	ARTISTS.map(({id}) => `/animondo/sprites${half ? '-half' : ''}/${id}.mp4`)

export const PRELOAD_URLS: string[] = [
	// The speech bubble's hand-drawn set: the frame family stays as single
	// frames (border-image cannot page a sheet; those boils are stacked
	// layers), the rest are position-paged sheets
	...[
		'frame',
		'frame-ink',
		'fill-white',
		// The pads' colour families — keep in step with FAMILY_INK in
		// PatternLaunchpad.vue and scripts/build-bubble-frames.sh
		...[
			'blue',
			'sky',
			'mint',
			'green',
			'forest',
			'pink',
			'tangerine',
			'yellow',
		].flatMap(family => [`ink-${family}`, `fill-${family}`]),
	].flatMap(name => frames(`/animondo/bubble/${name}`, 4)),
	...['tail', 'close', 'web', 'thumb-mask'].map(
		name => `/animondo/bubble/${name}.webp`
	),
	// Tooltips: the balloon and its localized labels
	'/animondo/tooltip/bubble.webp',
	...localized('/animondo/tooltip/sound-on'),
	...localized('/animondo/tooltip/sound-off'),
	...localized('/animondo/tooltip/about'),
	...localized('/animondo/tooltip/pads'),
	...localized('/animondo/tooltip/explore_pc'),
	...localized('/animondo/tooltip/explore_mobile'),
	...localized('/animondo/tooltip/click-me'),
	...localized('/animondo/tooltip/tap-me'),
	// The title screen's play hint
	...localized('/animondo/label/click-to-play'),
	...localized('/animondo/label/tap-to-play'),
	// The language switch
	'/animondo/lang/circle.webp',
	'/animondo/lang/en.webp',
	'/animondo/lang/ja.webp',
	// The round buttons
	...['about', 'outline', 'pads', 'play', 'sound'].map(
		name => `/animondo/icons/circle-icon_${name}.webp`
	),
	// The pads' animated icons (12F sheets; several pads reuse one rotated,
	// and the inverted faces play their drawn duals — gather, pinch)
	...[
		'clockwise',
		'down',
		'gather',
		'hilbert',
		'lane-vertical',
		'pinch',
		'scatter',
		'shuffle',
		'spin',
		'spread-horizontal',
		'wave',
		'zigzag',
	].map(name => `/animondo/pad-icons/${name}.webp`),
	// The representative works in the profile bubbles
	...ARTISTS.map(({id}) => `/animondo/works/${id}.webp`),
	'/animondo/fade-mask.webp',
	'/animondo/logos.webp',
]

/**
 * Fetch the whole manifest, optionally streaming a 0..1 fraction into
 * onProgress as bytes arrive (sized by Content-Length; a header-less
 * response counts a flat guess). Resolves with the sprite mp4s' bytes — the
 * renderer decodes from them instead of fetching again. Everything else
 * lands in the HTTP cache for the CSS and <img> that ask later.
 */
export async function preloadAssets(
	halfSprites = false,
	onProgress: (fraction: number) => void = () => {}
): Promise<ArrayBuffer[]> {
	const sprites = spriteUrls(halfSprites)
	const urls = [...sprites, ...PRELOAD_URLS]
	const responses = await Promise.all(urls.map(url => fetch(url)))
	const failed = responses.find(response => !response.ok)
	if (failed) throw new Error(`${failed.url}: HTTP ${failed.status}`)

	const sizes = responses.map(
		response => Number(response.headers.get('content-length')) || 100_000
	)
	const total = sizes.reduce((sum, size) => sum + size, 0)
	let loaded = 0
	const report = () => onProgress(Math.min(loaded / total, 1))

	const buffers = await Promise.all(
		responses.map(async (response, index) => {
			if (!response.body) {
				const buffer = await response.arrayBuffer()
				loaded += sizes[index]!
				report()
				return buffer
			}

			const reader = response.body.getReader()
			const chunks: Uint8Array[] = []
			let received = 0
			for (;;) {
				const {done, value} = await reader.read()
				if (done) break
				chunks.push(value)
				received += value.byteLength
				loaded += value.byteLength
				report()
			}
			// Where Content-Length and the stream disagree, settle the ledger
			// so the bar still ends at its end
			loaded += sizes[index]! - received
			report()

			const buffer = new Uint8Array(received)
			let offset = 0
			for (const chunk of chunks) {
				buffer.set(chunk, offset)
				offset += chunk.byteLength
			}
			return buffer.buffer
		})
	)

	onProgress(1)
	return buffers.slice(0, sprites.length)
}
