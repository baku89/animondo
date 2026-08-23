import type Regl from 'regl'

import {useVideoTexture} from './useVideoTexture'

export function useVideoTextureArray(regl: Regl.Regl, videoSources: string[]) {
	const videoTextures = videoSources.map(src => useVideoTexture(regl, src))
	const textureArray = ref<Regl.Texture2D[]>([])

	const load = async () => {
		// Load all videos in parallel
		await Promise.all(videoTextures.map(vt => vt.load()))

		// Collect all textures
		textureArray.value = videoTextures
			.map(vt => vt.texture.value!)
			.filter(Boolean)
	}

	// Seeking is slow (tens of ms) and uploading is instant, so the two are
	// split: prepare() sends every video toward a frame ahead of time, and
	// present() pushes all textures at once — synchronously, when the seek
	// has already converged. Presenting reactively at the boundary left the
	// previous frame on screen while the seek caught up, which flashed
	// frame 7 at the start of every beat.
	let pending: {frame: number; promise: Promise<void>} | null = null

	const prepare = (frameNumber: number, fps: number = 12) => {
		if (pending?.frame === frameNumber) return pending.promise
		const promise = Promise.all(
			videoTextures.map(videoTexture => videoTexture.seekFrame(frameNumber, fps))
		).then(() => undefined)
		pending = {frame: frameNumber, promise}
		return promise
	}

	const present = async (frameNumber: number, fps: number = 12) => {
		// Resolved already when the frame was prepared in time; otherwise
		// this degrades to seek-then-upload, a beat late but never wrong.
		await prepare(frameNumber, fps)
		videoTextures.forEach(videoTexture => videoTexture.upload())
	}

	const setFrame = (frameNumber: number, fps: number = 12) =>
		present(frameNumber, fps)

	return {
		textureArray,
		load,
		prepare,
		present,
		setFrame,
	}
}
