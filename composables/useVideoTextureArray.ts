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

	const setFrame = async (frameNumber: number, fps: number = 12) => {
		// Land every video on the frame first, then push all eight textures
		// together — per-video uploads staggered by seek latency, which
		// showed as a flash of the last frame at the top of each loop.
		await Promise.all(
			videoTextures.map(videoTexture => videoTexture.seekFrame(frameNumber, fps))
		)
		videoTextures.forEach(videoTexture => videoTexture.upload())
	}

	return {
		textureArray,
		load,
		setFrame,
	}
}
