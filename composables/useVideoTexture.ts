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

		// Create texture. Linear, not regl's nearest default — see the
		// worker's sprite textures
		texture.value = regl.texture({
			data: videoElement,
			mag: 'linear',
			min: 'linear',
		})
	}

	// Seek without uploading, so the caller can land every video first and
	// then push all textures in one go — uploading as each seek converges
	// lets a mix of old and new frames onto the screen.
	const seekFrame = async (frameNumber: number, fps: number = 12) => {
		if (!texture.value || !video.value) return

		const timeInSeconds = (frameNumber + 0.01) / fps
		video.value.currentTime = timeInSeconds

		// Half a frame of tolerance: the previous 0.1s accepted the
		// neighbouring frame's time as converged.
		await new Promise<void>(resolve => {
			const checkTime = () => {
				if (Math.abs(video.value!.currentTime - timeInSeconds) < 1 / 24) {
					resolve()
				} else {
					requestAnimationFrame(checkTime)
				}
			}
			checkTime()
		})
	}

	const upload = () => {
		if (texture.value && video.value) texture.value.subimage(video.value)
	}

	const setFrame = async (frameNumber: number, fps: number = 12) => {
		await seekFrame(frameNumber, fps)
		upload()
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
		seekFrame,
		upload,
		setFrame,
	}
}
