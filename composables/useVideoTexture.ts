import type Regl from 'regl'

export function useVideoTexture(regl: Regl.Regl, videoSrc: string) {
	const video = ref<HTMLVideoElement | null>(null)
	const texture = ref<Regl.Texture2D | null>(null)

	const load = async () => {
		// Create video element
		const videoElement = document.createElement('video')
		videoElement.src = '/animondo/' + videoSrc
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

	const setFrame = async (frameNumber: number, fps: number = 12) => {
		if (!texture.value || !video.value) return

		const timeInSeconds = (frameNumber + 0.01) / fps
		video.value.currentTime = timeInSeconds

		// Wait for video to seek to the correct frame
		await new Promise<void>(resolve => {
			const checkTime = () => {
				if (Math.abs(video.value!.currentTime - timeInSeconds) < 0.1) {
					resolve()
				} else {
					requestAnimationFrame(checkTime)
				}
			}
			checkTime()
		})

		texture.value.subimage(video.value)
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
		setFrame,
	}
}
