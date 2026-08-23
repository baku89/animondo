import type Regl from 'regl'

import type {SpriteDecoder} from '~/utils/spriteDecoder'
import {createSpriteDecoder, ensureDecoded} from '~/utils/spriteDecoder'

import {useVideoTexture} from './useVideoTexture'

interface Backend {
	prepare: (frameNumber: number) => Promise<void>
	present: (frameNumber: number) => Promise<void>
}

/**
 * The eight artist sprites as regl textures, one frame at a time — the
 * main-thread fallback for browsers that cannot run the worker renderer
 * (see useTileRenderer).
 *
 * The preferred backend decodes through WebCodecs (utils/spriteDecoder):
 * deterministic, no currentTime convergence, no seek jank. Only the current
 * frame ever lives on the GPU, so memory stays at one texture per artist,
 * same as the video element ever offered.
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

interface CodecSprite extends SpriteDecoder {
	texture: Regl.Texture2D
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

	// Fast path: texSubImage2D accepts a VideoFrame directly, so the frame
	// can go GPU-to-GPU into regl's texture. The 2D-canvas detour forces a
	// YUV-to-RGB conversion through the CPU — eight 1536x1024 blits per beat
	// frame, which is what made Safari crawl. regl's binding cache is kept
	// honest by restoring whatever texture it had bound.
	const gl = (regl as unknown as {_gl: WebGLRenderingContext})._gl
	let directUpload = typeof gl?.texSubImage2D === 'function'

	function uploadFrame(texture: Regl.Texture2D, frame: VideoFrame) {
		if (directUpload) {
			try {
				const handle = (
					texture as unknown as {_texture: {texture: WebGLTexture}}
				)._texture.texture
				const previous = gl.getParameter(gl.TEXTURE_BINDING_2D)
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
				gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
				gl.bindTexture(gl.TEXTURE_2D, handle)
				gl.texSubImage2D(
					gl.TEXTURE_2D,
					0,
					0,
					0,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					frame
				)
				gl.bindTexture(gl.TEXTURE_2D, previous)
				return
			} catch (error) {
				directUpload = false
				console.warn('direct VideoFrame upload failed, using canvas', error)
			}
		}
		context!.drawImage(frame, 0, 0)
		texture.subimage(canvas)
	}

	const sprites = await Promise.all(
		videoSources.map(async (src): Promise<CodecSprite> => {
			const decoder = await createSpriteDecoder('/animondo/' + src)

			// Prime frame 0 so the texture is born with real content
			await ensureDecoded(decoder, 0)
			const first = decoder.frames.get(0)!
			canvas.width = decoder.width
			canvas.height = decoder.height
			context.drawImage(first, 0, 0)
			first.close()
			decoder.frames.delete(0)

			// Linear, not regl's nearest default — see the worker's textures
			return {
				...decoder,
				texture: regl.texture({data: canvas, mag: 'linear', min: 'linear'}),
			}
		})
	)

	textureArray.value = sprites.map(sprite => sprite.texture)

	return {
		prepare: async frameNumber => {
			await Promise.all(sprites.map(sprite => ensureDecoded(sprite, frameNumber)))
		},
		present: async frameNumber => {
			await Promise.all(sprites.map(sprite => ensureDecoded(sprite, frameNumber)))
			for (const sprite of sprites) {
				const frame = sprite.frames.get(frameNumber)
				if (!frame) continue
				uploadFrame(sprite.texture, frame)
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
