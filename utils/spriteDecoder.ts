import {demuxMp4Video} from './mp4Demux'

/**
 * One artist sprite's WebCodecs pipeline, shared between the worker renderer
 * and the main-thread fallback. The sprites are all-intra H.264, so any frame
 * is one EncodedVideoChunk fed to the decoder and one flush() away —
 * deterministic, no currentTime convergence, no seek jank.
 */
export interface SpriteDecoder {
	decoder: VideoDecoder
	chunks: EncodedVideoChunk[]
	/** Decoded frames waiting for upload, keyed by frame index */
	frames: Map<number, VideoFrame>
	/** Serializes decode+flush per sprite */
	chain: Promise<void>
	width: number
	height: number
}

/** Fetch, demux and configure one sprite. Throws where the browser cannot
 * decode it, so the caller can fall back before anything is committed. */
export async function createSpriteDecoder(url: string): Promise<SpriteDecoder> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
	const buffer = await response.arrayBuffer()
	const video = demuxMp4Video(buffer)

	const config = {
		codec: video.codec,
		codedWidth: video.width,
		codedHeight: video.height,
		description: video.description,
		optimizeForLatency: true,
	}
	const {supported} = await VideoDecoder.isConfigSupported(config)
	if (!supported) throw new Error(`${url}: ${video.codec} unsupported`)

	const sprite: SpriteDecoder = {
		decoder: null as unknown as VideoDecoder,
		chunks: video.samples.map(
			(sample, index) =>
				new EncodedVideoChunk({
					type: sample.key ? 'key' : 'delta',
					timestamp: index,
					data: new Uint8Array(buffer, sample.offset, sample.size),
				})
		),
		frames: new Map(),
		chain: Promise.resolve(),
		width: video.width,
		height: video.height,
	}

	sprite.decoder = new VideoDecoder({
		output: frame => {
			sprite.frames.get(frame.timestamp)?.close()
			sprite.frames.set(frame.timestamp, frame)
		},
		error: error => console.error(`${url}:`, error),
	})
	sprite.decoder.configure(config)

	return sprite
}

/**
 * Decode a frame so it sits in `sprite.frames`, unless it already does.
 * flush() drains the decoder deterministically — all-intra input means no
 * inter-frame state is lost by doing so.
 *
 * The decoder takes one frame at a time, so calls must not overlap — either
 * go through ensureDecoded() below, or (like the worker, which layers an
 * upload step into the same links) keep a chain of your own. Never call this
 * from inside a link of `sprite.chain`: it would wait on itself.
 */
export async function decodeFrame(
	sprite: SpriteDecoder,
	frameNumber: number
): Promise<void> {
	if (sprite.frames.has(frameNumber)) return
	// Anything else still stored was skipped over; let it go
	for (const [index, frame] of sprite.frames) {
		frame.close()
		sprite.frames.delete(index)
	}
	sprite.decoder.decode(sprite.chunks[frameNumber]!)
	await sprite.decoder.flush()
}

/** Queue a decode on the sprite's own chain */
export function ensureDecoded(
	sprite: SpriteDecoder,
	frameNumber: number
): Promise<void> {
	sprite.chain = sprite.chain
		.then(() => decodeFrame(sprite, frameNumber))
		// A rejected link would poison the chain for good: every later
		// ensure would inherit the rejection and the pattern clock,
		// which waits on present(), would never step again. Absorb it —
		// one dropped frame beats a frozen automaton.
		.catch(error => console.error(error))
	return sprite.chain
}
