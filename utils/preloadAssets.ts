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

const localized = (base: string, count: number) =>
	(['en', 'ja'] as const).flatMap(lang => frames(`${base}_${lang}`, count))

/** The artist sprites — fetched here, decoded by the renderer */
export const SPRITE_URLS = ARTISTS.map(({id}) => `/animondo/sprites/${id}.mp4`)

export const PRELOAD_URLS: string[] = [
	// The speech bubble's hand-drawn set (frame, fills, tail, controls)
	...[
		'frame',
		'frame-ink',
		'ink-orange',
		'fill-white',
		'fill-orange',
		'tail',
		'close',
		'web',
		'thumb-mask',
	].flatMap(name => frames(`/animondo/bubble/${name}`, 4)),
	// Tooltips: the balloon and its localized labels
	...frames('/animondo/tooltip/bubble', 8),
	...localized('/animondo/tooltip/sound-on', 4),
	...localized('/animondo/tooltip/explore_pc', 4),
	...localized('/animondo/tooltip/explore_mobile', 4),
	...localized('/animondo/tooltip/click-me', 4),
	...localized('/animondo/tooltip/tap-me', 4),
	// The title screen's play hint
	...localized('/animondo/label/click-to-play', 4),
	...localized('/animondo/label/tap-to-play', 4),
	// The language switch
	...frames('/animondo/lang/circle', 8),
	...frames('/animondo/lang/en', 4),
	...frames('/animondo/lang/ja', 4),
	// The round buttons
	...['about', 'outline', 'pads', 'play', 'sound'].map(
		name => `/animondo/icons/circle-icon_${name}.webp`
	),
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
	onProgress: (fraction: number) => void = () => {}
): Promise<ArrayBuffer[]> {
	const urls = [...SPRITE_URLS, ...PRELOAD_URLS]
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
	return buffers.slice(0, SPRITE_URLS.length)
}
