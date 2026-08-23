import type Regl from 'regl'

import {demuxMp4Video} from '~/utils/mp4Demux'

import {useVideoTexture} from './useVideoTexture'

interface Backend {
	prepare: (frameNumber: number) => Promise<void>
	present: (frameNumber: number) => Promise<void>
}

/**
 * The eight artist sprites as regl textures, one frame at a time.
 *
 * The preferred backend decodes through WebCodecs: the sprites are all-intra
 * H.264, so any frame is one EncodedVideoChunk fed to a VideoDecoder and one
 * flush() away — deterministic, no currentTime convergence, no seek jank.
 * Only the current frame ever lives on the GPU, so memory stays at one
 * texture per artist, same as the video element ever offered.
 *
 * Browsers without VideoDecoder fall back to the old <video> + seek path.
 */
export function useVideoTextureArray(regl: Regl.Regl, videoSources: string[]) {
	const textureArray = ref<Regl.Texture2D[]>([])
	let backend: Backend | null = null

	const load = async () => {
		if (typeof VideoDecoder !== 'undefined') {
			try {
				backend = await loadCodecBackend(regl, videoSources, textureArray)
				return
			} catch (error) {
				console.warn('WebCodecs path failed, falling back to <video>', error)
			}
		}
		backend = await loadElementBackend(regl, videoSources, textureArray)
	}

	return {
		textureArray,
		load,
		/** Start decoding a frame so present() can push it instantly */
		prepare: (frameNumber: number) =>
			backend?.prepare(frameNumber) ?? Promise.resolve(),
		/** Upload a frame to every texture at once */
		present: (frameNumber: number) =>
			backend?.present(frameNumber) ?? Promise.resolve(),
		setFrame: (frameNumber: number) =>
			backend?.present(frameNumber) ?? Promise.resolve(),
	}
}

// --- WebCodecs backend ---

interface CodecSprite {
	texture: Regl.Texture2D
	decoder: VideoDecoder
	chunks: EncodedVideoChunk[]
	/** Decoded frames waiting for upload, keyed by frame index */
	frames: Map<number, VideoFrame>
	/** Serializes decode+flush per sprite */
	chain: Promise<void>
}

async function loadCodecBackend(
	regl: Regl.Regl,
	videoSources: string[],
	textureArray: Ref<Regl.Texture2D[]>
): Promise<Backend> {
	// One scratch canvas carries frames into regl; VideoFrame is not a pixel
	// source regl recognises, but canvas is.
	const canvas = document.createElement('canvas')
	const context = canvas.getContext('2d')
	if (!context) throw new Error('no 2d context')

	const sprites = await Promise.all(
		videoSources.map(async (src): Promise<CodecSprite> => {
			const response = await fetch('/animondo/' + src)
			if (!response.ok) throw new Error(`${src}: HTTP ${response.status}`)
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
			if (!supported) throw new Error(`${src}: ${video.codec} unsupported`)

			const sprite: CodecSprite = {
				texture: null as unknown as Regl.Texture2D,
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
			}

			sprite.decoder = new VideoDecoder({
				output: frame => {
					sprite.frames.get(frame.timestamp)?.close()
					sprite.frames.set(frame.timestamp, frame)
				},
				error: error => console.error(`${src}:`, error),
			})
			sprite.decoder.configure(config)

			// Prime frame 0 so the texture is born with real content
			sprite.decoder.decode(sprite.chunks[0]!)
			await sprite.decoder.flush()
			const first = sprite.frames.get(0)!
			canvas.width = video.width
			canvas.height = video.height
			context.drawImage(first, 0, 0)
			first.close()
			sprite.frames.delete(0)
			sprite.texture = regl.texture(canvas)

			return sprite
		})
	)

	textureArray.value = sprites.map(sprite => sprite.texture)

	function ensure(sprite: CodecSprite, frameNumber: number) {
		sprite.chain = sprite.chain
			.then(async () => {
				if (sprite.frames.has(frameNumber)) return
				// Anything else still stored was skipped over; let it go
				for (const [index, frame] of sprite.frames) {
					frame.close()
					sprite.frames.delete(index)
				}
				sprite.decoder.decode(sprite.chunks[frameNumber]!)
				// flush() drains the decoder deterministically — all-intra
				// input means no inter-frame state is lost by doing so
				await sprite.decoder.flush()
			})
			// A rejected link would poison the chain for good: every later
			// ensure would inherit the rejection and the pattern clock,
			// which waits on present(), would never step again. Absorb it —
			// one dropped frame beats a frozen automaton.
			.catch(error => console.error(error))
		return sprite.chain
	}

	return {
		prepare: async frameNumber => {
			await Promise.all(sprites.map(sprite => ensure(sprite, frameNumber)))
		},
		present: async frameNumber => {
			await Promise.all(sprites.map(sprite => ensure(sprite, frameNumber)))
			for (const sprite of sprites) {
				const frame = sprite.frames.get(frameNumber)
				if (!frame) continue
				context.drawImage(frame, 0, 0)
				sprite.texture.subimage(canvas)
				frame.close()
				sprite.frames.delete(frameNumber)
			}
		},
	}
}

// --- <video> fallback backend ---

async function loadElementBackend(
	regl: Regl.Regl,
	videoSources: string[],
	textureArray: Ref<Regl.Texture2D[]>
): Promise<Backend> {
	const videoTextures = videoSources.map(src => useVideoTexture(regl, src))
	await Promise.all(videoTextures.map(vt => vt.load()))
	textureArray.value = videoTextures
		.map(vt => vt.texture.value!)
		.filter(Boolean)

	return {
		prepare: async frameNumber => {
			await Promise.all(videoTextures.map(vt => vt.seekFrame(frameNumber)))
		},
		present: async frameNumber => {
			await Promise.all(videoTextures.map(vt => vt.seekFrame(frameNumber)))
			videoTextures.forEach(vt => vt.upload())
		},
	}
}
