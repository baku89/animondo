export function useKawachiAudio() {
	const audio = new Audio('/animondo/kawachiondo.mp3')
	audio.loop = true

	const hasStarted = ref(false)
	const muted = ref(false)

	function toggleMuted() {
		muted.value = !muted.value
		audio.muted = muted.value
	}

	const playPromise: PromiseWithResolvers<void> = Promise.withResolvers()

	return {
		start: async () => {
			await audio.play()
			hasStarted.value = true
			playPromise.resolve()
		},
		stop: () => {
			audio.pause()
		},
		waitForPlay: () => playPromise.promise,
		hasStarted: readonly(hasStarted),
		muted: readonly(muted),
		toggleMuted,
	}
}
