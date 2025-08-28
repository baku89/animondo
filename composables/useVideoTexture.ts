import type Regl from 'regl'

export function useVideoTexture(regl: Regl.Regl, videoSrc: string) {
	const video = ref<HTMLVideoElement | null>(null)
	const texture = ref<Regl.Texture2D | null>(null)

	const load = async () => {
		// Create video element
		const videoElement = document.createElement('video')
		videoElement.src = '/eu-japan-animation-residency-collab/' + videoSrc
		videoElement.muted = true
		videoElement.crossOrigin = 'anonymous'
		videoElement.playsInline = true
		videoElement.autoplay = true

		video.value = videoElement

		// Wait for video to be ready
		await new Promise<void>(resolve => {
			videoElement.addEventListener('canplay', () => resolve(), {once: true})
			videoElement.load()
		})

		// Create texture
		texture.value = regl.texture(videoElement)
	}

	const getUpdatedTexture = () => {
		if (!texture.value || !video.value) return null

		try {
			texture.value.subimage(video.value)
			return texture.value
		} catch {
			return texture.value
		}
	}

	const setFrame = (frameNumber: number, fps: number = 12) => {
		if (!texture.value || !video.value) return

		const timeInSeconds = frameNumber / fps
		video.value.currentTime = timeInSeconds

		return getUpdatedTexture()
	}

	// Clean up on unmount
	onUnmounted(() => {
		if (video.value) {
			video.value.pause()
			video.value.src = ''
		}
		if (texture.value) {
			texture.value.destroy()
		}
	})

	return {
		texture,
		load,
		getUpdatedTexture,
		setFrame,
	}
}
