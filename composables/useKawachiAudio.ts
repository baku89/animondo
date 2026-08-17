export function useKawachiAudio() {
	const audio = new Audio('/animondo/kawachiondo.mp3')
	audio.loop = true

	const hasStarted = ref(false)

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
	}
}
