/**
 * BGM playback through Web Audio. An HTMLAudioElement's `loop` rejoins with
 * an audible hiccup; an AudioBufferSourceNode loops sample-accurately. The
 * track plays once from the top, then cycles the region from LOOP_START to
 * the end of the buffer, seamlessly.
 *
 * Codec choice is about the seam, not seeking — the whole file is decoded
 * into an AudioBuffer up front, so the loop jump is instant and
 * sample-accurate whatever the source format. But lossy codecs carry an
 * encoder delay at the head and padding at the tail, and whether
 * decodeAudioData strips them is up to the browser; when it doesn't, the
 * loop points shift and the seam breaks (measured: Chrome decodes AAC 928
 * samples long).
 *   - Ogg Opus: the spec REQUIRES decoders to trim head and tail exactly
 *     (verified sample-exact against the master WAV in Chrome). First
 *     choice.
 *   - AAC (afconvert): fallback for browsers whose decodeAudioData cannot
 *     read Ogg Opus (Safari before 18.4) — Apple's own decoder honours
 *     Apple's gapless metadata.
 * Re-encode from the master (videos/kawachiondo_loop.wav) with:
 *   ffmpeg -i videos/kawachiondo_loop.wav -c:a libopus -b:a 160k \
 *     public/kawachiondo_loop.opus
 *   afconvert -f m4af -d aac -b 192000 videos/kawachiondo_loop.wav \
 *     public/kawachiondo_loop.m4a
 */

// Where the loop rejoins when playback reaches the end: frame 891 at 60 fps,
// counting from 0
const LOOP_START = 891 / 60

export function useKawachiAudio() {
	const context = new AudioContext()
	const gain = context.createGain()
	gain.connect(context.destination)

	// Fetching and decoding need no user gesture — only playback does — so
	// the buffer is usually ready by the time the visitor taps play. Only
	// one file is ever downloaded: the fallback fetch happens after the
	// Opus decode has already failed.
	const SOURCES = [
		'/animondo/kawachiondo_loop.opus',
		'/animondo/kawachiondo_loop.m4a',
	]

	const buffer = (async () => {
		let lastError: unknown
		for (const url of SOURCES) {
			try {
				const response = await fetch(url)
				return await context.decodeAudioData(await response.arrayBuffer())
			} catch (error) {
				lastError = error
			}
		}
		throw lastError
	})()

	let source: AudioBufferSourceNode | null = null
	let startedAt: number | null = null
	let bufferDuration = 0

	const hasStarted = ref(false)
	const muted = ref(false)

	function toggleMuted() {
		muted.value = !muted.value
		// A short ramp instead of a hard jump, which can click
		const now = context.currentTime
		gain.gain.cancelScheduledValues(now)
		gain.gain.setValueAtTime(gain.gain.value, now)
		gain.gain.linearRampToValueAtTime(muted.value ? 0 : 1, now + 0.02)
	}

	const playPromise: PromiseWithResolvers<void> = Promise.withResolvers()

	// Die with the component: an HMR remount otherwise leaves the old
	// source playing underneath the new one
	onScopeDispose(() => {
		source?.stop()
		source = null
		context.close()
	})

	return {
		start: async () => {
			source = context.createBufferSource()
			source.buffer = await buffer
			source.loop = true
			source.loopStart = LOOP_START
			source.loopEnd = source.buffer.duration
			source.connect(gain)
			// The context is born suspended; start() runs inside the visitor's
			// tap, which is the gesture that lets it resume
			await context.resume()
			source.start()
			startedAt = context.currentTime
			bufferDuration = source.buffer.duration
			hasStarted.value = true
			playPromise.resolve()
		},
		stop: () => {
			source?.stop()
			source = null
		},
		waitForPlay: () => playPromise.promise,
		/** Settled once the BGM is fetched and decoded — the loading gate
		 * waits on it so the tap never has to. Rejects if no source could
		 * be decoded, which the caller treats as a startup failure. */
		whenLoaded: buffer.then(() => undefined),
		hasStarted: readonly(hasStarted),
		/** Seconds since playback began, monotonic — the piece's only clock */
		elapsed: () => (startedAt === null ? 0 : context.currentTime - startedAt),
		duration: () => bufferDuration,
		/** Where playback rejoins after the first full pass */
		loopStart: LOOP_START,
		muted: readonly(muted),
		toggleMuted,
	}
}
