export function useKawachiAudio() {
	const audio = new Audio(
		'/eu-japan-animation-residency-collab/kawachiondo.mp3'
	)
	audio.loop = true

	const hasStarted = ref(false)

	const playPromise = Promise.withResolvers<void>()

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
