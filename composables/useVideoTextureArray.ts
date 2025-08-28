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

	const setFrame = (frameNumber: number, fps: number = 12) => {
		for (const videoTexture of videoTextures) {
			videoTexture.setFrame(frameNumber, fps)
		}
	}

	return {
		textureArray,
		load,
		setFrame,
	}
}
